import assert from "node:assert/strict";
import {beforeEach,describe,it} from "node:test";
import {registerHooks} from "node:module";
import {createHash} from "node:crypto";
import {compensationFixture} from "./fixtures";
import {readFileSync} from "node:fs";
const png=new Uint8Array(readFileSync("lib/compensation/fixtures/sample-signature.png"));
const hash=(b:Uint8Array)=>createHash("sha256").update(b).digest("hex");
const state:{actor:Record<string,unknown>|null;request:Record<string,unknown>;packet:typeof compensationFixture|null;uploads:number;rpcCalls:number;objects:Map<string,Uint8Array>;signature:Uint8Array;failRpc:boolean}={actor:null,request:{},packet:null,uploads:0,rpcCalls:0,objects:new Map(),signature:png,failRpc:false};
const client={from(table:string){const filters:Record<string,unknown>={};const query={select(){return query;},eq(k:string,v:unknown){filters[k]=v;return query;},order(){return query;},async maybeSingle(){return {data:table==="training_requests"?state.request:table==="training_compensation_packets"?state.packet:null,error:null};}};return query;},storage:{from(){return {async upload(path:string,bytes:Uint8Array){state.uploads++;state.objects.set(path,bytes);return {error:null};},async download(path:string){const bytes=state.objects.get(path);return bytes?{data:new Blob([Buffer.from(bytes)]),error:null}:{data:null,error:{message:"missing"}};}};}},async rpc(_name:string,args:Record<string,unknown>){state.rpcCalls++;if(state.failRpc)return {data:null,error:{message:"Connection lost"}};return {data:{...state.packet,data:args.p_data,requester_signature:args.p_signature,pdf_path:args.p_pdf_path,pdf_sha256:args.p_pdf_sha256,version:2},error:null};}};
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
 beforeEach(()=>{state.actor={id:compensationFixture.requester_id,firstName:"Sample",lastName:"Requester",role:"firefighter",active:true,mustChangePassword:false};state.request={id,requester_personnel_id:compensationFixture.requester_id,status:"approved",end_date:"2026-01-01",requester_name:"Sample Requester",requester_badge_number:"999",training_title:"Course",gsa_mileage_rate:.725};state.packet={...structuredClone(compensationFixture),status:"draft",version:1,requester_signature:null,mto_signature:null};state.uploads=0;state.rpcCalls=0;state.objects.clear();state.signature=png;state.failRpc=false;});
 const submit=()=>server.actOnCompensation(id,{action:"submit",version:1,data:compensationFixture.data,confirmed:true});
 it("requires a signed-in account and completed password setup",async()=>{state.actor=null;await assert.rejects(submit,/Sign in/);state.actor={id:"none",mustChangePassword:true};await assert.rejects(submit,/password/);assert.equal(state.uploads,0);});
 it("conceals another user's request and blocks deleted requests",async()=>{state.actor!.id="someone-else";await assert.rejects(submit,/not found/);state.actor!.role="mto";state.request.deleted_at="2026-11-01";await assert.rejects(submit,/not found/);assert.equal(state.rpcCalls,0);});
 it("requires explicit signing consent and validated time rows before uploads",async()=>{await assert.rejects(server.actOnCompensation(id,{action:"submit",version:1,data:compensationFixture.data,confirmed:false}),/Confirm/);await assert.rejects(server.actOnCompensation(id,{action:"submit",version:1,data:{...compensationFixture.data,time:[]},confirmed:true}),/at least one/);assert.equal(state.uploads,0);});
 it("rejects a missing or invalid signature without advancing",async()=>{state.signature=new Uint8Array();await assert.rejects(submit);assert.equal(state.rpcCalls,0);assert.equal(state.uploads,0);});
 it("captures verified signature and PDF bytes before the state transition",async()=>{const packet=await submit();assert.equal(state.uploads,2);assert.equal(state.rpcCalls,1);assert.equal(packet.requester_signature?.sha256,hash(png));assert.ok(packet.pdf_path?.startsWith(`${state.packet!.id}/`));assert.equal(packet.pdf_sha256,hash(state.objects.get(packet.pdf_path!)!));});
 it("never removes snapshots when database completion is ambiguous",async()=>{state.failRpc=true;await assert.rejects(submit,/Connection lost/);assert.equal(state.objects.size,2);});
 it("does not accept requester or office attempts to skip MTO signing",async()=>{state.packet!.status="pending_mto";await assert.rejects(server.actOnCompensation(id,{action:"approve",version:1,confirmed:true}),/MTO review/);state.actor!.role="admin";await assert.rejects(server.actOnCompensation(id,{action:"complete",version:1,officeCodes:["TTM"]}),/after MTO approval/);assert.equal(state.uploads,0);});
 it("rejects stale versions before generating new files",async()=>{state.packet!.version=2;await assert.rejects(submit,/changed/);assert.equal(state.uploads,0);});
 it("checks receipt ownership and integrity before returning bytes",async()=>{const path=`${state.packet!.id}/receipt.pdf`,bytes=new TextEncoder().encode("%PDF-sample");state.objects.set(path,bytes);state.packet!.receipts=[{id:"receipt",path,sha256:hash(bytes),name:"receipt.pdf",contentType:"application/pdf",size:bytes.length}];assert.deepEqual((await server.compensationFile(id,null,"receipt")).bytes,bytes);state.objects.set(path,new Uint8Array([1]));await assert.rejects(server.compensationFile(id,null,"receipt"),/verified/);await assert.rejects(server.compensationFile(id,null,"unrelated"),/not found/);});
 it("rejects oversized or mismatched receipt types",async()=>{for(const file of [new File([new Uint8Array(4*1024*1024+1)],"large.pdf",{type:"application/pdf"}),new File(["<svg/>"],"fake.png",{type:"image/png"})]){const form=new FormData();form.set("version","1");form.set("file",file);await assert.rejects(server.uploadCompensationReceipt(id,form));}assert.equal(state.uploads,0);});
});
