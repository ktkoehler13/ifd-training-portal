import assert from "node:assert/strict";
import { before, after, beforeEach, afterEach, describe, it } from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const migration="20261013160000_personnel_auth_email_sync.sql";
const authId="11111111-1111-4111-8111-111111111111";
const otherId="22222222-2222-4222-8222-222222222222";
describe("atomic personnel/Auth email synchronization",()=>{
  let db:PGlite;
  before(async()=>{
    db=new PGlite();
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
      alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
      create schema auth;
      create table auth.users(id uuid primary key,email text unique,encrypted_password text);
      create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
      create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
      grant usage on schema auth,public to authenticated,anon,service_role;
      create schema storage;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
      create function storage.foldername(text) returns text[] language sql as $$ select string_to_array($1,'/') $$;
    `);
    for(const file of (await readdir("supabase/migrations")).filter(f=>f.endsWith(".sql")&&f!==migration).sort())await db.exec(await readFile(`supabase/migrations/${file}`,"utf8"));
    await db.query("insert into auth.users(id,email,encrypted_password) values($1,'old@example.test','unchanged-password-hash')",[authId]);
    await db.exec("insert into personnel(badge_number,email,first_name,last_name,role) values('207','old@example.test','Test','User','mto')");
    await db.exec(await readFile(`supabase/migrations/${migration}`,"utf8"));
  });
  beforeEach(async()=>{await db.exec("reset role;begin");});
  afterEach(async()=>{await db.exec("rollback;reset role");});
  after(async()=>{await db?.close();});
  async function profile(){return (await db.query("select * from personnel where badge_number='207'")).rows[0];}
  async function asMto(){await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({email:"old@example.test",sub:authId})]);await db.exec("set role authenticated");}
  it("backfills the existing stable account link",async()=>{assert.equal((await profile()).auth_user_id,authId);});
  it("changes both emails together while preserving password, badge, and history",async()=>{
    const original=await profile();await asMto();
    await db.exec("insert into training_requests(training_title) values('Historical request')");await db.exec("reset role");
    await db.query("update auth.users set email='new@example.test' where id=$1",[authId]);
    const next=await profile();assert.equal(next.email,"new@example.test");assert.equal(next.id,original.id);assert.equal(next.auth_user_id,authId);
    const a=(await db.query("select * from auth.users where id=$1",[authId])).rows[0];assert.equal(a.encrypted_password,"unchanged-password-hash");
    const request=(await db.query("select requester_personnel_id,requester_email from training_requests")).rows[0];
    assert.equal(request.requester_email,"old@example.test");assert.equal(request.requester_personnel_id,original.id);
    assert.equal((await db.query("select count(*)::int n from personnel p join auth.users u on p.email=u.email where p.badge_number='207'")).rows[0].n,1);
  });
  it("rejects the old browser's profile-only email edit even for an administrator",async()=>{
    await asMto();await assert.rejects(db.exec("update personnel set email='new@example.test' where badge_number='207'"),/Use User Management/);
  });
  it("rejects attempts to clear or replace the stable identity link",async()=>{
    await asMto();await assert.rejects(db.exec("update personnel set auth_user_id=null where badge_number='207'"),/cannot be changed/);
  });
  it("rolls back the Auth email when the target belongs to another personnel record",async()=>{
    await db.exec("insert into personnel(badge_number,email,role) values('208','taken@example.test','firefighter');savepoint conflict");
    await assert.rejects(db.query("update auth.users set email='taken@example.test' where id=$1",[authId]),/duplicate key/);
    await db.exec("rollback to savepoint conflict");assert.equal((await profile()).email,"old@example.test");
    assert.equal((await db.query("select email from auth.users where id=$1",[authId])).rows[0].email,"old@example.test");
  });
  it("links accounts created before and after their personnel record",async()=>{
    await db.query("insert into auth.users(id,email) values($1,'before@example.test')",[otherId]);
    await db.exec("insert into personnel(badge_number,email,role) values('208','before@example.test','firefighter')");
    assert.equal((await db.query("select auth_user_id from personnel where badge_number='208'")).rows[0].auth_user_id,otherId);
    await db.exec("insert into personnel(badge_number,email,role) values('209','after@example.test','firefighter')");
    await db.exec("insert into auth.users(id,email) values('33333333-3333-4333-8333-333333333333','after@example.test')");
    assert.equal((await db.query("select auth_user_id from personnel where badge_number='209'")).rows[0].auth_user_id,"33333333-3333-4333-8333-333333333333");
  });
  it("does not delete historical personnel when an Auth account is deleted",async()=>{
    await db.query("delete from auth.users where id=$1",[authId]);assert.equal((await profile()).auth_user_id,null);assert.equal((await profile()).badge_number,"207");
  });
  it("keeps regular profile edits available",async()=>{
    await asMto();await db.exec("update personnel set first_name='Changed' where badge_number='207'");assert.equal((await profile()).first_name,"Changed");
  });
  it("does not let an unlinked record acquire an unrelated sign-in identity",async()=>{
    await db.exec("insert into personnel(badge_number,email,role) values('208','unlinked@example.test','firefighter')");
    await asMto();await assert.rejects(db.query("update personnel set auth_user_id=$1 where badge_number='208'",[authId]),/does not match/);
  });
  it("does not expose Auth records or trigger functions to ordinary clients",async()=>{
    await asMto();await assert.rejects(db.exec("select * from auth.users"),/permission denied/);
  });
});
