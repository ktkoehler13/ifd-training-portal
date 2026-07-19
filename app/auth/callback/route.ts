import { NextResponse, type NextRequest } from "next/server";
import { markPersonnelMustChangePassword } from "@/lib/auth/admin-personnel-server";
import { getAuthenticatedPersonnel } from "@/lib/auth/personnel";
import { normalizePersonnelEmail } from "@/lib/personnel";
import { createClient } from "@/lib/supabase/server";

function redirectToSetupPasswordError(
  origin: string,
  reason: "invalid-link" | "link-used",
): NextResponse {
  const redirectUrl = new URL("/setup-password", origin);
  redirectUrl.searchParams.set("reason", reason);
  return NextResponse.redirect(redirectUrl);
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const type = requestUrl.searchParams.get("type");
  const flow = requestUrl.searchParams.get("flow");
  const origin = requestUrl.origin;
  const isPasswordSetupFlow = flow === "password-setup";

  if (!code) {
    if (isPasswordSetupFlow) {
      return redirectToSetupPasswordError(origin, "invalid-link");
    }

    return NextResponse.redirect(new URL("/?reason=access-denied", origin));
  }

  const supabase = await createClient();
  const { error: exchangeError } =
    await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    await supabase.auth.signOut();

    if (isPasswordSetupFlow) {
      return redirectToSetupPasswordError(origin, "invalid-link");
    }

    return NextResponse.redirect(new URL("/?reason=access-denied", origin));
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const personnel = await getAuthenticatedPersonnel();

  if (!personnel || !user?.email) {
    await supabase.auth.signOut();

    if (isPasswordSetupFlow) {
      return redirectToSetupPasswordError(origin, "invalid-link");
    }

    return NextResponse.redirect(new URL("/?reason=access-denied", origin));
  }

  if (
    normalizePersonnelEmail(user.email) !==
    normalizePersonnelEmail(personnel.email)
  ) {
    await supabase.auth.signOut();
    return redirectToSetupPasswordError(origin, "invalid-link");
  }

  if (isPasswordSetupFlow) {
    if (personnel.passwordSetupCompletedAt && !personnel.mustChangePassword) {
      await supabase.auth.signOut();
      return redirectToSetupPasswordError(origin, "link-used");
    }

    try {
      await markPersonnelMustChangePassword(personnel.id);
    } catch {
      await supabase.auth.signOut();
      return redirectToSetupPasswordError(origin, "invalid-link");
    }

    return NextResponse.redirect(
      new URL("/settings/password?required=1&setup=legacy", origin),
    );
  }

  if (type === "recovery") {
    return NextResponse.redirect(new URL("/settings/password", origin));
  }

  if (personnel.mustChangePassword) {
    return NextResponse.redirect(
      new URL("/settings/password?required=1", origin),
    );
  }

  return NextResponse.redirect(new URL("/dashboard", origin));
}
