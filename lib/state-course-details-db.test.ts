import assert from "node:assert/strict";
import { before, after, beforeEach, afterEach, describe, it } from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

describe("OFPC details and immutable requester signatures at the database boundary", () => {
  let db: PGlite; let requestId: string;
  const owner="11111111-1111-4111-8111-111111111111", other="22222222-2222-4222-8222-222222222222";
  async function asUser(email="owner@example.test", role="authenticated") {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({email,sub:email.startsWith("owner")?owner:other,role})]);
    await db.exec(`set role ${role}`);
  }
  async function row() { return (await db.query("select *,updated_at::text as version from training_requests where id=$1",[requestId])).rows[0]; }
  async function fill() {
    await db.query("update training_requests set requester_address='123 Example Street',requester_city='Ithaca',requester_state='ny',requester_zip='14850-1234',requester_phone='(607) 555-0100',ny_training_id='00123456' where id=$1",[requestId]);
  }
  async function reserve(version?: string) {
    return String((await db.query("select reserve_requester_submission_signature($1,$2) id",[requestId,version ?? (await row()).version])).rows[0].id);
  }
  async function complete(id: string, confirmed=true) {
    await asUser("owner@example.test","service_role");
    return db.query("select * from complete_requester_submission_signature($1,$2,'training-request-signature-snapshots',$3,$4,'image/png',100)",[id,confirmed,`${requestId}/${id}/signature.png`,"a".repeat(64)]);
  }
  before(async () => {
    db=new PGlite();
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

    for (const file of (await readdir("supabase/migrations")).filter(f=>f.endsWith(".sql")).sort()) await db.exec(await readFile(`supabase/migrations/${file}`,"utf8"));
    await db.query("insert into personnel(id,badge_number,email,first_name,last_name,role) values($1,'1','owner@example.test','Sample','Requester','firefighter'),($2,'2','other@example.test','Other','User','firefighter')",[owner,other]);
    await asUser();
    await db.query("insert into personnel_signatures(personnel_id,storage_bucket,storage_path,mime_type,file_size_bytes,certification_confirmed) values($1,'personnel-signatures',$2,'image/png',100,true)",[owner,`${owner}/signature.png`]);
    await db.exec("reset role");
  });
  beforeEach(async()=>{
    await db.exec("reset role;begin"); await asUser();
    requestId=String((await db.query("insert into training_requests(training_title,is_ofpc_course) values('OFPC test',true) returning id")).rows[0].id);
  });
  afterEach(async()=>{await db.exec("rollback;reset role");});
  after(async()=>{await db?.close();});
  it("saves incomplete drafts and normalizes details",async()=>{
    assert.equal((await row()).ny_training_id,null);await fill();
    assert.equal((await row()).ny_training_id,"00123456");assert.equal((await row()).requester_state,"NY");
  });
  it("does not retain student details on non-OFPC requests",async()=>{
    await fill();await db.query("update training_requests set is_ofpc_course=false where id=$1",[requestId]);
    assert.equal((await row()).requester_address,null);assert.equal((await row()).ny_training_id,null);
    await db.query("select submit_training_request($1)",[requestId]);
    assert.equal((await row()).status,"pending_mto");
  });
  it("blocks unsigned direct workflow submissions",async()=>{
    await fill();await assert.rejects(db.query("select submit_training_request($1)",[requestId]),/Confirm your saved signature/);
  });
  it("requires complete details even through trusted signed completion",async()=>{
    const id=await reserve();await assert.rejects(complete(id),/Street Address is required/);
  });
  it("rejects malformed contact details and keeps submission atomic",async()=>{
    await fill();await db.query("update training_requests set requester_zip='123' where id=$1",[requestId]);
    const id=await reserve();await db.exec("savepoint invalid");await assert.rejects(complete(id),/ZIP code/);
    await db.exec("rollback to savepoint invalid");assert.equal((await row()).status,"draft");
    assert.equal((await db.query("select count(*)::int n from training_request_actions where training_request_id=$1",[requestId])).rows[0].n,0);
  });
  it("captures a signed submission and makes completion retries idempotent",async()=>{
    await fill();const id=await reserve();await complete(id);await complete(id);
    const result=await row();assert.equal(result.status,"pending_mto");assert.ok(result.request_number);
    const actions=(await db.query("select * from training_request_actions where training_request_id=$1",[requestId])).rows;
    assert.equal(actions.length,1);assert.equal(actions[0].action,"submitted");assert.equal(actions[0].signature_name,"Sample Requester");
    assert.equal(actions[0].electronic_signature_confirmed,true);assert.equal(actions[0].signature_sha256,"a".repeat(64));
    assert.equal(actions[0].signature_storage_path,`${requestId}/${id}/signature.png`);
  });
  it("requires affirmative signing confirmation",async()=>{
    await fill();const id=await reserve();await assert.rejects(complete(id,false),/confirmation is required/);
  });
  it("rejects other requesters and stale versions",async()=>{
    await fill();await assert.rejects(reserve("2000-01-01"),/request changed/);
  });
  it("does not allow another user to read details or reserve a signature",async()=>{
    await fill();await asUser("other@example.test");assert.equal(await row(),undefined);
    await assert.rejects(reserve("2000-01-01"),/Only the requester/);
  });
  it("does not expose trusted completion to the browser",async()=>{
    await assert.rejects(db.query("select complete_requester_submission_signature(null,true,null,null,null,null,null)"),/permission denied/);
  });
  it("freezes submitted contact data",async()=>{
    await fill();const id=await reserve();await complete(id);
    await db.exec("reset role");await assert.rejects(db.query("update training_requests set requester_phone='607-555-0101' where id=$1",[requestId]),/only be edited/);
  });
  it("keeps the committed snapshot unchanged when the saved profile signature changes",async()=>{
    await fill();const id=await reserve();await complete(id);await asUser();
    await db.query("update personnel_signatures set file_size_bytes=200 where personnel_id=$1",[owner]);
    const action=(await db.query("select signature_sha256,signature_file_size_bytes from training_request_actions where id=$1",[id])).rows[0];
    assert.equal(action.signature_sha256,"a".repeat(64));assert.equal(action.signature_file_size_bytes,100);
  });
  it("rejects expired reservations",async()=>{
    await fill();const id=await reserve();await db.exec("reset role");
    await db.query("update training_request_signature_action_reservations set expires_at=now()-interval '1 minute' where id=$1",[id]);
    await assert.rejects(complete(id),/expired/);
  });
  it("rejects a request edited after signing was reserved",async()=>{
    await fill();const id=await reserve();await db.exec("reset role;alter table training_requests disable trigger user");
    await db.query("update training_requests set updated_at=updated_at+interval '1 second' where id=$1",[requestId]);
    await db.exec("alter table training_requests enable trigger user");
    await assert.rejects(complete(id),/request changed/);
  });
  it("permits historical pending state requests to proceed without newly required fields",async()=>{
    await db.exec("reset role;alter table training_requests disable trigger user");
    await db.query("update training_requests set status='pending_mto',submitted_at=now(),request_number='Historical',current_action_role='mto' where id=$1",[requestId]);
    await db.exec("alter table training_requests enable trigger user");
    await db.query("update training_requests set status='pending_deputy_chief',current_action_role='deputy_chief' where id=$1",[requestId]);
    assert.equal((await row()).requester_address,null);
  });
  it("re-signs returned requests and preserves the original submission action",async()=>{
    await fill();const id=await reserve();await complete(id);
    await db.exec("reset role");await db.query("update training_requests set status='returned_for_correction',current_action_role='firefighter' where id=$1",[requestId]);
    await asUser();await db.query("update training_requests set requester_address='456 Example Road' where id=$1",[requestId]);
    const next=await reserve();await complete(next);
    const actions=(await db.query("select action,signature_storage_path from training_request_actions where training_request_id=$1 order by action",[requestId])).rows;
    assert.equal(actions.length,2);assert.equal(actions[0].action,"resubmitted");
    assert.equal(actions[1].signature_storage_path,`${requestId}/${id}/signature.png`);
  });
});
