import assert from "node:assert/strict";
import { before, after, beforeEach, afterEach, describe, it } from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

describe("primary Deputy Chief notification routing", () => {
  let db: PGlite;
  const ids = {
    owner: "11111111-1111-4111-8111-111111111111",
    mto: "22222222-2222-4222-8222-222222222222",
    primary: "33333333-3333-4333-8333-333333333333",
    backup: "44444444-4444-4444-8444-444444444444",
    inactive: "55555555-5555-4555-8555-555555555555",
  };
  let requestId: string;
  let actionId: string;
  async function asUser(email: string, role = "authenticated") {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ email, sub: ids.owner })]);
    await db.exec(`set role ${role}`);
  }
  async function designate(id = ids.primary) {
    await asUser("mto@example.test");
    await db.query("select set_primary_approval_deputy_chief($1)", [id]);
    await db.exec("reset role");
  }
  async function enqueue(event = "pending_deputy_chief") {
    await db.query("select enqueue_training_request_notifications($1,$2,$3)", [requestId, actionId, event]);
  }
  async function notifications() {
    return (await db.query<{recipient_personnel_id: string; status: string}>(
      "select * from training_request_notifications where training_request_id=$1 order by recipient_personnel_id", [requestId])).rows;
  }
  before(async () => {
    db = new PGlite();
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
      alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
      create schema auth;
      create table auth.users (id uuid primary key, email text unique);
      create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
      create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
      grant usage on schema auth, public to authenticated, anon, service_role;
      create schema storage;
      create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
      create table storage.objects (id uuid default gen_random_uuid(), bucket_id text, name text);
      create function storage.foldername(text) returns text[] language sql as $$ select string_to_array($1, '/') $$;
    `);
    for (const file of (await readdir("supabase/migrations"))
      .filter((file) => file.endsWith(".sql"))
      .sort()) {
      try {
        await db.exec(await readFile(`supabase/migrations/${file}`, "utf8"));
      } catch (error) {
        throw new Error(`Migration failed: ${file}`, { cause: error });
      }
    }

    for (const [name, role, active] of [
      ["owner", "firefighter", true], ["mto", "mto", true],
      ["primary", "deputy_chief", true], ["backup", "deputy_chief", true],
      ["inactive", "deputy_chief", false],
    ] as const) {
      await db.query("insert into personnel(id,badge_number,email,first_name,last_name,role,active) values ($1,$2,$3,$2,'Test',$4,$5)",
        [ids[name], name, `${name}@example.test`, role, active]);
    }
  });
  beforeEach(async () => {
    await db.exec("reset role; begin");
    await asUser("owner@example.test");
    requestId = String((await db.query("insert into training_requests(training_title) values ('Routing test') returning id")).rows[0].id);
    await db.query("select submit_training_request($1)", [requestId]);
    await db.exec("reset role");
    // A fixture supplies the signed MTO transition; the DC review RPCs stay real.
    await db.exec("alter table training_requests disable trigger user");
    await db.query("update training_requests set status='pending_deputy_chief', current_action_role='deputy_chief' where id=$1",[requestId]);
    await db.exec("alter table training_requests enable trigger user");
    actionId = String((await db.query("insert into training_request_actions(training_request_id,actor_personnel_id,actor_name,actor_badge_number,actor_role,action,created_at) values($1,$2,'MTO Test','mto','mto','mto_approved',now()+interval '1 second') returning id",[requestId,ids.mto])).rows[0].id);
    await db.query("delete from training_request_notifications where training_request_id=$1",[requestId]);
  });
  afterEach(async () => { await db.exec("rollback; reset role"); });
  after(async () => { await db?.close(); });

  it("preserves existing DC routing until a selection is saved", async () => {
    await enqueue();
    assert.deepEqual((await notifications()).map(n=>n.recipient_personnel_id), [ids.primary, ids.backup]);
  });
  it("queues only the designated DC, while MTO and requester alerts remain unchanged", async () => {
    await designate(); await enqueue();
    assert.deepEqual((await notifications()).map(n=>n.recipient_personnel_id), [ids.primary]);
    await enqueue("pending_mto"); await enqueue("approved");
    assert.deepEqual((await notifications()).map(n=>n.recipient_personnel_id), [ids.owner, ids.mto, ids.primary]);
  });
  it("restricts changes to active administrators and rejects invalid recipients", async () => {
    for (const email of ["owner@example.test", "inactive@example.test", "missing@example.test"]) {
      await asUser(email);
      await db.exec("savepoint denied");
      await assert.rejects(db.query("select set_primary_approval_deputy_chief($1)",[ids.primary]),/Administrative access required/);
      await db.exec("rollback to savepoint denied");
    }
    await asUser("mto@example.test");
    for (const id of [ids.owner,ids.inactive,"99999999-9999-4999-8999-999999999999"]) {
      await db.exec("savepoint invalid");
      await assert.rejects(db.query("select set_primary_approval_deputy_chief($1)",[id]),/Choose an active Deputy Chief/);
      await db.exec("rollback to savepoint invalid");
    }
    await asUser("owner@example.test", "anon");
    await db.exec("savepoint anonymous");
    await assert.rejects(db.query("select set_primary_approval_deputy_chief($1)",[ids.primary]),/permission denied/);
    await db.exec("rollback to savepoint anonymous");
  });
  it("records the old/new selection and actor atomically; unchanged selections do not add audit rows", async () => {
    await designate(); await designate(); await designate(ids.backup);
    const rows=(await db.query("select old_value,new_value,changed_by_personnel_id from system_settings_audit where setting_key='primary_approval_deputy_chief'")).rows;
    assert.equal(rows.length,2);
    assert.deepEqual(rows[0],{old_value:"",new_value:ids.primary,changed_by_personnel_id:ids.mto});
    assert.deepEqual(rows[1],{old_value:ids.primary,new_value:ids.backup,changed_by_personnel_id:ids.mto});
  });
  it("reroutes unsent alerts and allows switching back without duplicating a sent alert", async () => {
    await designate(); await enqueue(); await designate(ids.backup);
    assert.deepEqual((await notifications()).map(n=>n.status),["skipped","pending"]);
    await designate();
    assert.deepEqual((await notifications()).map(n=>n.status),["pending","skipped"]);
    await db.query("update training_request_notifications set status='sent',sent_at=now() where recipient_personnel_id=$1",[ids.primary]);
    await designate(ids.backup); await designate();
    assert.equal((await notifications()).filter(n=>n.recipient_personnel_id===ids.primary)[0].status,"sent");
  });
  it("does not resurrect previously skipped historical alerts", async () => {
    await enqueue();
    await db.exec("update training_request_notifications set status='skipped',last_error='Created before email alerts were activated'");
    await designate();
    assert.ok((await notifications()).every(n=>n.status==="skipped"));
  });
  it("preserves original alert age when transferring delivery", async () => {
    await designate(); await enqueue();
    await db.exec("update training_request_notifications set created_at='2026-07-18T00:00:00Z'");
    await designate(ids.backup);
    const dates=(await db.query("select created_at from training_request_notifications")).rows;
    assert.equal(dates.length,2); assert.deepEqual(dates[0].created_at,dates[1].created_at);
  });
  it("prevents removing the selected DC until a replacement is chosen", async () => {
    await designate();
    for (const sql of ["update personnel set active=false where id=$1", "update personnel set role='admin' where id=$1", "delete from personnel where id=$1"]) {
      await db.exec("savepoint protect");
      await assert.rejects(db.query(sql,[ids.primary]),/Choose another Deputy Chief/);
      await db.exec("rollback to savepoint protect");
    }
    await designate(ids.backup);
    await db.query("update personnel set active=false where id=$1",[ids.primary]);
  });
  it("keeps backup DC review permissions and leaves existing approval snapshots untouched", async () => {
    await designate();
    const before=(await db.query("select * from training_request_actions where training_request_id=$1",[requestId])).rows;
    await asUser("backup@example.test");
    // Returning a request exercises the same active-DC authorization as approval.
    await db.query("select deputy_return_training_request($1,'Correct course dates')",[requestId]);
    await db.exec("reset role");
    const after=(await db.query("select * from training_request_actions where training_request_id=$1 and id=any($2::uuid[])",[requestId,before.map(r=>r.id)])).rows;
    assert.deepEqual(after,before);
    assert.equal((await db.query("select status from training_requests where id=$1",[requestId])).rows[0].status,"returned_for_correction");
    assert.equal((await db.query("select role from personnel where id=$1",[ids.backup])).rows[0].role,"deputy_chief");
  });
  it("allows the backup DC to complete a signed final approval", async () => {
    await designate(); await enqueue();
    await asUser("backup@example.test");
    await db.query(`insert into personnel_signatures(personnel_id, storage_bucket, storage_path, mime_type, file_size_bytes, certification_confirmed)
      values($1,'personnel-signatures',$2,'image/png',100,true)`,[ids.backup,`${ids.backup}/signature.png`]);
    const version = String((await db.query("select updated_at::text as version from training_requests where id=$1",[requestId])).rows[0].version);
    const reservation = (await db.query("select reserve_training_request_signature_action_for_version($1,'deputy_chief_approved',$2) as id",[requestId,version])).rows[0].id;
    await db.exec("reset role; set role service_role");
    await db.query("select complete_training_request_signature_action($1,'Backup review',true,'training-request-signature-snapshots',$2,$3,'image/png',100)",
      [reservation,`${requestId}/${reservation}/signature.png`,"b".repeat(64)]);
    assert.equal((await db.query("select status from training_requests where id=$1",[requestId])).rows[0].status,"approved");
    const signed=(await db.query("select actor_personnel_id,signature_sha256 from training_request_actions where id=$1",[reservation])).rows[0];
    assert.equal(signed.actor_personnel_id,ids.backup);
    assert.equal(signed.signature_sha256,"b".repeat(64));
  });
});
