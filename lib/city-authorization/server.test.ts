import assert from "node:assert/strict";
import {beforeEach,describe,it} from "node:test";
import {registerHooks} from "node:module";
import {createHash} from "node:crypto";
import type {CityAuthorization,CityAuthorizationFile} from "./model";
const requestId="11111111-1111-4111-8111-111111111111",ownerId="22222222-2222-4222-8222-222222222222",officeId="33333333-3333-4333-8333-333333333333";
const pdf=new TextEncoder().encode("%PDF-1.7 sample authorization");
const state:{actor:Record<string,unknown>|null;request:Record<string,unknown>;authorization:CityAuthorization|null;files:CityAuthorizationFile[];objects:Map<string,Uint8Array>;uploads:number;rpcCalls:number;uploadError:boolean;corrupt:boolean;rpcError:boolean}={actor:null,request:{},authorization:null,files:[],objects:new Map(),uploads:0,rpcCalls:0,uploadError:false,corrupt:false,rpcError:false};
const client={
 from(table:string){const filters:Record<string,unknown>={};const result=()=>({data:table==="training_requests"?state.request:table==="training_request_city_authorizations"?state.authorization:table==="training_request_city_authorization_files"?state.files.filter(f=>(!filters.id||f.id===filters.id)&&(!filters.request_id||f.request_id===filters.request_id)):null,error:null});
 const query={select(){return query;},eq(k:string,v:unknown){filters[k]=v;return query;},async order(){return result();},async maybeSingle(){const value=result();return {...value,data:Array.isArray(value.data)?value.data[0]??null:value.data};}};return query;
 },
 storage:{from(){return {async upload(path:string,bytes:Uint8Array){state.uploads++;if(state.uploadError)return {error:{message:"Unavailable"}};state.objects.set(path,bytes);return {error:null};},async download(path:string){const bytes=state.objects.get(path);return bytes?{data:new Blob([Buffer.from(state.corrupt?new Uint8Array([1]):bytes)]),error:null}:{data:null,error:{message:"Missing"}};}};}},
 async rpc(name:string,args:Record<string,unknown>){state.rpcCalls++;if(state.rpcError)return {data:null,error:{message:"Unable to confirm database save"}};
 if(name==="record_city_authorization_file_removal"){if(Number(args.p_expected_version)!==state.authorization?.version)return {data:null,error:{message:"This authorization changed. Reload before removing a file"}};const target=state.files.find(f=>f.id===args.p_file_id&&!f.removed_at);if(!target)return {data:null,error:{message:"City Authorization file not found"}};target.removed_at="2026-11-21T13:00:00Z";target.removed_by_name="Office Staff";const left=state.files.some(f=>!f.removed_at);state.authorization={...state.authorization,version:state.authorization.version+1,...(left?{}:{status:"pending",completed_at:null,completed_by_name:null})};return {data:state.authorization,error:null};}
 const version=Number(args.p_expected_version)+1;state.authorization={request_id:requestId,status:"uploaded",version,created_at:"2026-11-19T12:00:00Z",completed_at:"2026-11-19T13:00:00Z",completed_by_name:"Office Staff"};
 state.files.push({id:String(args.p_file_id),request_id:requestId,version,file_name:String(args.p_file_name),storage_path:String(args.p_storage_path),content_type:String(args.p_content_type),file_size_bytes:Number(args.p_file_size_bytes),sha256:String(args.p_sha256),uploaded_by_name:"Office Staff",uploaded_at:"2026-11-19T13:00:00Z"});return {data:state.authorization,error:null};}
};
(globalThis as typeof globalThis&{__cityTest?:object}).__cityTest={state,client};
const adapters:Record<string,string>={"server-only":"","@/lib/auth/personnel":"exports.getAuthenticatedPersonnel=async()=>globalThis.__cityTest.state.actor;","@/lib/supabase/server":"exports.createClient=async()=>globalThis.__cityTest.client;","@/lib/supabase/service":"exports.createServiceRoleClient=()=>globalThis.__cityTest.client;"};
registerHooks({resolve(s,c,next){return Object.hasOwn(adapters,s)?{url:`city-test:${s}`,shortCircuit:true}:next(s,c);},load(url,c,next){return url.startsWith("city-test:")?{source:adapters[url.slice(10)],format:"commonjs",shortCircuit:true}:next(url,c);}});
describe("City Authorization private upload and download",async()=>{
 const server=await import("./server");
 beforeEach(()=>{state.actor={id:officeId,role:"office",active:true,mustChangePassword:false};state.request={id:requestId,requester_personnel_id:ownerId,status:"approved",deleted_at:null};state.authorization=null;state.files=[];state.objects.clear();state.uploads=0;state.rpcCalls=0;state.uploadError=false;state.corrupt=false;state.rpcError=false;});
 function form(file=new File([pdf],"City Authorization.pdf",{type:"application/pdf"}),version="0"){const data=new FormData();data.set("version",version);data.set("file",file);return data;}
 const upload=()=>server.uploadCityAuthorization(requestId,form());
 it("requires active sign-in and password setup before uploads",async()=>{
  for(const actor of [null,{id:officeId,role:"office",active:false},{id:officeId,role:"office",active:true,mustChangePassword:true}]){state.actor=actor;await assert.rejects(upload);}
  assert.equal(state.uploads,0);
 });
 it("allows Office and the administrative backups to upload, but the requester only to download",async()=>{
  for(const role of ["office","admin","mto","deputy_chief"]){state.actor!.role=role;const detail=await server.cityAuthorizationDetail(requestId);assert.equal(detail.canUpload,true);}
  state.actor={id:ownerId,role:"firefighter",active:true};assert.equal((await server.cityAuthorizationDetail(requestId)).canUpload,false);await assert.rejects(upload,/Office or administrative/);await assert.rejects(()=>server.listCityAuthorizations(),/Office or administrative/);assert.equal(state.uploads,0);
 });
 it("blocks unrelated users, denied requests, pending approvals and deleted requests",async()=>{
  state.actor!.role="firefighter";await assert.rejects(upload,/not found/);
  state.actor!.role="office";for(const status of ["draft","pending_mto","pending_deputy_chief","denied"]){state.request.status=status;await assert.rejects(upload,/not found/);}
  state.request.status="approved";state.request.deleted_at="2026-11-19";await assert.rejects(upload,/not found/);assert.equal(state.uploads,0);
 });
 it("verifies private bytes before completing the Office step and preserves earlier copies",async()=>{
  const first=await upload();assert.equal(first.status,"uploaded");assert.equal(state.uploads,1);assert.equal(state.rpcCalls,1);
  const original=structuredClone(state.files[0]);assert.ok(original.storage_path.startsWith(requestId+"/"));assert.equal(original.sha256,createHash("sha256").update(pdf).digest("hex"));
  await server.uploadCityAuthorization(requestId,form(new File([pdf],"Revised.pdf",{type:"application/pdf"}),"1"));assert.deepEqual(state.files[0],original);assert.equal(state.files.length,2);assert.equal(state.objects.size,2);
  state.actor={id:ownerId,role:"firefighter",active:true};assert.deepEqual((await server.downloadCityAuthorization(requestId,original.id)).bytes,pdf);
 });
 it("rejects invalid file types, empty or oversized uploads and stale versions",async()=>{
  for(const file of [new File([],"empty.pdf",{type:"application/pdf"}),new File([new Uint8Array(4194305)],"huge.pdf",{type:"application/pdf"}),new File(["<svg/>"],"bad.png",{type:"image/png"}),new File([pdf],"bad.jpg",{type:"image/jpeg"})])await assert.rejects(()=>server.uploadCityAuthorization(requestId,form(file)));
  await assert.rejects(()=>server.uploadCityAuthorization(requestId,form(undefined,"5")),/changed/);await assert.rejects(()=>server.uploadCityAuthorization(requestId,form(undefined,"-1")),/Reload/);assert.equal(state.uploads,0);
 });
 it("does not complete the task when storage fails or cannot verify the bytes",async()=>{
  state.uploadError=true;await assert.rejects(upload,/not been completed/);state.uploadError=false;state.corrupt=true;await assert.rejects(upload,/not been completed/);assert.equal(state.rpcCalls,0);assert.equal(state.authorization,null);
 });
 it("preserves the uploaded object after an ambiguous database response",async()=>{
  state.rpcError=true;await assert.rejects(upload,/database save/);assert.equal(state.objects.size,1);assert.equal(state.authorization,null);
 });
 it("removes a wrong file, hides it from requesters and blocks its download",async()=>{
  await upload();const file=state.files[0];const rpcBefore=state.rpcCalls;
  state.actor={id:ownerId,role:"firefighter",active:true};await assert.rejects(()=>server.removeCityAuthorizationFile(requestId,{fileId:file.id,version:1}),/Office or administrative/);assert.equal(state.rpcCalls,rpcBefore);
  state.actor={id:officeId,role:"office",active:true,mustChangePassword:false};
  for(const input of [null,{},{fileId:"bad",version:1},{fileId:file.id,version:0},{fileId:file.id,version:"1"}])await assert.rejects(()=>server.removeCityAuthorizationFile(requestId,input));
  await assert.rejects(()=>server.removeCityAuthorizationFile(requestId,{fileId:file.id,version:5}),/changed/);
  const result=await server.removeCityAuthorizationFile(requestId,{fileId:file.id,version:1});assert.equal(result.status,"pending");
  assert.equal(state.objects.size,1);
  const office=await server.cityAuthorizationDetail(requestId);assert.equal(office.files.length,0);assert.equal(office.removedFiles.length,1);
  state.actor={id:ownerId,role:"firefighter",active:true};const owner=await server.cityAuthorizationDetail(requestId);assert.equal(owner.files.length,0);assert.equal(owner.removedFiles.length,0);
  await assert.rejects(()=>server.downloadCityAuthorization(requestId,file.id),/not found/);
  state.actor={id:officeId,role:"office",active:true,mustChangePassword:false};await assert.rejects(()=>server.removeCityAuthorizationFile(requestId,{fileId:file.id,version:2}),/not found/);
 });
 it("checks file ownership and hash on every download",async()=>{
  await upload();const file=state.files[0];state.corrupt=true;await assert.rejects(()=>server.downloadCityAuthorization(requestId,file.id),/verified/);state.corrupt=false;
  file.request_id="44444444-4444-4444-8444-444444444444";await assert.rejects(()=>server.downloadCityAuthorization(requestId,file.id),/not found/);
  file.request_id=requestId;file.storage_path="another-request/file.pdf";await assert.rejects(()=>server.downloadCityAuthorization(requestId,file.id),/not found/);
 });
});
