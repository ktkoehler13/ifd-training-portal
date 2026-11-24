import assert from "node:assert/strict";
import {beforeEach,describe,it} from "node:test";
import {registerHooks} from "node:module";
import {createHash} from "node:crypto";
import {compensationFixture} from "./fixtures";
import {readFileSync} from "node:fs";
const png=new Uint8Array(readFileSync("lib/compensation/fixtures/sample-signature.png"));
const hash=(b:Uint8Array)=>createHash("sha256").update(b).digest("hex");
const state:{actor:Record<string,unknown>|null;request:Record<string,unknown>;packet:typeof compensationFixture|null;uploads:number;rpcCalls:number;objects:Map<string,Uint8Array>;signature:Uint8Array;failRpc:boolean;rate:string|null;rateError:boolean;rateAtCommit:string|null}={actor:null,request:{},packet:null,uploads:0,rpcCalls:0,objects:new Map(),signature:png,failRpc:false,rate:"0.725",rateError:false,rateAtCommit:null};
const client={
 from(table:string) {
  const result=()=>({data:table==="training_requests"?state.request:table==="training_compensation_packets"?state.packet:table==="system_settings"?(state.rate===null?null:{value:state.rate}):table==="training_compensation_events"?[]:null,error:table==="system_settings"&&state.rateError?{message:"Unavailable"}:null});
  const query={select(){return query;},eq(){return query;},order(){return Promise.resolve(result());},async maybeSingle(){return result();}};return query;
 },
 storage:{from(){return {
  async upload(path:string,bytes:Uint8Array){state.uploads++;state.objects.set(path,bytes);return {error:null};},
  async download(path:string){const bytes=state.objects.get(path);return bytes?{data:new Blob([Buffer.from(bytes)]),error:null}:{data:null,error:{message:"missing"}};}
 };}},
 async rpc(_name:string,args:Record<string,unknown>){
  state.rpcCalls++;
  if(state.failRpc)return {data:null,error:{message:"Connection lost"}};
  if(state.rateAtCommit){state.rate=state.rateAtCommit;return {data:null,error:{message:"Mileage rate changed. Review the updated totals and sign again"}};}
  const packet={...state.packet!,data:args.p_data as typeof compensationFixture.data,identity:args.p_identity as typeof compensationFixture.identity,version:(state.packet?.version??0)+1};
  if(args.p_action==="submit") {packet.requester_signature=args.p_signature as typeof packet.requester_signature;packet.status="pending_mto";}
  if(args.p_action==="approve") {packet.mto_signature=args.p_signature as typeof packet.mto_signature;packet.status="pending_office";}
  if(args.p_action==="complete") {packet.status="completed";packet.office_codes=args.p_office_codes as typeof packet.office_codes;packet.office_name=[state.actor!.firstName,state.actor!.lastName].join(" ");}
  if(args.p_pdf_path){packet.pdf_path=String(args.p_pdf_path);packet.pdf_sha256=String(args.p_pdf_sha256);}
  state.packet=packet;return {data:packet,error:null};
 }
};
const g=globalThis as typeof globalThis&{__compensationTest?:object};g.__compensationTest={state,client};
const adapters:Record<string,string>={
 "server-only":"",
 "@/lib/auth/personnel":"exports.getAuthenticatedPersonnel=async()=>globalThis.__compensationTest.state.actor;",
 "@/lib/supabase/server":"exports.createClient=async()=>globalThis.__compensationTest.client;",
 "@/lib/supabase/service":"exports.createServiceRoleClient=()=>globalThis.__compensationTest.client;",
 "@/lib/training-request-workflow-server":"exports.loadPersonnelSignaturePng=async()=>globalThis.__compensationTest.state.signature;",
};
registerHooks({resolve(specifier,ctx,next){return Object.hasOwn(adapters,specifier)?{url:`compensation-test:${specifier}`,shortCircuit:true}:next(specifier,ctx);},load(url,ctx,next){return url.startsWith("compensation-test:")?{source:adapters[url.slice(18)],format:"commonjs",shortCircuit:true}:next(url,ctx);}});
describe("compensation server authorization and immutable file capture",async()=>{
 const server=await import("./server");
 const id=compensationFixture.request_id;
 beforeEach(()=>{state.actor={id:compensationFixture.requester_id,firstName:"Sample",lastName:"Requester",role:"firefighter",active:true,mustChangePassword:false};state.request={id,requester_personnel_id:compensationFixture.requester_id,status:"approved",end_date:"2026-01-01",requester_name:"Sample Requester",requester_badge_number:"999",training_title:"Course",gsa_mileage_rate:.725};state.packet={...structuredClone(compensationFixture),status:"draft",version:1,requester_signature:null,mto_signature:null};state.uploads=0;state.rpcCalls=0;state.objects.clear();state.signature=png;state.failRpc=false;state.rate="0.725";state.rateError=false;state.rateAtCommit=null;});
 const submit=(expectedMileageRate=.725)=>server.actOnCompensation(id,{action:"submit",version:1,data:compensationFixture.data,confirmed:true,expectedMileageRate});
 it("requires a signed-in account and completed password setup",async()=>{state.actor=null;await assert.rejects(()=>submit(),/Sign in/);state.actor={id:"none",mustChangePassword:true};await assert.rejects(()=>submit(),/password/);assert.equal(state.uploads,0);});
 it("conceals another user's request and blocks deleted requests",async()=>{state.actor!.id="someone-else";await assert.rejects(()=>submit(),/not found/);state.actor!.role="mto";state.request.deleted_at="2026-11-01";await assert.rejects(()=>submit(),/not found/);assert.equal(state.rpcCalls,0);});
 it("requires explicit signing consent and validated time rows before uploads",async()=>{await assert.rejects(server.actOnCompensation(id,{action:"submit",version:1,data:compensationFixture.data,confirmed:false,expectedMileageRate:.725}),/Confirm/);await assert.rejects(server.actOnCompensation(id,{action:"submit",version:1,data:{...compensationFixture.data,time:[]},confirmed:true}),/at least one/);assert.equal(state.uploads,0);});
 it("rejects a missing or invalid signature without advancing",async()=>{state.signature=new Uint8Array();await assert.rejects(submit);assert.equal(state.rpcCalls,0);assert.equal(state.uploads,0);});
 it("captures verified signature and PDF bytes before the state transition",async()=>{const packet=await submit();assert.equal(state.uploads,2);assert.equal(state.rpcCalls,1);assert.equal(packet.requester_signature?.sha256,hash(png));assert.ok(packet.pdf_path?.startsWith(`${state.packet!.id}/`));assert.equal(packet.pdf_sha256,hash(state.objects.get(packet.pdf_path!)!));});
 it("never removes snapshots when database completion is ambiguous",async()=>{state.failRpc=true;await assert.rejects(()=>submit(),/Connection lost/);assert.equal(state.objects.size,2);});
 it("does not accept requester or office attempts to skip MTO signing",async()=>{state.packet!.status="pending_mto";await assert.rejects(server.actOnCompensation(id,{action:"approve",version:1,confirmed:true}),/MTO review/);state.actor!.role="admin";await assert.rejects(server.actOnCompensation(id,{action:"complete",version:1,officeCodes:["TTM"]}),/after MTO approval/);assert.equal(state.uploads,0);});
 it("rejects stale versions before generating new files",async()=>{state.packet!.version=2;await assert.rejects(()=>submit(),/changed/);assert.equal(state.uploads,0);});
 it("checks receipt ownership and integrity before returning bytes",async()=>{const path=`${state.packet!.id}/receipt.pdf`,bytes=new TextEncoder().encode("%PDF-sample");state.objects.set(path,bytes);state.packet!.receipts=[{id:"receipt",path,sha256:hash(bytes),name:"receipt.pdf",contentType:"application/pdf",size:bytes.length}];assert.deepEqual((await server.compensationFile(id,null,"receipt")).bytes,bytes);state.objects.set(path,new Uint8Array([1]));await assert.rejects(server.compensationFile(id,null,"receipt"),/verified/);await assert.rejects(server.compensationFile(id,null,"unrelated"),/not found/);});
 it("shows the current setting on drafts without rewriting stored or signed identity",async()=>{
  state.rate="0.81";
  const draft=await server.compensationDetail(id);assert.equal(draft.request.mileageRate,.81);assert.equal(draft.packet?.identity.mileageRate,.81);assert.equal(state.packet!.identity.mileageRate,.725);
  state.packet!.status="returned";assert.equal((await server.compensationDetail(id)).packet?.identity.mileageRate,.81);
  state.packet!.status="pending_mto";state.rateError=true;assert.equal((await server.compensationDetail(id)).packet?.identity.mileageRate,.725);
  state.rateError=false;state.packet=null;assert.equal((await server.compensationDetail(id)).request.mileageRate,.81);
 });
 it("captures the current configured rate instead of the original training estimate",async()=>{
  state.rate="0.8155";
  const saved=await server.actOnCompensation(id,{action:"save",version:1,data:compensationFixture.data});assert.equal(saved.identity.mileageRate,.8155);
  const packet=await server.actOnCompensation(id,{action:"submit",version:saved.version,data:compensationFixture.data,confirmed:true,expectedMileageRate:.8155});
  assert.equal(packet.identity.mileageRate,.8155);assert.equal(state.request.gsa_mileage_rate,.725);
 });
 it("requires a fresh confirmation when the displayed rate is stale",async()=>{
  state.rate="0.8";
  await assert.rejects(()=>submit(),(error:unknown)=>error instanceof server.CompensationRateChangedError&&error.currentMileageRate===.8&&error.status===409);
  assert.equal(state.uploads,0);assert.equal(state.rpcCalls,0);
  assert.equal((await submit(.8)).identity.mileageRate,.8);
 });
 it("does not use a historical rate when the setting is missing, invalid or unavailable",async()=>{
  for(const rate of [null,"","bad","0","-1",".8","0.12345"]){state.rate=rate;await assert.rejects(()=>submit(),/current mileage rate is unavailable/);}
  state.rate="0.725";state.rateError=true;await assert.rejects(()=>submit(),/current mileage rate is unavailable/);
  assert.equal(state.uploads,0);assert.equal(state.rpcCalls,0);
 });
 it("returns a fresh rate if an administrator changes it during file generation",async()=>{
  state.rateAtCommit="0.8";
  await assert.rejects(()=>submit(),(error:unknown)=>error instanceof server.CompensationRateChangedError&&error.currentMileageRate===.8);
  assert.equal(state.packet!.status,"draft");assert.equal(state.packet!.version,1);
  state.rateAtCommit=null;assert.equal((await submit(.8)).identity.mileageRate,.8);
 });
 it("allows an MTO to submit and approve their own packet with separate immutable signature captures",async()=>{
  state.actor!.role="mto";
  const submitted=await submit(),requester=structuredClone(submitted.requester_signature);
  state.rate="0.9";state.rateError=true;
  const approved=await server.actOnCompensation(id,{action:"approve",version:submitted.version,confirmed:true});
  assert.equal(approved.status,"pending_office");assert.deepEqual(approved.requester_signature,requester);
  assert.equal(approved.mto_signature?.name,requester?.name);assert.equal(approved.mto_signature?.sha256,requester?.sha256);
  assert.notEqual(approved.mto_signature?.path,requester?.path);assert.equal(approved.identity.mileageRate,.725);
  assert.equal(state.objects.size,4);
  assert.deepEqual((await server.compensationFile(id,null,null)).bytes,state.objects.get(approved.pdf_path!));
 });
 it("conceals unfinished packets and their receipts from other requesters",async()=>{
  state.actor!.id="other-person";state.actor!.role="firefighter";
  for(const status of ["draft","returned","pending_mto"] as const){state.packet!.status=status;await assert.rejects(()=>server.compensationDetail(id),/not found/);await assert.rejects(()=>server.compensationFile(id,null,"receipt"),/not found/);}
  state.packet=null;await assert.rejects(()=>server.compensationDetail(id),/not found/);
  assert.equal(state.uploads,0);
 });
 it("allows Office to read signed handoffs and complete coding while preserving both signatures",async()=>{
  state.actor!.role="mto";
  const submitted=await submit();
  const approved=await server.actOnCompensation(id,{action:"approve",version:submitted.version,confirmed:true});
  const requester=structuredClone(approved.requester_signature),mto=structuredClone(approved.mto_signature);
  state.actor={...state.actor,id:"office-person",role:"office",firstName:"Office",lastName:"Staff"};
  assert.equal((await server.compensationDetail(id)).packet?.status,"pending_office");
  assert.ok((await server.compensationFile(id,null,null)).bytes.length>0);
  await assert.rejects(()=>server.actOnCompensation(id,{action:"save",version:approved.version,data:compensationFixture.data}),/Only the requester/);
  await assert.rejects(()=>server.actOnCompensation(id,{action:"approve",version:approved.version,confirmed:true}),/MTO review/);
  const completed=await server.actOnCompensation(id,{action:"complete",version:approved.version,officeCodes:["TTM"]});
  assert.equal(completed.status,"completed");assert.equal(completed.office_name,"Office Staff");assert.deepEqual(completed.requester_signature,requester);assert.deepEqual(completed.mto_signature,mto);
 });
 it("rejects Office access to a deleted request's packet",async()=>{
  state.actor!.id="office-person";state.actor!.role="office";state.packet!.status="pending_office";
  state.packet!.mto_signature=compensationFixture.mto_signature;state.request.deleted_at="2026-11-19";await assert.rejects(()=>server.compensationDetail(id),/not found/);
 });
 it("rejects oversized or mismatched receipt types",async()=>{for(const file of [new File([new Uint8Array(4*1024*1024+1)],"large.pdf",{type:"application/pdf"}),new File(["<svg/>"],"fake.png",{type:"image/png"})]){const form=new FormData();form.set("version","1");form.set("file",file);await assert.rejects(server.uploadCompensationReceipt(id,form));}assert.equal(state.uploads,0);});
});
