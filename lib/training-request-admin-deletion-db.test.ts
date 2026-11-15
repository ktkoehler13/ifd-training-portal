import assert from "node:assert/strict";
import { before, after, beforeEach, afterEach, describe, it } from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { canManageDeletedRequests } from "./training-request-admin-deletion";

describe("Admin recoverable request deletion", () => {
  let db: PGlite; let requestId: string;
  async function asUser(email = "admin@example.test", role = "authenticated") {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ email, sub:"11111111-1111-4111-8111-111111111111", role })]);
    await db.exec(`set role ${role}`);
  }
  async function row() { return (await db.query("select *,updated_at::text as version from training_requests where id=$1",[requestId])).rows[0]; }
  async function change(deleted = true, reason = "Duplicate test request", version?: unknown) {
    return db.query("select * from admin_set_training_request_deleted($1,$2,$3,$4)",[requestId,version ?? (await row())?.version,deleted,reason]);
  }
  async function reject(run: () => Promise<unknown>, pattern: RegExp) {
    await db.exec("savepoint rejected_action");
    await assert.rejects(run,pattern);
    await db.exec("rollback to savepoint rejected_action; release savepoint rejected_action");
  }
  before(async () => {
    db = new PGlite();
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
      alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
      create schema auth; create table auth.users(id uuid primary key,email text unique);
      create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
      create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
      grant usage on schema auth,public to authenticated,anon,service_role;
      create schema storage;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
      create function storage.foldername(text) returns text[] language sql as $$ select string_to_array($1,'/') $$;
    `);
    for (const file of (await readdir("supabase/migrations")).filter(f=>f.endsWith(".sql")).sort()) await db.exec(await readFile(`supabase/migrations/${file}`,"utf8"));
    await db.exec(`insert into personnel(badge_number,email,first_name,last_name,role,active) values
      ('1','owner@example.test','Sample','Owner','firefighter',true),
      ('2','mto@example.test','Sample','MTO','mto',true),
      ('3','deputy@example.test','Sample','Deputy','deputy_chief',true),
      ('4','admin@example.test','Sample','Admin','admin',true),
      ('5','inactive@example.test','Inactive','Admin','admin',false);`);
  });
  beforeEach(async () => {
    await db.exec("reset role; begin"); await asUser("owner@example.test");
    requestId=String((await db.query("insert into training_requests(training_title,is_ofpc_course) values('Deletion test',false) returning id")).rows[0].id);
    await db.query("select submit_training_request($1)",[requestId]); await asUser();
  });
  afterEach(async () => { await db.exec("rollback;reset role"); });
  after(async () => { await db?.close(); });

  it("limits controls and RPCs to the active Admin role", async () => {
    assert.equal(canManageDeletedRequests("admin"),true);
    for (const role of ["firefighter","mto","deputy_chief"] as const) assert.equal(canManageDeletedRequests(role),false);
    const version=(await row()).version;
    for (const email of ["owner@example.test","mto@example.test","deputy@example.test","inactive@example.test"]) {
      await asUser(email); await reject(()=>change(true,"Reason",version), /Only active Admin|Active authenticated/);
    }
    await asUser("owner@example.test","anon");
    await reject(()=>change(true,"Reason",version),/permission denied/);
  });
  it("preserves all request details and adds actor, timestamp and reason to immutable history", async () => {
    const original=await row(); const previousActions=(await db.query("select * from training_request_actions where training_request_id=$1 order by id",[requestId])).rows;
    await change(); const removed=await row();
    assert.ok(removed.deleted_at); assert.equal(removed.deleted_by_name,"Sample Admin"); assert.equal(removed.deletion_reason,"Duplicate test request");
    for (const key of Object.keys(original)) if (!["deleted_at","deleted_by_personnel_id","deleted_by_name","deletion_reason","updated_at","version"].includes(key)) assert.deepEqual(removed[key],original[key],key);
    const actions=(await db.query("select * from training_request_actions where training_request_id=$1 order by id",[requestId])).rows;
    for (const action of previousActions) assert.deepEqual(actions.find(a=>a.id===action.id),action);
    const deleted=actions.find(a=>a.action==='request_deleted'); assert.equal(deleted?.actor_role,"admin"); assert.equal(deleted?.comments,"Duplicate test request");
    assert.equal((await db.query("update training_request_actions set comments='forged' where training_request_id=$1 returning id",[requestId])).rows.length,0);
  });
  it("hides deleted requests and history from requesters, MTO and Deputy Chief, then restores original visibility", async () => {
    await change(); const version=(await row()).version;
    for (const email of ["owner@example.test","mto@example.test","deputy@example.test"]) {
      await asUser(email); assert.equal(await row(),undefined);
      assert.equal((await db.query("select id from training_request_actions where training_request_id=$1",[requestId])).rows.length,0);
      await reject(()=>change(false,"Restore",version), /Only active Admin/);
    }
    await asUser(); await change(false,"Removed in error");
    assert.equal((await row()).deleted_at,null); assert.equal((await row()).status,"pending_mto");
    assert.equal((await db.query("select comments from training_request_actions where training_request_id=$1 and action='request_restored'",[requestId])).rows[0].comments,"Removed in error");
    await asUser("owner@example.test"); assert.ok(await row());
  });
  it("requires a reason and a current request version without partial changes", async () => {
    await reject(()=>change(true,"  "),/Enter a reason/);
    await reject(()=>change(true,"\n\t"),/Enter a reason/);
    await reject(()=>change(true,"x".repeat(1001)),/Enter a reason/);
    await reject(()=>change(true,"Reason","2000-01-01T00:00:00Z"),/request has changed/);
    assert.equal((await row()).deleted_at,null);
    await change(); await reject(()=>change(),/already been deleted/);
    await change(false); await reject(()=>change(false),/already been deleted or restored/);
  });
  it("prevents direct metadata changes, including Admin-owned drafts and forged session flags", async () => {
    const existing=requestId;
    requestId=String((await db.query("insert into training_requests(training_title) values('Admin draft') returning id")).rows[0].id);
    await db.exec("select set_config('app.allow_request_deletion','true',true)");
    await reject(()=>db.query("update training_requests set deleted_at=now() where id=$1",[requestId]),/dedicated action/);
    await reject(()=>db.query("insert into training_requests(training_title,deleted_at) values('Forged',now())"),/cannot be created as deleted/);
    await change(); await reject(()=>db.query("select delete_own_training_request_draft($1)",[requestId]),/Restore this request/);
    requestId=existing;
  });
  it("blocks stale workflow RPCs and new signature reservations for deleted requests", async () => {
    await change(); await asUser("mto@example.test");
    await reject(()=>db.query("select mto_return_training_request($1,'Correct dates')",[requestId]),/request is deleted/);
    await db.exec("reset role");
    await reject(()=>db.query("update training_requests set status='denied',current_action_role=null where id=$1",[requestId]),/request is deleted/);
    await reject(()=>db.query(`insert into training_request_signature_action_reservations(training_request_id,actor_personnel_id,actor_name,actor_badge_number,actor_role,expected_action)
      select $1,id,'Sample MTO','2','mto','mto_approved' from personnel where email='mto@example.test'`,[requestId]),/request is deleted/);
  });
  it("pauses queued mail and restores unsent action alerts without resending decisions", async () => {
    await change();
    assert.equal((await db.query("select status from training_request_notifications where training_request_id=$1",[requestId])).rows[0].status,"skipped");
    await db.exec("reset role");
    // Even a later settings operation that requeues an alert cannot send it.
    await db.query("update training_request_notifications set status='pending' where training_request_id=$1",[requestId]);
    assert.equal((await db.query("select * from claim_pending_training_request_notifications(10)")).rows.length,0);
    await db.query("update training_request_notifications set status='skipped' where training_request_id=$1",[requestId]);
    await asUser(); await change(false,"Resume review");
    assert.equal((await db.query("select status from training_request_notifications where training_request_id=$1",[requestId])).rows[0].status,"pending");
    await db.exec("reset role"); assert.equal((await db.query("select * from claim_pending_training_request_notifications(10)")).rows.length,1);
    await asUser(); await reject(()=>change(),/email delivery is in progress/);
  });
  it("waits for active signatures and form generation before deletion", async () => {
    await db.exec("reset role");
    await db.query(`insert into training_request_signature_action_reservations(training_request_id,actor_personnel_id,actor_name,actor_badge_number,actor_role,expected_action)
      select $1,id,'Sample MTO','2','mto','mto_approved' from personnel where email='mto@example.test'`,[requestId]);
    await asUser(); await reject(()=>change(),/signature action is in progress/);
    await db.exec("reset role"); await db.query("update training_request_signature_action_reservations set expires_at=now()-interval '1 minute' where training_request_id=$1",[requestId]);
    await db.query("insert into training_request_packets(request_id,storage_path,filename,status) values($1,$2,'forms.pdf','processing')",[requestId,`${requestId}/approved-packet.pdf`]);
    await asUser(); await reject(()=>change(),/forms are being prepared/);
  });
  it("retains approved packet metadata and storage objects through delete and restore", async () => {
    await db.exec("reset role");
    await db.query("update training_requests set status='approved',current_action_role=null where id=$1",[requestId]);
    await db.query("insert into training_request_packets(request_id,storage_path,filename,status,sha256,file_size_bytes,generated_at) values($1,$2,'forms.pdf','ready',$3,100,now())",[requestId,`${requestId}/approved-packet.pdf`,"a".repeat(64)]);
    await db.query("insert into storage.objects(bucket_id,name) values('training-request-packets',$1)",[`${requestId}/approved-packet.pdf`]);
    const packet=(await db.query("select * from training_request_packets where request_id=$1",[requestId])).rows[0];
    await db.query("update training_request_notifications set event_type='approved',status='sent',sent_at=now() where training_request_id=$1",[requestId]);
    await asUser(); await change();
    assert.deepEqual((await db.query("select * from training_request_packets where request_id=$1",[requestId])).rows[0],packet);
    await asUser("owner@example.test"); assert.equal((await db.query("select * from training_request_packets where request_id=$1",[requestId])).rows.length,0);
    await asUser(); await change(false); assert.equal((await row()).status,"approved");
    assert.deepEqual((await db.query("select * from training_request_packets where request_id=$1",[requestId])).rows[0],packet);
    assert.equal((await db.query("select status from training_request_notifications where training_request_id=$1",[requestId])).rows[0].status,"sent");
    await db.exec("reset role"); assert.equal((await db.query("select name from storage.objects where name=$1",[`${requestId}/approved-packet.pdf`])).rows.length,1);
  });
  it("does not resend an unsent final-decision email when restoring", async () => {
    await db.exec("reset role");
    await db.query("update training_requests set status='denied',current_action_role=null where id=$1",[requestId]);
    await db.query("update training_request_notifications set event_type='denied',status='pending' where training_request_id=$1",[requestId]);
    await asUser(); await change(); await change(false);
    assert.equal((await row()).status,"denied");
    assert.equal((await db.query("select status from training_request_notifications where training_request_id=$1",[requestId])).rows[0].status,"skipped");
  });
});
