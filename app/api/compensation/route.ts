import { NextResponse } from "next/server";
import { compensationActor, CompensationError } from "@/lib/compensation/server";
import { createClient } from "@/lib/supabase/server";
import { localToday } from "@/lib/compensation/model";
export async function GET() {
  try {
    const actor=await compensationActor(),db=await createClient();
    const [packets,eligible,officeSetting]=await Promise.all([
      db.from("training_compensation_packets").select("id,request_id,requester_id,status,version,identity,updated_at").order("updated_at",{ascending:false}),
      db.from("training_requests").select("id,request_number,training_title,end_date").eq("requester_personnel_id",actor.id).eq("status","approved").is("deleted_at",null).lte("end_date",localToday()).order("end_date",{ascending:false}),
      db.from("system_settings").select("value").eq("key","primary_office").maybeSingle(),
    ]);
    if(packets.error || eligible.error) throw new CompensationError("Unable to load compensation packets.",503);
    return NextResponse.json({packets:packets.data,eligible:eligible.data,actor:{id:actor.id,role:actor.role},primaryOfficeId:(officeSetting.data?.value as string|undefined)||null},{headers:{"Cache-Control":"private, no-store"}});
  } catch(error) {return NextResponse.json({error:error instanceof Error?error.message:"Unable to load compensation packets."},{status:error instanceof CompensationError?error.status:500});}
}
