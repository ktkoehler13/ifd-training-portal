import assert from "node:assert/strict";
import {before,after,beforeEach,afterEach,describe,it} from "node:test";
import {readFile,readdir} from "node:fs/promises";
import {PGlite} from "@electric-sql/pglite";
import {compensationFixture as fixture} from "./fixtures";
import {compensationNeedsAction} from "./access";
import type {CompensationPacket} from "./model";
describe("compensation workflow database permissions and signed history",()=>{
 let db:PGlite,requestId:string,packet:CompensationPacket;
 const ids={owner:"11111111-1111-4111-8111-111111111111",mto:"22222222-2222-4222-8222-222222222222",admin:"33333333-3333-4333-8333-333333333333",other:"44444444-4444-4444-8444-444444444444",deputy:"55555555-5555-4555-8555-555555555555",office:"66666666-6666-4666-8666-666666666666"};
 async function role(name="service_role",email="owner@example.test") {await db.exec("reset role");await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({email,role:name,sub:ids.owner})]);await db.exec(`set role ${name}`);}
 async function act(action:string,actor=ids.owner,override:Record<string,unknown>={}) {
  const v={version:packet?.version??0,data:fixture.data,identity:fixture.identity,receipts:[],signature:null,pdf:null,hash:null,note:"",codes:[],...override};
  const rows=await db.query<CompensationPacket>("select * from save_training_compensation($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",[actor,requestId,v.version,action,JSON.stringify(v.data),JSON.stringify(v.identity),JSON.stringify(v.receipts),v.signature?JSON.stringify(v.signature):null,v.pdf,v.hash,v.note,v.codes]);packet=rows.rows[0];return packet;
 }
 const signed={signature:fixture.requester_signature,pdf:"sample/packet.pdf",hash:"a".repeat(64)};
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
  for(const file of (await readdir("supabase/migrations")).filter(f=>f.endsWith(".sql")).sort()) await db.exec(await readFile(`supabase/migrations/${file}`,"utf8"));
  for(const [name,id] of Object.entries(ids))await db.query("insert into personnel(id,badge_number,email,first_name,last_name,role) values($1,$2,$3,$4,'Sample',$5)",[id,name,`${name}@example.test`,name,name==="owner"||name==="other"?"firefighter":name==="deputy"?"deputy_chief":name]);
 });
 beforeEach(async()=>{
  await db.exec("reset role;begin;alter table training_requests disable trigger user");
  requestId=(await db.query<{id:string}>("insert into training_requests(requester_personnel_id,requester_badge_number,requester_email,requester_name,training_title,status,request_number,start_date,end_date,gsa_mileage_rate,submitted_at) values($1,'owner','owner@example.test','Sample Owner','Training','approved','SAMPLE-2026',current_date-10,current_date-2,.725,now()) returning id",[ids.owner])).rows[0].id;
  await db.exec("alter table training_requests enable trigger user");
  await db.query("insert into system_settings(key,value) values('gsa_mileage_rate','0.725') on conflict(key) do update set value=excluded.value");await role();packet=undefined as unknown as CompensationPacket;
  await act("save");
 });
 afterEach(async()=>{await db.exec("rollback;reset role");});after(async()=>{await db?.close();});
 it("allows requester draft, signed submission, signed MTO approval, then office coding",async()=>{
  assert.equal(packet.status,"draft");await act("submit",ids.owner,signed);assert.equal(packet.status,"pending_mto");
  await act("approve",ids.mto,{...signed,signature:fixture.mto_signature});assert.equal(packet.status,"pending_office");assert.deepEqual(packet.requester_signature,fixture.requester_signature);
  await act("complete",ids.admin,{...signed,codes:["TTM"]});assert.equal(packet.status,"completed");assert.equal(packet.office_name,"admin Sample");assert.deepEqual(packet.office_codes,["TTM"]);
  const events=(await db.query("select action,snapshot from training_compensation_events order by version")).rows;assert.deepEqual(events.map(e=>e.action),["submitted","mto_approved","office_completed"]);assert.equal((events[0].snapshot as CompensationPacket).status,"pending_mto");
 });
 it("requires MTO signature before any office action",async()=>{
  await act("submit",ids.owner,signed);await reject(()=>act("approve",ids.mto),/signature/);await reject(()=>act("complete",ids.admin,{...signed,codes:["TTM"]}),/after MTO approval/);
 });
 it("does not allow an admin or deputy to impersonate the MTO step",async()=>{await act("submit",ids.owner,signed);for(const actor of [ids.admin,ids.deputy,ids.owner])await reject(()=>act("approve",actor,signed),/MTO review/);});
 it("allows administrative privileges including deputy and MTO for office coding only after MTO signature",async()=>{await act("submit",ids.owner,signed);await act("approve",ids.mto,signed);await act("complete",ids.deputy,{...signed,codes:["OC"]});assert.equal(packet.office_name,"deputy Sample");});
 it("returns with a reason, allows correction and preserves earlier signed data and receipts",async()=>{
  await act("receipts",ids.owner,{receipts:[{id:"original-receipt",path:"original.pdf"}]});await act("submit",ids.owner,signed);
  await reject(()=>act("return",ids.mto,{note:""}),/Explain/);await act("return",ids.mto,{note:"Please correct November 10 hours"});assert.equal(packet.status,"returned");
  await act("save",ids.owner,{data:{...fixture.data,instructor:"Corrected Instructor"}});await act("receipts",ids.owner,{receipts:[]});await act("submit",ids.owner,signed);
  const old=(await db.query<{snapshot:CompensationPacket}>("select snapshot from training_compensation_events where action='submitted' order by version limit 1")).rows[0].snapshot;
  assert.equal(old.data.instructor,fixture.data.instructor);assert.equal(old.receipts.length,1);assert.equal(packet.receipts.length,0);
 });
 it("rejects stale saves, duplicate submissions and edits to signed packets",async()=>{const old=packet.version;await act("save");await reject(()=>act("save",ids.owner,{version:old}),/changed/);await act("submit",ids.owner,signed);await reject(()=>act("save"),/draft or returned/);await reject(()=>act("submit",ids.owner,signed),/draft or returned/);});
 it("uses the current setting on drafts while retaining requester identity and the original training estimate",async()=>{
  await db.query("update system_settings set value='0.8155' where key='gsa_mileage_rate'");
  await act("save",ids.owner,{identity:{...fixture.identity,name:"Someone else",mileageRate:99}});
  assert.equal(packet.identity.mileageRate,.8155);assert.equal(packet.identity.name,fixture.identity.name);
  const request=(await db.query<{gsa_mileage_rate:string}>("select gsa_mileage_rate from training_requests where id=$1",[requestId])).rows[0];assert.equal(Number(request.gsa_mileage_rate),.725);
 });
 it("rejects stale PDF rates at commit and preserves signed rates through MTO and office processing",async()=>{
  await db.query("update system_settings set value='0.8' where key='gsa_mileage_rate'");
  await reject(()=>act("submit",ids.owner,signed),/Mileage rate changed/);
  assert.equal(packet.status,"draft");
  await act("submit",ids.owner,{...signed,identity:{...fixture.identity,mileageRate:.8}});assert.equal(packet.identity.mileageRate,.8);
  await db.query("update system_settings set value='0.9' where key='gsa_mileage_rate'");
  await act("approve",ids.mto,signed);await act("complete",ids.admin,{...signed,codes:["TTM"]});
  assert.equal(packet.identity.mileageRate,.8);
  const events=(await db.query<{snapshot:CompensationPacket}>("select snapshot from training_compensation_events order by version")).rows;
  assert.deepEqual(events.map(e=>e.snapshot.identity.mileageRate),[.8,.8,.8]);
 });
 it("preserves the first signed rate when a returned packet is resubmitted at a new rate",async()=>{
  await act("submit",ids.owner,signed);await act("return",ids.mto,{note:"Please correct the hours"});
  await db.query("update system_settings set value='0.8' where key='gsa_mileage_rate'");
  await act("submit",ids.owner,{...signed,identity:{...fixture.identity,mileageRate:.8}});
  const events=(await db.query<{snapshot:CompensationPacket}>("select snapshot from training_compensation_events where action='submitted' order by version")).rows;
  assert.deepEqual(events.map(e=>e.snapshot.identity.mileageRate),[.725,.8]);
 });
 it("rejects a missing setting and nonnumeric or stale submission rates",async()=>{
  for(const mileageRate of [undefined,null,"bad","0.725",.7])await reject(()=>act("submit",ids.owner,{...signed,identity:{...fixture.identity,mileageRate}}),/Mileage rate changed/);
  await db.query("delete from system_settings where key='gsa_mileage_rate'");await reject(()=>act("save"),/valid mileage rate/);
 });
 it("permits an MTO to sign their own submission in both roles and keeps the requester date",async()=>{
  await db.exec("reset role");await db.query("update personnel set role='mto' where id=$1",[ids.owner]);await role();
  await act("submit",ids.owner,signed);
  const requester=structuredClone(packet.requester_signature);
  await act("approve",ids.owner,{...signed,signature:{...fixture.mto_signature,name:requester!.name}});
  assert.equal(packet.status,"pending_office");assert.deepEqual(packet.requester_signature,requester);assert.equal(packet.mto_signature?.name,requester?.name);
  const events=(await db.query<{actor_id:string}>("select actor_id from training_compensation_events order by version")).rows;assert.deepEqual(events.map(e=>e.actor_id),[ids.owner,ids.owner]);
 });
 it("rejects another requester or inactive account",async()=>{await reject(()=>act("save",ids.other),/Only the requester/);await db.exec("reset role");await db.query("update personnel set active=false where id=$1",[ids.owner]);await role();await reject(()=>act("save"),/Active account/);});
 it("enforces read privacy and denies direct client writes and privileged RPC calls",async()=>{
  await role("authenticated","other@example.test");assert.equal((await db.query("select id from training_compensation_packets")).rows.length,0);
  await role("authenticated","owner@example.test");assert.equal((await db.query("select id from training_compensation_packets")).rows.length,1);
  await reject(()=>db.query("update training_compensation_packets set status='completed'"),/permission denied/);await reject(()=>act("submit",ids.owner,signed),/permission denied/);
  await role("authenticated","mto@example.test");assert.equal((await db.query("select id from training_compensation_packets")).rows.length,1);
  await role("anon");await reject(()=>db.query("select * from training_compensation_packets"),/permission denied/);
 });
 it("rejects access and changes after the associated request is deleted",async()=>{
  await db.exec("reset role;alter table training_requests disable trigger user");await db.query("update training_requests set deleted_at=now(),deleted_by_personnel_id=$2,deleted_by_name='Admin',deletion_reason='Duplicate' where id=$1",[requestId,ids.admin]);await db.exec("alter table training_requests enable trigger user");await role();await reject(()=>act("submit",ids.owner,signed),/after approved training/);await role("authenticated","mto@example.test");assert.equal((await db.query("select * from training_compensation_packets")).rows.length,0);
 });
 it("prevents future and denied training compensation",async()=>{
  await db.exec("reset role;alter table training_requests disable trigger user");await db.query("update training_requests set end_date=current_date+1 where id=$1",[requestId]);await db.exec("alter table training_requests enable trigger user");await role();await reject(()=>act("save"),/after approved training/);
 });
 it("makes submitted history immutable even to a service writer",async()=>{await act("submit",ids.owner,signed);await reject(()=>db.query("update training_compensation_events set note='overwrite'"),/immutable/);await reject(()=>db.query("delete from training_compensation_events"),/immutable/);});
 it("lets Office read packets like Admin but code them only after MTO signature",async()=>{
  await role("authenticated","office@example.test");
  assert.equal((await db.query("select id from training_compensation_packets")).rows.length,1);
  await role();await act("submit",ids.owner,signed);
  await reject(()=>act("complete",ids.office,{...signed,codes:["TTM"]}),/after MTO approval/);
  await reject(()=>act("approve",ids.office,signed),/MTO review/);
  await role("authenticated","office@example.test");assert.equal((await db.query("select id from training_compensation_packets")).rows.length,1);assert.equal((await db.query("select id from training_compensation_events")).rows.length,1);
  await role();await act("approve",ids.mto,{...signed,signature:fixture.mto_signature});
  await role("authenticated","office@example.test");
  assert.equal((await db.query("select id from training_compensation_packets")).rows.length,1);assert.equal((await db.query("select id from training_compensation_events")).rows.length,2);
  // Office also has read-only approved request access for City Authorization.
  assert.equal((await db.query("select id from training_requests")).rows.length,1);
  await reject(()=>db.query("update training_compensation_packets set status='completed'"),/permission denied/);
  await reject(()=>act("complete",ids.office,{...signed,codes:["TTM"]}),/permission denied/);
  await role();await act("complete",ids.office,{...signed,codes:["TTM"]});
  assert.equal(packet.office_name,"office Sample");assert.equal(packet.status,"completed");assert.deepEqual(packet.requester_signature,fixture.requester_signature);assert.deepEqual(packet.mto_signature,fixture.mto_signature);
  await role("authenticated","office@example.test");assert.equal((await db.query("select id from training_compensation_packets")).rows.length,1);
 });
 it("gives Office the same user management, request deletion and settings access as Admin",async()=>{
  for(const email of ["office@example.test","admin@example.test"]){
   await role("authenticated",email);
   const permissions=(await db.query<{admin:boolean;routing:boolean;deletion:boolean;signature:boolean}>("select is_personnel_administrator() as admin,is_personnel_routing_role() as routing,is_training_request_deletion_admin() as deletion,can_manage_own_personnel_signature() as signature")).rows[0];
   assert.deepEqual(permissions,{admin:true,routing:true,deletion:true,signature:true},email);
   assert.ok((await db.query("select id from personnel")).rows.length>1,email);
  }
  await role("authenticated","owner@example.test");
  const owner=(await db.query<{admin:boolean;deletion:boolean}>("select is_personnel_administrator() as admin,is_training_request_deletion_admin() as deletion")).rows[0];
  assert.deepEqual(owner,{admin:false,deletion:false});
  await role("authenticated","office@example.test");
  await db.query("select admin_set_training_request_deleted($1,now(),true,'Duplicate entry')",[requestId]);
  await db.exec("reset role");
  assert.ok((await db.query<{deleted_at:string|null}>("select deleted_at from training_requests where id=$1",[requestId])).rows[0].deleted_at);
 });
 it("blocks inactive Office accounts and deleted requests",async()=>{
  await act("submit",ids.owner,signed);await act("approve",ids.mto,signed);
  await db.exec("reset role");await db.query("update personnel set active=false where id=$1",[ids.office]);await role("authenticated","office@example.test");assert.equal((await db.query("select id from training_compensation_packets")).rows.length,0);
  await role();await reject(()=>act("complete",ids.office,{...signed,codes:["TTM"]}),/Active account/);
  await db.exec("reset role;alter table training_requests disable trigger user");await db.query("update personnel set active=true where id=$1",[ids.office]);await db.query("update training_requests set deleted_at=now(),deleted_by_personnel_id=$2,deleted_by_name='Admin',deletion_reason='Duplicate' where id=$1",[requestId,ids.admin]);await db.exec("alter table training_requests enable trigger user");
  await role("authenticated","office@example.test");assert.equal((await db.query("select id from training_compensation_packets")).rows.length,0);assert.equal((await db.query("select id from training_compensation_events")).rows.length,0);
 });
 it("retains owner access when an Office user requests their own training",async()=>{
  await db.exec("reset role");await db.query("update personnel set role='office' where id=$1",[ids.owner]);await role("authenticated","owner@example.test");assert.equal((await db.query("select id from training_compensation_packets")).rows.length,1);
  await role();await act("submit",ids.owner,signed);assert.equal(packet.status,"pending_mto");
 });
 it("clears the Office alert only after a valid, recorded submission by Office or a backup",async()=>{
  const officeActor={id:ids.office,role:"office" as const};
  await act("submit",ids.owner,signed);await act("approve",ids.mto,signed);
  assert.equal(compensationNeedsAction(packet,officeActor),true);
  await reject(()=>act("complete",ids.office,{...signed,codes:[]}),/compensation codes/);
  assert.equal(compensationNeedsAction(packet,officeActor),true);
  const requester=structuredClone(packet.requester_signature),mto=structuredClone(packet.mto_signature),version=packet.version;
  await act("complete",ids.admin,{...signed,codes:["OC"]});
  assert.equal(compensationNeedsAction(packet,officeActor),false);
  assert.equal(packet.office_name,"admin Sample");assert.deepEqual(packet.office_codes,["OC"]);assert.ok(packet.office_completed_at);
  assert.deepEqual(packet.requester_signature,requester);assert.deepEqual(packet.mto_signature,mto);
  const event=(await db.query<{actor_id:string;snapshot:CompensationPacket}>("select actor_id,snapshot from training_compensation_events where action='office_completed'")).rows[0];
  assert.equal(event.actor_id,ids.admin);assert.equal(event.snapshot.status,"completed");
  await reject(()=>act("complete",ids.office,{...signed,codes:["OC"],version}),/changed/);
 });
 it("rejects office completion without valid compensation codes",async()=>{await act("submit",ids.owner,signed);await act("approve",ids.mto,signed);for(const codes of [[],["FAKE"]])await reject(()=>act("complete",ids.admin,{...signed,codes}),/compensation codes/);});
});
