"use client";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { CITY_AUTHORIZATION_MAX_BYTES, type CityAuthorization, type CityAuthorizationFile } from "@/lib/city-authorization/model";
type Detail={authorization:CityAuthorization|null;files:Array<Omit<CityAuthorizationFile,"storage_path"|"sha256">>;canUpload:boolean};
export function CityAuthorizationPanel({requestId}:{requestId:string}) {
  const [detail,setDetail]=useState<Detail|null>(null),[file,setFile]=useState<File|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState("");
  const endpoint=`/api/training-requests/${requestId}/city-authorization`;
  const load=useCallback(async()=>{
    const response=await fetch(endpoint,{cache:"no-store"}),data=await response.json();
    if(!response.ok)throw new Error(data.error??"Unable to load City Authorization.");
    setDetail(data);
  },[endpoint]);
  useEffect(()=>{let active=true;void (async()=>{const response=await fetch(endpoint,{cache:"no-store"}),data=await response.json();if(!response.ok)throw new Error(data.error??"Unable to load City Authorization.");if(active)setDetail(data);})().catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[endpoint]);
  async function upload() {
    if(!file||!detail)return;
    setBusy(true);setError("");setMessage("");
    try {
      if(file.size<1||file.size>CITY_AUTHORIZATION_MAX_BYTES)throw new Error("Choose a PDF, PNG or JPEG up to 4 MB.");
      const form=new FormData();form.set("file",file);form.set("version",String(detail.authorization?.version??0));
      const response=await fetch(endpoint,{method:"POST",body:form}),data=await response.json();
      if(!response.ok)throw new Error(data.error??"Unable to upload the authorization.");
      await load();setFile(null);setMessage("City Authorization saved with the request. The Office action alert has been cleared.");
    }catch(e){setError(e instanceof Error?e.message:"Unable to upload the authorization.");}finally{setBusy(false);}
  }
  return <section className="mt-6 space-y-4 rounded-xl border border-zinc-200 bg-white p-5" aria-labelledby="city-authorization-heading">
    <div className="flex flex-wrap items-start justify-between gap-3"><h2 id="city-authorization-heading" className="text-lg font-semibold">City Authorization</h2>{detail&&<span className={`rounded-full px-3 py-1 text-sm ${detail.authorization?.status==="uploaded"?"bg-green-50 text-green-800":"bg-amber-50 text-amber-900"}`}>{detail.authorization?.status==="uploaded"?"Authorization Uploaded":detail.authorization?"Awaiting Office":"No Authorization Uploaded"}</span>}</div>
    <p className="text-sm text-zinc-600">Office completes the City authorization process after Deputy Chief approval. The authorization is stored here with the training request.</p>
    {!detail&&!error&&<p role="status" className="text-sm text-zinc-500">Loading City Authorization…</p>}
    {error&&<div role="alert" className="space-y-2 text-sm text-red-700"><p>{error}</p><button disabled={busy} className="font-semibold underline" onClick={()=>void load().then(()=>setError("")).catch(e=>setError(e.message))}>Reload City Authorization</button></div>}
    {message&&<p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-900">{message}</p>}
    {detail?.canUpload&&<div className="space-y-3 rounded-lg border bg-zinc-50 p-4"><label className="block space-y-2 text-sm font-medium"><span>City Authorization File</span><input type="file" accept="application/pdf,image/png,image/jpeg" disabled={busy} onChange={e=>{setFile(e.target.files?.[0]??null);setError("");setMessage("");e.target.value="";}} className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-white file:px-3 file:py-2"/></label>{file&&<p className="break-all text-sm">Selected: {file.name}</p>}<p className="text-xs leading-5 text-zinc-600">PDF, PNG or JPEG, up to 4 MB. A successful upload completes this Office step. Uploading a revised authorization preserves earlier copies.</p><Button disabled={busy||!file} onClick={()=>void upload()}>{busy?"Uploading…":"Upload City Authorization"}</Button></div>}
    {detail?.files.length? <ul className="space-y-3">{detail.files.map((item,i)=><li key={item.id} className="rounded-lg border p-3"><a href={`${endpoint}?file=${item.id}`} className="break-all text-sm font-semibold text-red-700 underline">{i===0?"Download City Authorization":"Download Earlier Authorization"} — {item.file_name}</a><p className="mt-1 text-xs text-zinc-500">Uploaded by {item.uploaded_by_name} · {new Date(item.uploaded_at).toLocaleString()}</p></li>)}</ul>:detail&&<p className="text-sm text-zinc-500">No City Authorization file has been uploaded.</p>}
  </section>;
}
