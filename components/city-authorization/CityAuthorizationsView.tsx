"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AuthGate } from "@/components/layout/AuthGate";
import { PortalHeading } from "@/components/layout/PortalBrand";
import { cityAuthorizationNeedsAction, type CityAuthorizationQueueItem } from "@/lib/city-authorization/model";
import type { PersonnelRole } from "@/types/personnel";
type Queue={items:CityAuthorizationQueueItem[];role:PersonnelRole};
export function CityAuthorizationsView(){return <AuthGate><CityAuthorizationsContent/></AuthGate>;}
export function CityAuthorizationsContent() {
  const [data,setData]=useState<Queue|null>(null),[error,setError]=useState(""),[chosen,setChosen]=useState<string|null>(null);
  useEffect(()=>{
    let active=true;
    async function load(){try{const response=await fetch("/api/city-authorizations",{cache:"no-store"}),result=await response.json();if(!response.ok)throw new Error(result.error??"Unable to load City Authorizations.");if(active){setData(result);setError("");}}catch(e){if(active)setError(e instanceof Error?e.message:"Unable to load City Authorizations.");}}
    void load();window.addEventListener("focus",load);const timer=window.setInterval(load,60000);
    return()=>{active=false;window.removeEventListener("focus",load);window.clearInterval(timer);};
  },[]);
  const tab=chosen??(data?.role==="office"?"pending":"all"),pending=data?.items.filter(i=>cityAuthorizationNeedsAction(i.status,data.role))??[];
  const items=data?.items.filter(i=>tab==="all"||i.status===(tab==="pending"?"pending":"uploaded"))??[];
  return <main className="min-h-screen bg-zinc-50"><header className="border-b bg-white"><div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 p-6"><PortalHeading><h1 className="text-2xl font-bold">City Authorizations</h1><p className="mt-1 text-sm text-zinc-600">Complete the City authorization process for DC-approved training.</p></PortalHeading><Link href="/dashboard" className="rounded-lg border px-4 py-2 text-sm font-semibold">Dashboard</Link></div></header><div className="mx-auto max-w-5xl space-y-6 p-6">
    <p className="text-sm text-zinc-600">New Deputy Chief approvals appear here. Upload the City Authorization from the request to complete the Office step.</p>
    {error&&<p role="alert" className="text-red-700">{error}</p>}{!data&&!error&&<p role="status">Loading City Authorizations…</p>}
    {data&&<><div className="flex flex-wrap gap-3" role="group" aria-label="Filter City Authorizations">{[["pending",data.role==="office"?`Requiring My Action (${pending.length})`:"Awaiting Office"],["uploaded","Authorization Uploaded"],["all","All"]].map(([key,label])=><button key={key} aria-pressed={tab===key} onClick={()=>setChosen(key)} className={`rounded-lg border px-4 py-2 text-sm font-semibold ${tab===key?"bg-zinc-900 text-white":"bg-white"}`}>{key==="pending"&&pending.length>0&&<span aria-label="Action needed" className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-red-600"/>}{label}</button>)}</div>
    <div className="space-y-3">{items.length===0&&<p className="rounded-xl border bg-white p-6 text-zinc-600">No City Authorizations in this view.</p>}{items.map(item=><Link key={item.request_id} href={`/requests/${item.request_id}/confirmation`} className="block rounded-xl border bg-white p-5 shadow-sm hover:border-red-300"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className={cityAuthorizationNeedsAction(item.status,data.role)?"font-bold":"font-medium"}>{item.request.training_title}</h2><p className="mt-1 text-sm text-zinc-600">{item.request.requester_name} · {item.request.request_number}</p></div><span className="rounded-full bg-zinc-100 px-3 py-1 text-sm">{item.status==="uploaded"?"Authorization Uploaded":"Awaiting Office"}</span></div></Link>)}</div></>}
  </div></main>;
}
