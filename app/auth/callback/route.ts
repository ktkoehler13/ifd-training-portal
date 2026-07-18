import { NextResponse, type NextRequest } from "next/server";
import { getAuthenticatedPersonnelForLogin } from "@/lib/auth/personnel";
import {
  getPendingLoginCookieOptions,
  PENDING_LOGIN_COOKIE,
} from "@/lib/auth/pending-login";
import { normalizePersonnelEmail } from "@/lib/personnel";
import { createClient } from "@/lib/supabase/server";

function clearPendingLoginCookie(response: NextResponse) {
  response.cookies.set(PENDING_LOGIN_COOKIE, "", {
    ...getPendingLoginCookieOptions(),
    maxAge: 0,
  });
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const origin = requestUrl.origin;

  if (!code) {
    const response = NextResponse.redirect(
      new URL("/?reason=access-denied", origin),
    );
    clearPendingLoginCookie(response);
    return response;
  }

  const pendingBadge = request.cookies.get(PENDING_LOGIN_COOKIE)?.value?.trim();

  if (!pendingBadge) {
    const response = NextResponse.redirect(
      new URL("/?reason=access-denied", origin),
    );
    clearPendingLoginCookie(response);
    return response;
  }

  const supabase = await createClient();
  const { error: exchangeError } =
    await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    await supabase.auth.signOut();
    const response = NextResponse.redirect(
      new URL("/?reason=access-denied", origin),
    );
    clearPendingLoginCookie(response);
    return response;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    await supabase.auth.signOut();
    const response = NextResponse.redirect(
      new URL("/?reason=access-denied", origin),
    );
    clearPendingLoginCookie(response);
    return response;
  }

  const personnel = await getAuthenticatedPersonnelForLogin({
    badgeNumber: pendingBadge,
    email: normalizePersonnelEmail(user.email),
  });

  if (!personnel) {
    await supabase.auth.signOut();
    const response = NextResponse.redirect(
      new URL("/?reason=access-denied", origin),
    );
    clearPendingLoginCookie(response);
    return response;
  }

  const response = NextResponse.redirect(new URL("/dashboard", origin));
  clearPendingLoginCookie(response);
  return response;
}
