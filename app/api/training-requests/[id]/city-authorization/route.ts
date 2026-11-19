import { NextResponse } from "next/server";
import { cityAuthorizationDetail, uploadCityAuthorization, downloadCityAuthorization, CityAuthorizationError } from "@/lib/city-authorization/server";
export const runtime="nodejs";
export const maxDuration=60;
type Context={params:Promise<{id:string}>};
function failure(error:unknown) {
  return NextResponse.json({error:error instanceof Error?error.message:"Unable to complete the City Authorization action."},{status:error instanceof CityAuthorizationError?error.status:500,headers:{"Cache-Control":"private, no-store"}});
}
export async function GET(request:Request,context:Context) {
  try {
    const {id}=await context.params,fileId=new URL(request.url).searchParams.get("file");
    if(fileId) {
      const file=await downloadCityAuthorization(id,fileId);
      return new NextResponse(Buffer.from(file.bytes),{headers:{"Content-Type":file.type,"Content-Disposition":`attachment; filename="${file.name.replace(/[^a-zA-Z0-9._ ()-]/g,"_")}"`,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
    }
    return NextResponse.json(await cityAuthorizationDetail(id),{headers:{"Cache-Control":"private, no-store"}});
  }catch(error){return failure(error);}
}
export async function POST(request:Request,context:Context) {
  try {const {id}=await context.params;return NextResponse.json({authorization:await uploadCityAuthorization(id,await request.formData())},{headers:{"Cache-Control":"private, no-store"}});}
  catch(error){return failure(error);}
}
