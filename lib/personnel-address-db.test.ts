import assert from "node:assert/strict";
import { before, after, beforeEach, afterEach, describe, it } from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

describe("private saved addresses at the database boundary", () => {
  let db: PGlite;
  const owner = "11111111-1111-4111-8111-111111111111", other = "22222222-2222-4222-8222-222222222222";
  async function asUser(email = "owner@example.test", role = "authenticated") {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ email, sub: email.startsWith("owner") ? owner : other, role })]);
    await db.exec(`set role ${role}`);
  }
  async function save(id = owner, street = "123 Example St", city = "Ithaca", state = "NY", zip = "14850") {
    return db.query("insert into personnel_addresses(personnel_id,street_address,city,state,zip) values($1,$2,$3,$4,$5) on conflict(personnel_id) do update set street_address=excluded.street_address,city=excluded.city,state=excluded.state,zip=excluded.zip returning *", [id, street, city, state, zip]);
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
    for (const file of (await readdir("supabase/migrations")).filter((f) => f.endsWith(".sql")).sort()) await db.exec(await readFile(`supabase/migrations/${file}`, "utf8"));
    await db.query("insert into personnel(id,badge_number,email,first_name,last_name,role) values($1,'1','owner@example.test','Sample','Requester','firefighter'),($2,'2','other@example.test','Other','User','admin')", [owner, other]);
  });
  beforeEach(async () => { await db.exec("reset role;begin"); await asUser(); });
  afterEach(async () => { await db.exec("rollback;reset role"); });
  after(async () => { await db?.close(); });

  it("lets an active ordinary user save, read, replace and remove their own address", async () => {
    const saved = (await save(owner, "  123  Example St  ", " Ithaca ", "ny", "01234-5678")).rows[0];
    assert.equal(saved.street_address, "123 Example St"); assert.equal(saved.state, "NY"); assert.equal(saved.zip, "01234-5678");
    await save(owner, "456 Example Ave");
    assert.equal((await db.query("select * from personnel_addresses")).rows.length, 1);
    await db.query("delete from personnel_addresses where personnel_id=$1", [owner]);
    assert.equal((await db.query("select * from personnel_addresses")).rows.length, 0);
  });
  it("does not let other users, including admins, read or change an owner's saved address", async () => {
    await save(); await asUser("other@example.test");
    assert.equal((await db.query("select * from personnel_addresses")).rows.length, 0);
    assert.equal((await db.query("update personnel_addresses set city='Albany' where personnel_id=$1 returning *", [owner])).rows.length, 0);
    assert.equal((await db.query("delete from personnel_addresses where personnel_id=$1 returning *", [owner])).rows.length, 0);
    await assert.rejects(save(owner), /row-level security/);
  });
  it("rejects inserting or transferring an address to another person", async () => {
    await save();
    await assert.rejects(db.query("update personnel_addresses set personnel_id=$1 where personnel_id=$2", [other, owner]), /row-level security/);
  });
  it("rejects an initial insert for someone else", async () => {
    await assert.rejects(save(other), /row-level security/);
  });
  it("blocks anonymous access", async () => {
    await asUser("", "anon");
    await assert.rejects(db.query("select * from personnel_addresses"), /permission denied/);
  });
  it("blocks inactive users from reading or saving", async () => {
    await save(); await db.exec("reset role"); await db.query("update personnel set active=false where id=$1", [owner]); await asUser();
    assert.equal((await db.query("select * from personnel_addresses")).rows.length, 0);
    await assert.rejects(save(), /row-level security/);
  });
  for (const [label, street, city, state, zip] of [
    ["blank address", " \n ", "Ithaca", "NY", "14850"],
    ["long address", "x".repeat(161), "Ithaca", "NY", "14850"],
    ["blank city", "123 Example St", " ", "NY", "14850"],
    ["invalid state", "123 Example St", "Ithaca", "New York", "14850"],
    ["invalid ZIP", "123 Example St", "Ithaca", "NY", "123"],
  ]) it(`rejects ${label} through direct database writes`, async () => {
    await assert.rejects(save(owner, street, city, state, zip), /check constraint/);
  });
  it("preserves existing request details and actions when a saved address changes or is removed", async () => {
    await save();
    const request = (await db.query("insert into training_requests(training_title,is_ofpc_course,requester_address,requester_city,requester_state,requester_zip) values('Existing draft',true,'Original St','Ithaca','NY','14850') returning *")).rows[0];
    await save(owner, "New Address St"); await db.query("delete from personnel_addresses where personnel_id=$1", [owner]);
    assert.deepEqual((await db.query("select * from training_requests where id=$1", [request.id])).rows[0], request);
    assert.equal((await db.query("select * from training_request_actions where training_request_id=$1", [request.id])).rows.length, 0);
  });
});
