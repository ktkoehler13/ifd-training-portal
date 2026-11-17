import { CompensationPacketView } from "@/components/compensation/CompensationPacketView";
export default async function Page({params}:{params:Promise<{requestId:string}>}){const {requestId}=await params;return <CompensationPacketView requestId={requestId}/>;}
