import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { getAuthenticatedPersonnel } from "@/lib/auth/personnel";
import { isAdministrativeRole } from "@/lib/auth/roles";
import { PERSONNEL_TITLE_LABELS } from "@/types/personnel";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { loadPersonnelSignaturePng } from "@/lib/training-request-workflow-server";
import { verifyPngSignatureBytes } from "@/lib/personnel-signature-png";
import { renderCompensationPacket } from "@/lib/pdf/render-compensation-packet";
import { blankCompensation, isCompensationEligible, localToday, type CompensationPacket, type CompensationReceipt, type CompensationSignature } from "./model";
import { parseCompensationInput, parseOfficeCodes, validateCompensationSubmission } from "./validation";
import type { TrainingRequestRow } from "@/types/training-request";

const BUCKET="training-compensation";
const hash=(bytes:Uint8Array)=>createHash("sha256").update(bytes).digest("hex");
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export class CompensationError extends Error { constructor(message:string,public status=400){super(message);} }
export async function compensationActor() {
  const actor=await getAuthenticatedPersonnel();
  if(!actor) throw new CompensationError("Sign in to continue.",401);
  if(actor.mustChangePassword) throw new CompensationError("Set your account password before continuing.",403);
  return actor;
}
export async function loadCompensation(requestId:string) {
  if(!uuid.test(requestId)) throw new CompensationError("Request not found.",404);
  const actor=await compensationActor(),service=createServiceRoleClient();
  const {data:raw,error}=await service.from("training_requests").select("*").eq("id",requestId).maybeSingle();
  if(error) throw new CompensationError("Unable to load the training request.",503);
  const request=raw as TrainingRequestRow|null;
  if(!request || request.deleted_at || (actor.id!==request.requester_personnel_id && !isAdministrativeRole(actor.role))) throw new CompensationError("Request not found.",404);
  const {data,error:packetError}=await service.from("training_compensation_packets").select("*").eq("request_id",requestId).maybeSingle();
  if(packetError) throw new CompensationError("Unable to load compensation. Please try again.",503);
  const packet=data as CompensationPacket|null;
  return {actor,service,request,packet};
}
type Context=Awaited<ReturnType<typeof loadCompensation>>;
export async function compensationDetail(requestId:string) {
  const ctx=await loadCompensation(requestId),{actor,service,request,packet}=ctx;
  const {data:events,error}=packet?await service.from("training_compensation_events").select("id,packet_id,action,actor_name,created_at,note,version,pdf_path,snapshot").eq("packet_id",packet.id).order("version",{ascending:false}):{data:[],error:null};
  if(error) throw new CompensationError("Unable to load packet history.",503);
  let initial=blankCompensation();
  if(actor.id===request.requester_personnel_id && !packet) {
    const db=await createClient();
    const {data:address}=await db.from("personnel_addresses").select("street_address,city,state,zip").eq("personnel_id",actor.id).maybeSingle();
    initial={...initial,street:address?.street_address??request.requester_address??"",cityStateZip:address?`${address.city}, ${address.state} ${address.zip}`:[request.requester_city,request.requester_state,request.requester_zip].filter(Boolean).join(" "),title:PERSONNEL_TITLE_LABELS[actor.title]};
  }
  return {packet,events:(events??[]).map(({snapshot,...event})=>({...event,receipts:(snapshot as CompensationPacket).receipts})),initial,eligible:isCompensationEligible(request),request:{id:request.id,course:request.training_title,name:request.requester_name,badge:request.requester_badge_number,requestNumber:request.request_number,endDate:request.end_date,requesterId:request.requester_personnel_id,mileageRate:Number(request.gsa_mileage_rate)},actor:{id:actor.id,role:actor.role,name:[actor.firstName,actor.lastName].filter(Boolean).join(" ")}};
}
function editable({actor,packet,request}:Context) {
  if(actor.id!==request.requester_personnel_id || (packet && !["draft","returned"].includes(packet.status))) throw new CompensationError("Only the requester can edit a draft or returned packet.",403);
}
async function upload(ctx:Context,path:string,bytes:Uint8Array,type:string) {
  const {error}=await ctx.service.storage.from(BUCKET).upload(path,bytes,{contentType:type,upsert:false});
  if(error) throw new CompensationError("Unable to save the packet file. Your packet has not advanced.",503);
  const {data,error:readError}=await ctx.service.storage.from(BUCKET).download(path);
  if(readError || !data || hash(new Uint8Array(await data.arrayBuffer()))!==hash(bytes)) throw new CompensationError("Unable to verify the saved packet file. Please try again.",503);
}
async function download(ctx:Context,path:string,expectedHash:string) {
  if(!ctx.packet || !path.startsWith(`${ctx.packet.id}/`)) throw new CompensationError("Invalid packet file.",404);
  const {data,error}=await ctx.service.storage.from(BUCKET).download(path);
  if(error || !data) throw new CompensationError("Unable to download the packet file.",503);
  const bytes=new Uint8Array(await data.arrayBuffer());
  if(hash(bytes)!==expectedHash) throw new CompensationError("The saved file could not be verified.",503);
  return bytes;
}
async function signatures(ctx:Context,packet:CompensationPacket): Promise<{requester?:Uint8Array;mto?:Uint8Array}> {
  return {requester:packet.requester_signature?await download(ctx,packet.requester_signature.path,packet.requester_signature.sha256):undefined,mto:packet.mto_signature?await download(ctx,packet.mto_signature.path,packet.mto_signature.sha256):undefined};
}
async function persist(ctx:Context,args:Record<string,unknown>) {
  const {data,error}=await ctx.service.rpc("save_training_compensation",{
    p_actor_id:ctx.actor.id,p_request_id:ctx.request.id,p_expected_version:ctx.packet?.version??0,
    p_data:ctx.packet?.data??blankCompensation(),p_identity:ctx.packet?.identity??{},p_receipts:ctx.packet?.receipts??[],...args,
  });
  // Never remove uploaded snapshots on an ambiguous database response. A commit
  // may have succeeded despite a timeout; reload reconciles by version/history.
  if(error || !data) throw new CompensationError(error?.message??"Unable to confirm the change. Reload the packet before trying again.",409);
  return data as CompensationPacket;
}
export async function actOnCompensation(requestId:string,value:unknown) {
  const ctx=await loadCompensation(requestId),{actor,request,packet}=ctx;
  if(!value || typeof value!=="object") throw new CompensationError("Invalid packet action.");
  const v=value as Record<string,unknown>,action=v.action;
  if(!["save","submit","approve","return","complete"].includes(String(action))) throw new CompensationError("Invalid packet action.");
  if(!Number.isInteger(v.version) || v.version!==(packet?.version??0)) throw new CompensationError("This packet changed. Reload it before continuing.",409);
  if(!isCompensationEligible(request)) throw new CompensationError("Compensation is available after approved training is complete.");
  if(action==="save" || action==="submit") editable(ctx);
  if(action==="approve" || action==="return") {
    if(actor.role!=="mto" || packet?.status!=="pending_mto") throw new CompensationError("This packet requires MTO review.",403);
  }
  if(action==="complete" && (!isAdministrativeRole(actor.role) || packet?.status!=="pending_office")) throw new CompensationError("Office completion requires administrative privileges after MTO approval.",403);
  const input=action==="save" || action==="submit"?parseCompensationInput(v.data):packet!.data;
  if(action==="save") return persist(ctx,{p_action:"save",p_data:input,p_identity:{name:request.requester_name,badge:request.requester_badge_number,course:request.training_title,requestNumber:request.request_number??"",mileageRate:Number(request.gsa_mileage_rate)}});
  if(!packet) throw new CompensationError("Save the packet before submitting.");
  if(action==="return") {
    if(typeof v.note!=="string" || v.note.trim().length<3 || v.note.length>2000) throw new CompensationError("Explain the corrections needed (3–2,000 characters).");
    return persist(ctx,{p_action:"return",p_note:v.note.trim()});
  }
  const errors=validateCompensationSubmission(input,localToday());
  if(errors.length) throw new CompensationError(errors.join("\n"));
  const now=new Date().toISOString(),name=[actor.firstName,actor.lastName].filter(Boolean).join(" ");
  const updated={...packet,data:input,version:packet.version+1};
  let signature:CompensationSignature|null=null;
  const bytes=await signatures(ctx,packet);
  if(action==="submit" || action==="approve") {
    if(v.confirmed!==true) throw new CompensationError("Confirm the information and use of your electronic signature.");
    const png=await loadPersonnelSignaturePng(actor.id),verification=verifyPngSignatureBytes(png);
    if("error" in verification) throw new CompensationError(verification.error);
    signature={path:`${packet.id}/${randomUUID()}/signature.png`,sha256:hash(png),name,signedAt:now};
    await upload(ctx,signature.path,png,"image/png");
    if(action==="submit") {updated.requester_signature=signature;updated.mto_signature=null;updated.office_codes=[];updated.office_name=null;updated.office_completed_at=null;bytes.requester=png;bytes.mto=undefined;}
    else {updated.mto_signature=signature;bytes.mto=png;}
  } else {
    updated.office_codes=parseOfficeCodes(v.officeCodes);updated.office_name=name;updated.office_completed_at=now;
  }
  const pdf=await renderCompensationPacket(updated,bytes);
  const pdfPath=`${packet.id}/${randomUUID()}/packet.pdf`;
  await upload(ctx,pdfPath,pdf,"application/pdf");
  return persist(ctx,{p_action:action,p_data:input,p_signature:signature,p_pdf_path:pdfPath,p_pdf_sha256:hash(pdf),p_office_codes:updated.office_codes});
}
export async function compensationFile(requestId:string,version:string|null,receiptId:string|null) {
  const ctx=await loadCompensation(requestId);
  if(!ctx.packet) throw new CompensationError("Save the packet first.");
  let packet=ctx.packet;
  if(version!==null) {
    if(!/^\d+$/.test(version)) throw new CompensationError("Invalid packet version.");
    const {data,error}=await ctx.service.from("training_compensation_events").select("snapshot").eq("packet_id",packet.id).eq("version",Number(version)).maybeSingle();
    if(error || !data) throw new CompensationError("Packet version not found.",404);
    packet=data.snapshot as CompensationPacket;
  }
  if(receiptId) {
    const receipt=packet.receipts.find(r=>r.id===receiptId);
    if(!receipt) throw new CompensationError("Receipt not found.",404);
    return {bytes:await download(ctx,receipt.path,receipt.sha256),type:receipt.contentType,name:receipt.name};
  }
  if(version!==null || !["draft","returned"].includes(packet.status)) {
    if(!packet.pdf_path || !packet.pdf_sha256) throw new CompensationError("Packet PDF is not ready.");
    return {bytes:await download(ctx,packet.pdf_path,packet.pdf_sha256),type:"application/pdf",name:"training-compensation.pdf"};
  }
  return {bytes:await renderCompensationPacket({...packet,requester_signature:null,mto_signature:null,office_codes:[],office_name:null,office_completed_at:null},{},true),type:"application/pdf",name:"compensation-draft.pdf"};
}
export async function uploadCompensationReceipt(requestId:string,form:FormData) {
  const ctx=await loadCompensation(requestId);editable(ctx);
  if(!ctx.packet) throw new CompensationError("Save the packet before attaching receipts.");
  if(String(ctx.packet.version)!==form.get("version")) throw new CompensationError("This packet changed. Reload it first.",409);
  if(ctx.packet.receipts.length>=20) throw new CompensationError("Attach no more than 20 receipt files per packet.");
  const file=form.get("file");
  if(!(file instanceof File) || file.size<1 || file.size>4*1024*1024) throw new CompensationError("Choose a PDF, PNG or JPEG up to 4 MB.");
  const bytes=new Uint8Array(await file.arrayBuffer());
  const type=Buffer.from(bytes.subarray(0,5)).toString()==="%PDF-"?"application/pdf":Buffer.from(bytes.subarray(0,8)).equals(Buffer.from([137,80,78,71,13,10,26,10]))?"image/png":bytes[0]===255 && bytes[1]===216 && bytes[2]===255?"image/jpeg":null;
  if(!type || type!==file.type) throw new CompensationError("Choose a valid PDF, PNG or JPEG receipt.");
  const id=randomUUID(),extension=type==="application/pdf"?"pdf":type==="image/png"?"png":"jpg";
  const receipt:CompensationReceipt={id,path:`${ctx.packet.id}/receipts/${id}.${extension}`,name:file.name.replace(/[^a-zA-Z0-9._ ()-]/g,"_").slice(0,120)||`receipt.${extension}`,contentType:type,size:file.size,sha256:hash(bytes)};
  await upload(ctx,receipt.path,bytes,type);
  return persist(ctx,{p_action:"receipts",p_receipts:[...ctx.packet.receipts,receipt]});
}
export async function removeCompensationReceipt(requestId:string,id:string,version:number) {
  const ctx=await loadCompensation(requestId);editable(ctx);
  if(!ctx.packet || version!==ctx.packet.version) throw new CompensationError("This packet changed. Reload it first.",409);
  // Preserve storage objects referenced by earlier signed submissions.
  return persist(ctx,{p_action:"receipts",p_receipts:ctx.packet.receipts.filter(r=>r.id!==id)});
}
