"use client";
import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { AuthGate } from "@/components/layout/AuthGate";
import { PortalHeading } from "@/components/layout/PortalBrand";
import { Button } from "@/components/ui/Button";
import { WorkflowSignatureSetup } from "@/components/signature/WorkflowSignatureSetup";
import { blankMileage, blankTime, blankVoucher, COMPENSATION_STATUS, compensationTotals, formatCompensationRate, OFFICE_CODES, timeMinutes, type CompensationEvent, type CompensationInput, type CompensationPacket, type OfficeCode } from "@/lib/compensation/model";
import { validateCompensationSubmission } from "@/lib/compensation/validation";
import { localToday } from "@/lib/compensation/model";
import { canCompleteCompensation } from "@/lib/compensation/access";
import type { PersonnelRole } from "@/types/personnel";

type Detail={packet:CompensationPacket|null;events:CompensationEvent[];initial:CompensationInput;eligible:boolean;request:{id:string;course:string;name:string;badge:string;requestNumber:string;endDate:string;requesterId:string;mileageRate:number};actor:{id:string;role:PersonnelRole;name:string}};
const inputClass="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base disabled:bg-zinc-50 disabled:text-zinc-800";
function Field({label,children}:{label:string;children:ReactNode}) {return <label className="block min-w-0 space-y-1.5 text-sm font-medium text-zinc-700"><span>{label}</span>{children}</label>;}
function Section({title,children,description}:{title:string;children:ReactNode;description?:string}) {return <section className="space-y-5 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6"><div><h2 className="text-lg font-semibold">{title}</h2>{description&&<p className="mt-1 text-sm leading-6 text-zinc-600">{description}</p>}</div>{children}</section>;}
export function CompensationPacketView({requestId}:{requestId:string}) {return <AuthGate>{()=> <PacketContent requestId={requestId}/>}</AuthGate>;}
export function PacketContent({requestId}:{requestId:string}) {
  const [detail,setDetail]=useState<Detail|null>(null),[form,setForm]=useState<CompensationInput|null>(null),[busy,setBusy]=useState(false),[dirty,setDirty]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState("");
  const [ready,setReady]=useState(false),[confirmed,setConfirmed]=useState(false),[note,setNote]=useState(""),[codes,setCodes]=useState<OfficeCode[]>([]);
  const endpoint=`/api/compensation/${requestId}`;
  const load=useCallback(async()=>{
    const response=await fetch(endpoint,{cache:"no-store"}),data=await response.json();
    if(!response.ok) throw new Error(data.error??"Unable to load compensation packet.");
    setDetail(data);setForm(data.packet?.data??data.initial);setCodes(data.packet?.office_codes??[]);setDirty(false);setConfirmed(false);
  },[endpoint]);
  useEffect(()=>{
    let active=true;
    async function initialLoad(){
      const response=await fetch(endpoint,{cache:"no-store"}),data=await response.json();
      if(!response.ok)throw new Error(data.error??"Unable to load compensation packet.");
      if(active){setDetail(data);setForm(data.packet?.data??data.initial);setCodes(data.packet?.office_codes??[]);}
    }
    void initialLoad().catch(e=>{if(active)setError(e.message);});
    return()=>{active=false;};
  },[endpoint]);
  useEffect(()=>{if(!dirty)return;const prevent=(e:BeforeUnloadEvent)=>e.preventDefault();window.addEventListener("beforeunload",prevent);return()=>window.removeEventListener("beforeunload",prevent);},[dirty]);
  function change(next:CompensationInput){setForm(next);setDirty(true);setConfirmed(false);setMessage("");}
  async function post(body:object|FormData) {
    const response=await fetch(endpoint,{method:"POST",...(body instanceof FormData?{body}:{headers:{"Content-Type":"application/json"},body:JSON.stringify(body)})}),result=await response.json();
    if(!response.ok) {
      if(typeof result.currentMileageRate==="number") {
        setDetail(current=>current?{...current,request:{...current.request,mileageRate:result.currentMileageRate},packet:current.packet?{...current.packet,identity:{...current.packet.identity,mileageRate:result.currentMileageRate}}:null}:current);
        setConfirmed(false);
      }
      throw new Error(result.error??"Unable to save the packet.");
    }
    return result.packet as CompensationPacket;
  }
  async function act(action:string) {
    if(!detail||!form)return;
    setBusy(true);setError("");setMessage("");
    try {
      if(action==="submit") {const errors=validateCompensationSubmission(form,localToday());if(errors.length)throw new Error(errors.join("\n"));}
      let version=detail.packet?.version??0;
      if(action==="submit" && !detail.packet) {
        const saved=await post({action:"save",version,data:form});version=saved.version;setDetail({...detail,packet:saved});
      }
      await post({action,version,data:form,confirmed,note,officeCodes:codes,expectedMileageRate:detail.packet?.identity.mileageRate??detail.request.mileageRate});
      await load();setNote("");setMessage(action==="save"?"Draft saved.":action==="submit"?"Packet signed and submitted to the MTO.":action==="approve"?"Packet signed by the MTO and sent to the office for compensation coding.":action==="return"?"Packet returned to the requester for corrections.":"Compensation packet marked as submitted. The Office action alert has been cleared.");
    }catch(e){setError(e instanceof Error?e.message:"Unable to save.");}finally{setBusy(false);}
  }
  async function receipt(file:File|undefined) {
    if(!file||!detail||!form)return;
    setBusy(true);setError("");
    try {
      if(file.size>4*1024*1024)throw new Error("Choose a receipt file up to 4 MB.");
      let packet=detail.packet;
      if(dirty||!packet)packet=await post({action:"save",version:packet?.version??0,data:form});
      const body=new FormData();body.set("version",String(packet.version));body.set("file",file);
      await post(body);await load();setMessage("Receipt attached. Your draft is saved.");
    }catch(e){setError(e instanceof Error?e.message:"Unable to attach receipt.");}finally{setBusy(false);}
  }
  async function removeReceipt(id:string) {
    if(!detail?.packet||!form)return;
    setBusy(true);setError("");
    try {let packet=detail.packet;if(dirty)packet=await post({action:"save",version:packet.version,data:form});await post({action:"removeReceipt",version:packet.version,receiptId:id});await load();setMessage("Receipt removed from this draft.");}
    catch(e){setError(e instanceof Error?e.message:"Unable to remove receipt.");}finally{setBusy(false);}
  }
  if(!detail||!form)return <main className="mx-auto max-w-4xl p-6"><p role={error?"alert":"status"}>{error||"Loading compensation packet…"}</p>{error&&<Button onClick={()=>void load().catch(e=>setError(e.message))}>Try Again</Button>}</main>;
  const packet=detail.packet,owner=detail.actor.id===detail.request.requesterId;
  const canEdit=owner&&detail.eligible&&(!packet||["draft","returned"].includes(packet.status));
  const mtoReview=detail.actor.role==="mto"&&packet?.status==="pending_mto";
  const officeReview=canCompleteCompensation(detail.actor.role)&&packet?.status==="pending_office";
  const totals=compensationTotals(form,packet?.identity.mileageRate??detail.request.mileageRate);
  const rowInput=(label:string,value:string,onChange:(value:string)=>void,type="text",props:Record<string,string|number>={})=><Field label={label}><input className={inputClass} type={type} value={value} onChange={e=>onChange(e.target.value)} {...props}/></Field>;
  return <main className="min-h-screen bg-zinc-50 pb-12 text-zinc-900">
    <header className="border-b border-zinc-200 bg-white"><div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-4 py-5 sm:px-6"><PortalHeading><h1 className="text-2xl font-bold">Compensation Packet</h1><p className="mt-1 text-sm text-zinc-600">Record actual training time and reimbursement details.</p></PortalHeading><Link className="text-sm font-semibold text-red-700 underline" href="/compensation">All Compensation Packets</Link></div></header>
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6">
      <section className="rounded-xl border border-zinc-200 bg-white p-5"><div className="flex flex-wrap justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{detail.request.requestNumber}</p><h2 className="mt-1 text-xl font-semibold">{detail.request.course}</h2><p className="mt-2 text-sm text-zinc-600">{detail.request.name} · Badge {detail.request.badge}</p></div><span className="h-fit rounded-full bg-amber-50 px-3 py-1.5 text-sm font-semibold text-amber-900">{packet?COMPENSATION_STATUS[packet.status]:"New Packet"}</span></div>{(owner||detail.actor.role!=="office")&&<Link className="mt-3 inline-block text-sm font-medium text-red-700 underline" href={`/requests/${requestId}/confirmation`}>View Training Request</Link>}<p className="mt-4 text-sm text-zinc-600">Submit within one month of completing your training assignment. The MTO reviews and signs before the office assigns compensation codes.</p></section>
      {!detail.eligible&&<p className="rounded-lg border border-amber-200 bg-amber-50 p-4">This packet can be completed after the approved training has ended.</p>}
      {packet?.review_note&&<div className="rounded-lg border border-amber-300 bg-amber-50 p-4"><h2 className="font-semibold">Corrections requested by MTO</h2><p className="mt-1 whitespace-pre-wrap">{packet.review_note}</p></div>}
      {error&&<div role="alert" className="whitespace-pre-line rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">{error}<button type="button" disabled={busy} onClick={()=>void load().catch(e=>setError(e.message))} className="mt-3 block text-sm font-semibold underline">Reload Saved Packet (discards unsaved edits)</button></div>}
      {message&&<p role="status" className="rounded-lg border border-green-200 bg-green-50 p-4 text-green-900">{message}</p>}
      <fieldset disabled={!canEdit||busy} className="space-y-6 disabled:opacity-100">
        <Section title="Training Compensation" description="Choose one answer in each group. Enter actual class times below; the gap between sessions is excluded from the total.">
          <div className="grid gap-6 sm:grid-cols-2"><fieldset><legend className="mb-3 text-sm font-semibold">EMT Travel Time?</legend><div className="flex gap-6">{(["yes","no"] as const).map(value=><label key={value} className="flex items-center gap-2"><input className="h-5 w-5 accent-red-700" type="checkbox" checked={form.emtTravel===value} onChange={()=>change({...form,emtTravel:value})}/>{value==="yes"?"Yes":"No"}</label>)}</div></fieldset><fieldset><legend className="mb-3 text-sm font-semibold">Compensation Type</legend><div className="flex gap-6">{(["time","pay"] as const).map(value=><label key={value} className="flex items-center gap-2"><input className="h-5 w-5 accent-red-700" type="checkbox" checked={form.compensationType===value} onChange={()=>change({...form,compensationType:value})}/>{value==="time"?"Time":"Pay"}</label>)}</div></fieldset></div>
          {rowInput("Instructor / Facilitator — Name and Title",form.instructor,value=>change({...form,instructor:value}),"text",{maxLength:200})}
          <div className="space-y-4">{form.time.map((row,i)=><div key={i} className="rounded-lg border border-zinc-200 bg-zinc-50 p-4"><div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold">Day {i+1}</h3>{canEdit&&<button type="button" className="text-sm text-red-700 underline" onClick={()=>change({...form,time:form.time.filter((_,n)=>n!==i)})}>Remove Day {i+1}</button>}</div><div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{rowInput("Date",row.date,value=>change({...form,time:form.time.map((r,n)=>n===i?{...r,date:value}:r)}),"date")}{([['start','Start Time'],['end','End Time'],['secondStart','After Lunch — Start'],['secondEnd','After Lunch — End']] as const).map(([key,label])=><div key={key}>{rowInput(label,row[key],value=>change({...form,time:form.time.map((r,n)=>n===i?{...r,[key]:value}:r)}),"time")}</div>)}</div><p className="mt-3 text-right text-sm font-semibold">{(timeMinutes(row)/60).toFixed(2)} hours</p></div>)}</div>
          <div className="flex flex-wrap items-center justify-between gap-3">{canEdit&&<Button variant="secondary" disabled={form.time.length>=100} onClick={()=>change({...form,time:[...form.time,blankTime()]})}>Add a Row — Training Day</Button>}<p className="text-lg font-bold">Total Hours: {totals.hours.toFixed(2)}</p></div><p className="text-xs text-zinc-500">Leave the second session blank when there is no lunch break. Use a separate dated row for work after midnight.</p>
        </Section>
        <Section title="Mileage" description={`Enter actual reimbursable mileage. ${!packet||["draft","returned"].includes(packet.status)?"The current rate in System Settings is":"The rate recorded when this packet was submitted is"} $${formatCompensationRate(packet?.identity.mileageRate??detail.request.mileageRate)} per mile. Mileage is added to the city voucher automatically. The rate is preserved in each signed submission.`}>
          {form.mileage.length===0&&<p className="text-sm text-zinc-500">No mileage claimed.</p>}
          {form.mileage.map((row,i)=><div key={i} className="rounded-lg border border-zinc-200 p-4"><div className="grid gap-3 sm:grid-cols-[1fr_2fr_1fr]">{rowInput("Date",row.date,value=>change({...form,mileage:form.mileage.map((r,n)=>n===i?{...r,date:value}:r)}),"date")}{rowInput("Destination",row.destination,value=>change({...form,mileage:form.mileage.map((r,n)=>n===i?{...r,destination:value}:r)}),"text",{maxLength:300})}{rowInput("Total Miles",row.miles,value=>change({...form,mileage:form.mileage.map((r,n)=>n===i?{...r,miles:value}:r)}),"number",{min:0,step:0.01})}</div>{canEdit&&<button type="button" className="mt-3 text-sm text-red-700 underline" onClick={()=>change({...form,mileage:form.mileage.filter((_,n)=>n!==i)})}>Remove Mileage Row {i+1}</button>}</div>)}
          <div className="flex flex-wrap items-center justify-between gap-3">{canEdit&&<Button variant="secondary" disabled={form.mileage.length>=100} onClick={()=>change({...form,mileage:[...form.mileage,blankMileage()]})}>Add a Row — Mileage</Button>}<p className="font-bold">{totals.miles.toFixed(2)} miles · ${totals.mileageAmount.toFixed(2)}</p></div>
        </Section>
        <Section title="City Voucher" description="Mileage is included automatically. Add other approved reimbursements below. For meal reimbursement, save itemized receipts; the City reimburses tips up to 18%.">
          <div className="grid gap-4 sm:grid-cols-2">{rowInput("Claimant Street Address",form.street,value=>change({...form,street:value}),"text",{maxLength:160})}{rowInput("City, State and ZIP",form.cityStateZip,value=>change({...form,cityStateZip:value}),"text",{maxLength:160})}{rowInput("Claimant Title",form.title,value=>change({...form,title:value}),"text",{maxLength:80})}</div>
          {form.mileage.length>0&&<p className="rounded-lg bg-zinc-50 p-3 text-sm">Mileage reimbursement: {totals.miles.toFixed(2)} miles × ${formatCompensationRate(packet?.identity.mileageRate??detail.request.mileageRate)} = <strong>${totals.mileageAmount.toFixed(2)}</strong></p>}
          {form.voucher.map((row,i)=><div key={i} className="space-y-3 rounded-lg border border-zinc-200 p-4"><div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{rowInput("Date",row.date,value=>change({...form,voucher:form.voucher.map((r,n)=>n===i?{...r,date:value}:r)}),"date")}{rowInput("Quantity",row.quantity,value=>change({...form,voucher:form.voucher.map((r,n)=>n===i?{...r,quantity:value}:r)}),"number",{min:0,step:0.01})}{rowInput("Unit Price ($)",row.unitPrice,value=>change({...form,voucher:form.voucher.map((r,n)=>n===i?{...r,unitPrice:value}:r)}),"number",{min:0,step:0.01})}</div>{rowInput("Description of Materials or Services",row.description,value=>change({...form,voucher:form.voucher.map((r,n)=>n===i?{...r,description:value}:r)}),"text",{maxLength:1000})}<div className="flex justify-between">{canEdit&&<button type="button" className="text-sm text-red-700 underline" onClick={()=>change({...form,voucher:form.voucher.filter((_,n)=>n!==i)})}>Remove Voucher Row {i+1}</button>}<span className="font-semibold">${((Number(row.quantity)||0)*(Number(row.unitPrice)||0)).toFixed(2)}</span></div></div>)}
          <div className="flex flex-wrap items-center justify-between gap-3">{canEdit&&<Button variant="secondary" disabled={form.voucher.length>=100} onClick={()=>change({...form,voucher:[...form.voucher,blankVoucher()]})}>Add a Row — Voucher</Button>}<p className="text-lg font-bold">Voucher Total: ${totals.voucherAmount.toFixed(2)}</p></div>
        </Section>
      </fieldset>
      <Section title="Receipts & Supporting Documents" description="Attach itemized meal receipts and supporting documents. PDF, PNG or JPEG; up to 4 MB each, 20 files per packet.">
        {!packet?.receipts.length&&<p className="text-sm text-zinc-500">No documents attached.</p>}
        <ul className="space-y-3">{packet?.receipts.map(r=><li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"><a className="break-all text-sm font-medium text-red-700 underline" href={`${endpoint}?receipt=${r.id}`}>{r.name}</a>{canEdit&&<button disabled={busy} className="text-sm text-zinc-600 underline" onClick={()=>void removeReceipt(r.id)}>Remove</button>}</li>)}</ul>
        {canEdit&&<Field label="Attach Receipt"><input type="file" accept="application/pdf,image/png,image/jpeg" disabled={busy} className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-100 file:px-4 file:py-2 file:font-semibold" onChange={e=>{void receipt(e.target.files?.[0]);e.target.value="";}}/></Field>}
      </Section>
      {(canEdit||mtoReview)&&<Section title={canEdit?"Sign & Submit to MTO":"MTO Review & Signature"} description={canEdit?"Confirm that training is complete and your recorded time and reimbursement claim are accurate. Submitting adds your signature to the mileage form and city voucher, and dates the voucher with today’s date.":"Review the time, mileage, voucher and receipts. Your signature is required before this packet advances to the office."}>
        <WorkflowSignatureSetup onReady={setReady} onChange={()=>setConfirmed(false)} defaultName={detail.actor.name} disabled={busy}/>
        <label className="flex items-start gap-3 rounded-lg border border-zinc-200 p-4 text-sm leading-6"><input type="checkbox" checked={confirmed} disabled={busy||!ready} onChange={e=>setConfirmed(e.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-red-700"/>{canEdit?"I confirm this training is complete, the time and mileage are accurate, the voucher charges are due and have not been paid, and I authorize use of my saved signature on this compensation packet.":"I have reviewed this compensation packet and authorize use of my saved MTO signature to approve it and advance it to the office."}</label>
        <div className="flex flex-wrap gap-3">{canEdit&&<Button variant="secondary" disabled={busy} onClick={()=>void act("save")}>Save Draft</Button>}<Button disabled={busy||!ready||!confirmed} onClick={()=>void act(canEdit?"submit":"approve")}>{busy?"Saving…":canEdit?"Submit to MTO":"Sign & Send to Office"}</Button></div>
        {mtoReview&&<div className="space-y-3 border-t pt-5"><Field label="Corrections Needed"><textarea className={inputClass} rows={3} maxLength={2000} value={note} onChange={e=>setNote(e.target.value)} disabled={busy}/></Field><Button variant="secondary" disabled={busy||note.trim().length<3} onClick={()=>void act("return")}>Return for Corrections</Button></div>}
      </Section>}
      {officeReview&&<Section title="Office Compensation Codes" description="The MTO has signed this packet. Select the applicable time or pay codes, then mark the packet as submitted when office processing is done. This clears the Office action alert."><div className="grid gap-3 sm:grid-cols-2">{Object.entries(OFFICE_CODES).map(([code,label])=><label key={code} className="flex items-start gap-3 rounded-lg border p-3 text-sm"><input type="checkbox" className="mt-0.5 h-5 w-5 accent-red-700" checked={codes.includes(code as OfficeCode)} disabled={busy} onChange={e=>setCodes(e.target.checked?[...codes,code as OfficeCode]:codes.filter(c=>c!==code))}/><span><strong>{code}</strong> — {label}</span></label>)}</div><Button disabled={busy||codes.length===0} onClick={()=>void act("complete")}>{busy?"Saving…":"Mark as Submitted"}</Button></Section>}
      {packet&&<Section title="Packet Files & History"><a className="inline-block rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold hover:bg-zinc-50" href={`${endpoint}?pdf=1`}>{canEdit?"Download Saved Draft Preview":"Download Compensation Packet"}</a>{dirty&&<p className="text-sm text-amber-800">You have unsaved changes. Save your draft before downloading the latest preview.</p>}{packet.status==="completed"&&<p className="text-sm">Office codes: {packet.office_codes.join(", ")} · Submitted by {packet.office_name}</p>}<ol className="space-y-4">{detail.events.map(event=><li key={event.id} className="border-t pt-3 text-sm"><p className="font-semibold">{{submitted:"Submitted to MTO",returned:"Returned for Corrections",mto_approved:"Signed by MTO — Sent to Office",office_completed:"Marked as Submitted"}[event.action]} · {event.actor_name}</p><p className="mt-1 text-zinc-500">{new Date(event.created_at).toLocaleString()}</p>{event.note&&<p className="mt-2 whitespace-pre-wrap">{event.note}</p>}{event.pdf_path&&<a className="mt-2 inline-block text-red-700 underline" href={`${endpoint}?pdf=1&version=${event.version}`}>Download Signed Copy</a>}{event.receipts?.length ? <ul className="mt-2 space-y-1">{event.receipts.map(receipt=><li key={receipt.id}><a className="text-red-700 underline" href={`${endpoint}?receipt=${receipt.id}&version=${event.version}`}>{receipt.name}</a></li>)}</ul> : null}</li>)}</ol></Section>}
      {canEdit&&dirty&&<p className="text-center text-sm text-amber-800">Unsaved changes</p>}
    </div>
  </main>;
}
