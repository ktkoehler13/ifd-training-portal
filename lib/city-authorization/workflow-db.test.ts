import assert from "node:assert/strict";
import {before,after,beforeEach,afterEach,describe,it} from "node:test";
import {readFile,readdir} from "node:fs/promises";
import {randomUUID} from "node:crypto";
import {PGlite} from "@electric-sql/pglite";
import {cityAuthorizationNeedsAction} from "./model";
describe("City Authorization routing, file history and database permissions",()=>{
 let db:PGlite,requestId:string,legacyId:string;
 const ids={owner:"11111111-1111-4111-8111-111111111111",mto:"22222222-2222-4222-8222-222222222222",admin:"33333333-3333-4333-8333-333333333333",other:"44444444-4444-4444-8444-444444444444",deputy:"55555555-5555-4555-8555-555555555555",office:"66666666-6666-4666-8666-666666666666"};
 async function role(name="service_role",person:keyof typeof ids="owner") {await db.exec("reset role");await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({email:`${person}@example.test`,sub:ids[person],role:name})]);await db.exec(`set role ${name}`);}
 async function makeRequest(status="pending_deputy_chief") {
  await db.exec("reset role;alter table training_requests disable trigger user");
  const result=await db.query<{id:string}>("insert into training_requests(requester_personnel_id,requester_badge_number,requester_email,requester_name,training_title,status,current_action_role,request_number,start_date,end_date,submitted_at) values($1,'owner','owner@example.test','Sample Owner','Training',$2,$3,$4,current_date+1,current_date+2,now()) returning id",[ids.owner,status,status==="pending_deputy_chief"?"deputy_chief":null,randomUUID()]);
  await db.exec("alter table training_requests enable trigger user");return result.rows[0].id;
 }
 async function decide(action="deputy_chief_approved") {
  await role("authenticated","deputy");
  const reservation=(await db.query<{id:string}>("select reserve_training_request_signature_action($1,$2) id",[requestId,action])).rows[0].id;
  await role();
  await db.query("select complete_training_request_signature_action($1,'Test decision',true,'training-request-signature-snapshots',$2,$3,'image/png',100)",[reservation,`${requestId}/${reservation}/signature.png`,"a".repeat(64)]);
 }
 async function upload(actor=ids.office,version=0,overrides:Record<string,unknown>={}) {
  const file=randomUUID(),v={requestId,version,file,name:"City approval.pdf",path:`${requestId}/${file}.pdf`,type:"application/pdf",size:100,sha:"a".repeat(64),...overrides};
  return (await db.query<{request_id:string;status:"pending"|"uploaded";version:number}>("select * from record_city_authorization_upload($1,$2,$3,$4,$5,$6,$7,$8,$9)",[actor,v.requestId,v.version,v.file,v.name,v.path,v.type,v.size,v.sha])).rows[0];
 }
 async function removeFile(actor:string,fileId:string,version:number) {
  return (await db.query<{status:"pending"|"uploaded";version:number;completed_at:string|null}>("select * from record_city_authorization_file_removal($1,$2,$3,$4)",[actor,requestId,version,fileId])).rows[0];
 }
 const fileIds=async()=>(await db.query<{id:string}>("select id from training_request_city_authorization_files where request_id=$1 order by version",[requestId])).rows.map(r=>r.id);
 async function reject(run:()=>Promise<unknown>,pattern:RegExp){await db.exec("savepoint rejected");await assert.rejects(run,pattern);await db.exec("rollback to savepoint rejected;release savepoint rejected");}
 before(async()=>{
  db=new PGlite();await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
  alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
  alter default privileges in schema public grant all on sequences to anon,authenticated,service_role;
  create schema auth;create table auth.users(id uuid primary key,email text unique);
  create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
  create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
  grant usage on schema auth,public to authenticated,anon,service_role;
  create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
  create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
  create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;`);
  for(const file of (await readdir("supabase/migrations")).filter(f=>f.endsWith(".sql")).sort()) {
   if(file==="20261119180000_city_authorizations.sql") {
    for(const [name,id] of Object.entries(ids))await db.query("insert into personnel(id,badge_number,email,first_name,last_name,role) values($1,$2,$3,$4,'Sample',$5)",[id,name,`${name}@example.test`,name,name==="owner"||name==="other"?"firefighter":name==="deputy"?"deputy_chief":name]);
    legacyId=await makeRequest("approved");
   }
   await db.exec(await readFile(`supabase/migrations/${file}`,"utf8"));
  }
  await role("authenticated","deputy");await db.query("insert into personnel_signatures(personnel_id,storage_bucket,storage_path,mime_type,file_size_bytes,certification_confirmed) values($1,'personnel-signatures',$2,'image/png',100,true)",[ids.deputy,`${ids.deputy}/signature.png`]);
 });
 beforeEach(async()=>{await db.exec("reset role;begin");requestId=await makeRequest();await role();});
 afterEach(async()=>{await db.exec("rollback;reset role");});after(async()=>{await db?.close();});
 it("queues a new signed DC approval atomically and alerts only Office",async()=>{
  await decide();const row=(await db.query<{status:"pending"}>("select * from training_request_city_authorizations where request_id=$1",[requestId])).rows[0];assert.equal(row.status,"pending");
  for(const role of ["office","admin","mto","deputy_chief"] as const)assert.equal(cityAuthorizationNeedsAction(row.status,role),role==="office");
  assert.equal((await db.query("select status from training_requests where id=$1",[requestId])).rows[0].status,"approved");
 });
 it("does not backfill historical approvals but permits storing their authorization",async()=>{
  assert.equal((await db.query("select * from training_request_city_authorizations where request_id=$1",[legacyId])).rows.length,0);
  const file=randomUUID();await upload(ids.office,0,{requestId:legacyId,file,path:`${legacyId}/${file}.pdf`});
  assert.equal((await db.query("select status from training_request_city_authorizations where request_id=$1",[legacyId])).rows[0].status,"uploaded");
 });
 it("does not create an Office task for a denial and blocks pre-approval uploads",async()=>{
  await reject(()=>upload(),/after Deputy Chief approval/);await decide("deputy_chief_denied");
  assert.equal((await db.query("select * from training_request_city_authorizations where request_id=$1",[requestId])).rows.length,0);await reject(()=>upload(),/after Deputy Chief approval/);
 });
 it("upload completes the task, preserves training approval and retains earlier file versions",async()=>{
  await decide();const actionsBefore=(await db.query("select * from training_request_actions where training_request_id=$1 order by id",[requestId])).rows;
  const first=await upload();assert.equal(first.status,"uploaded");assert.equal(cityAuthorizationNeedsAction(first.status,"office"),false);
  await upload(ids.mto,1);const files=(await db.query("select version,uploaded_by_personnel_id from training_request_city_authorization_files where request_id=$1 order by version",[requestId])).rows;
  assert.deepEqual(files,[{version:1,uploaded_by_personnel_id:ids.office},{version:2,uploaded_by_personnel_id:ids.mto}]);
  assert.deepEqual((await db.query("select * from training_request_actions where training_request_id=$1 order by id",[requestId])).rows,actionsBefore);
  assert.equal((await db.query("select status from training_requests where id=$1",[requestId])).rows[0].status,"approved");
  await reject(()=>db.query("update training_request_city_authorization_files set file_name='changed'"),/immutable/);await reject(()=>db.query("delete from training_request_city_authorization_files"),/immutable/);
 });
 it("keeps backup access but rejects requester writes and stale or cross-request files",async()=>{
  await decide();await reject(()=>upload(ids.owner),/Office or administrative/);
  for(const actor of [ids.admin,ids.mto,ids.deputy,ids.office]){const version=Number((await db.query("select version from training_request_city_authorizations where request_id=$1",[requestId])).rows[0].version);await upload(actor,version);}
  await reject(()=>upload(ids.office,0),/changed/);await reject(()=>upload(ids.office,4,{path:`${legacyId}/${randomUUID()}.pdf`}),/path or type/);
 });
 it("rejects invalid upload metadata without completing the task",async()=>{
  await decide();for(const overrides of [{size:0},{size:4194305},{sha:"bad"},{name:""}])await reject(()=>upload(ids.office,0,overrides),/constraint/);
  assert.equal((await db.query("select status from training_request_city_authorizations where request_id=$1",[requestId])).rows[0].status,"pending");
 });
 it("allows approved-request reads to Office without granting edits or access to pending requests",async()=>{
  await role("authenticated","office");assert.equal((await db.query("select id from training_requests where id=$1",[requestId])).rows.length,0);
  await decide();await role("authenticated","office");
  assert.equal((await db.query("select id from training_requests where id=$1",[requestId])).rows.length,1);
  assert.equal((await db.query("select id from training_request_actions where training_request_id=$1",[requestId])).rows.length,1);
  assert.equal((await db.query("select id from training_request_packets where request_id=$1",[requestId])).rows.length,1);
  assert.equal((await db.query("update training_requests set training_title='Changed' where id=$1 returning id",[requestId])).rows.length,0);
 });
 it("enforces private file metadata, denies direct client writes and restricts the workflow RPC",async()=>{
  await decide();await upload();
  for(const person of ["office","owner","mto","admin","deputy"] as const){await role("authenticated",person);assert.equal((await db.query("select id from training_request_city_authorization_files where request_id=$1",[requestId])).rows.length,1);}
  await role("authenticated","other");assert.equal((await db.query("select * from training_request_city_authorization_files")).rows.length,0);
  await role("authenticated","office");await reject(()=>db.query("update training_request_city_authorizations set status='uploaded'"),/permission denied/);await reject(()=>upload(),/permission denied/);
  await role("anon");await reject(()=>db.query("select * from training_request_city_authorization_files"),/permission denied/);
 });
 it("hides deleted requests and blocks inactive uploaders",async()=>{
  await decide();await db.exec("reset role");await db.query("update personnel set active=false where id=$1",[ids.office]);await role();await reject(()=>upload(),/Office or administrative/);
  await db.exec("reset role;alter table training_requests disable trigger user");await db.query("update personnel set active=true where id=$1",[ids.office]);await db.query("update training_requests set deleted_at=now(),deleted_by_personnel_id=$2,deleted_by_name='Admin',deletion_reason='Duplicate' where id=$1",[requestId,ids.admin]);await db.exec("alter table training_requests enable trigger user");
  await role();await reject(()=>upload(),/after Deputy Chief approval/);await role("authenticated","office");assert.equal((await db.query("select * from training_request_city_authorizations where request_id=$1",[requestId])).rows.length,0);
 });
 it("removing the only file returns the task to Office and keeps a removal record",async()=>{
  await decide();await upload();const [fileId]=await fileIds();
  const result=await removeFile(ids.mto,fileId,1);
  assert.equal(result.status,"pending");assert.equal(result.version,2);assert.equal(result.completed_at,null);
  assert.equal(cityAuthorizationNeedsAction(result.status,"office"),true);
  const row=(await db.query<{removed_at:string|null;removed_by_personnel_id:string;removed_by_name:string;storage_path:string}>("select removed_at,removed_by_personnel_id,removed_by_name,storage_path from training_request_city_authorization_files where id=$1",[fileId])).rows[0];
  assert.ok(row.removed_at);assert.equal(row.removed_by_personnel_id,ids.mto);assert.equal(row.removed_by_name,"mto Sample");assert.ok(row.storage_path.startsWith(requestId));
  for(const person of ["office","owner"] as const){await role("authenticated",person);assert.equal((await db.query("select id from training_request_city_authorization_files where request_id=$1",[requestId])).rows.length,0);}
  await role();const again=await upload(ids.office,2);assert.equal(again.status,"uploaded");assert.equal(again.version,3);
  assert.equal((await db.query("select status from training_requests where id=$1",[requestId])).rows[0].status,"approved");
 });
 it("removing one of several files keeps the task complete and rejects invalid removals",async()=>{
  await decide();await upload();await upload(ids.office,1);const [first,second]=await fileIds();
  await reject(()=>removeFile(ids.owner,second,2),/Office or administrative/);
  await reject(()=>removeFile(ids.office,second,1),/changed/);
  const result=await removeFile(ids.office,second,2);assert.equal(result.status,"uploaded");assert.equal(result.version,3);
  await reject(()=>removeFile(ids.office,second,3),/not found/);
  await reject(()=>removeFile(ids.office,randomUUID(),3),/not found/);
  await reject(()=>db.query("update training_request_city_authorization_files set file_name='changed' where id=$1",[first]),/immutable/);
  await reject(()=>db.query("update training_request_city_authorization_files set removed_by_name='Someone else' where id=$1",[second]),/immutable/);
  await reject(()=>db.query("delete from training_request_city_authorization_files where id=$1",[second]),/immutable/);
  await role("authenticated","office");await reject(()=>removeFile(ids.office,first,3),/permission denied/);
 });
 it("blocks removal on deleted requests",async()=>{
  await decide();await upload();const [fileId]=await fileIds();
  await db.exec("reset role;alter table training_requests disable trigger user");await db.query("update training_requests set deleted_at=now(),deleted_by_personnel_id=$2,deleted_by_name='Admin',deletion_reason='Duplicate' where id=$1",[requestId,ids.admin]);await db.exec("alter table training_requests enable trigger user");
  await role();await reject(()=>removeFile(ids.office,fileId,1),/after Deputy Chief approval/);
 });
 it("keeps the storage bucket private and unavailable through client storage policies",async()=>{
  await db.exec("reset role");assert.equal((await db.query("select public from storage.buckets where id='city-authorizations'")).rows[0].public,false);
  assert.equal((await db.query("select * from pg_policies where schemaname='storage' and (coalesce(qual,'')||coalesce(with_check,'')) like '%city-authorizations%'")).rows.length,0);
 });
});
