import { NextResponse } from "next/server";
import { actOnCompensation, compensationDetail, compensationFile, CompensationError, CompensationRateChangedError, removeCompensationReceipt, uploadCompensationReceipt } from "@/lib/compensation/server";
export const runtime="nodejs";
export const maxDuration=60;
type Context={params:Promise<{requestId:string}>};
function errorResponse(error:unknown) {
  return NextResponse.json({error:error instanceof Error?error.message:"Unable to complete this compensation action.",...(error instanceof CompensationRateChangedError?{currentMileageRate:error.currentMileageRate}:{})},{status:error instanceof CompensationError?error.status:400,headers:{"Cache-Control":"private, no-store"}});
}
export async function GET(request:Request,context:Context) {
  try {
    const {requestId}=await context.params,url=new URL(request.url);
    if(url.searchParams.has("pdf") || url.searchParams.has("receipt")) {
      const file=await compensationFile(requestId,url.searchParams.get("version"),url.searchParams.get("receipt"));
      return new NextResponse(Buffer.from(file.bytes),{headers:{"Content-Type":file.type,"Content-Disposition":`attachment; filename="${file.name.replace(/["\\\r\n]/g,"_")}"`,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
    }
    return NextResponse.json(await compensationDetail(requestId),{headers:{"Cache-Control":"private, no-store"}});
  } catch(error) {return errorResponse(error);}
}
export async function POST(request:Request,context:Context) {
  try {
    const {requestId}=await context.params;
    if(request.headers.get("content-type")?.startsWith("multipart/form-data")) {
      if(Number(request.headers.get("content-length"))>11*1024*1024) throw new CompensationError("Choose a receipt up to 10 MB.");
      return NextResponse.json({packet:await uploadCompensationReceipt(requestId,await request.formData())});
    }
    const raw=await request.text();
    if(raw.length>250000) throw new CompensationError("The packet is too large.");
    const body=JSON.parse(raw);
    if(body.action==="removeReceipt") return NextResponse.json({packet:await removeCompensationReceipt(requestId,body.receiptId,body.version)});
    return NextResponse.json({packet:await actOnCompensation(requestId,body)});
  } catch(error) {return errorResponse(error);}
}
