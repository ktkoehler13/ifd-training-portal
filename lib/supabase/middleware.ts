import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { reconcileForcedPasswordSetupIfPending } from "@/lib/auth/forced-password-setup-reconciliation";
import { normalizePersonnelEmail } from "@/lib/personnel";
import { getSupabaseEnv } from "@/lib/supabase/env";

const PASSWORD_SETUP_PATH = "/settings/password";

function isPasswordSetupPath(pathname: string): boolean {
  return (
    pathname === PASSWORD_SETUP_PATH ||
    pathname.startsWith(`${PASSWORD_SETUP_PATH}/`)
  );
}

async function resolveMustChangePassword(
  supabase: ReturnType<typeof createServerClient>,
  userEmail: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("personnel")
    .select("must_change_password, active")
    .eq("email", normalizePersonnelEmail(userEmail))
    .maybeSingle();

  if (error || !data?.active) {
    return false;
  }

  return data.must_change_password ?? false;
}

function redirectToPasswordSetup(request: NextRequest): NextResponse {
  const redirectUrl = request.nextUrl.clone();
  redirectUrl.pathname = PASSWORD_SETUP_PATH;
  redirectUrl.searchParams.set("required", "1");
  return NextResponse.redirect(redirectUrl);
}

export async function updateSession(request: NextRequest) {
  const { url, anonKey } = getSupabaseEnv();

  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });

        supabaseResponse = NextResponse.next({
          request,
        });

        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isProtectedRoute =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/requests") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/settings") ||
    pathname.startsWith("/approvals");

  if (user?.email) {
    await reconcileForcedPasswordSetupIfPending();
  }

  const mustChangePassword = user?.email
    ? await resolveMustChangePassword(supabase, user.email)
    : false;

  if (isProtectedRoute && !user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/";
    redirectUrl.searchParams.set("reason", "sign-in-required");
    return NextResponse.redirect(redirectUrl);
  }

  if (
    user &&
    mustChangePassword &&
    isProtectedRoute &&
    !isPasswordSetupPath(pathname)
  ) {
    return redirectToPasswordSetup(request);
  }

  if (pathname === "/" && user) {
    if (mustChangePassword) {
      return redirectToPasswordSetup(request);
    }

    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/dashboard";
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl);
  }

  return supabaseResponse;
}
