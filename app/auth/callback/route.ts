import { NextResponse, type NextRequest } from "next/server";
import { getAuthenticatedPersonnel } from "@/lib/auth/personnel";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const type = requestUrl.searchParams.get("type");
  const origin = requestUrl.origin;

  if (!code) {
    const response = NextResponse.redirect(
      new URL("/?reason=access-denied", origin),
    );
    return response;
  }

  const supabase = await createClient();
  const { error: exchangeError } =
    await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/?reason=access-denied", origin));
  }

  if (type === "recovery") {
    return NextResponse.redirect(new URL("/settings/password", origin));
  }

  const personnel = await getAuthenticatedPersonnel();

  if (!personnel) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/?reason=access-denied", origin));
  }

  return NextResponse.redirect(new URL("/dashboard", origin));
}
