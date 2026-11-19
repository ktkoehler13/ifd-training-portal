import { NextResponse } from "next/server";
import { listCityAuthorizations, CityAuthorizationError } from "@/lib/city-authorization/server";
export async function GET() {
  try {return NextResponse.json(await listCityAuthorizations(),{headers:{"Cache-Control":"private, no-store"}});}
  catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Unable to load City Authorizations."},{status:error instanceof CityAuthorizationError?error.status:500,headers:{"Cache-Control":"private, no-store"}});}
}
