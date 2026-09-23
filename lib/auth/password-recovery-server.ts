import "server-only";

import { cookies } from "next/headers";
import { buildApplicationPathUrl } from "@/lib/auth/app-url";
import { getAuthenticatedPersonnel } from "@/lib/auth/personnel";
import {
  normalizeBadgeNumberForLookup,
  resolveActivePersonnelByBadge,
} from "@/lib/auth/personnel-lookup-server";
import {
  PASSWORD_RECOVERY_FAILED_MESSAGE,
  PASSWORD_RECOVERY_REQUEST_SUCCESS_MESSAGE,
  PASSWORD_RECOVERY_SESSION_REQUIRED_MESSAGE,
  PASSWORD_RECOVERY_SUCCESS_MESSAGE,
} from "@/lib/auth/password-recovery-messages";
import {
  isPasswordRecoveryRateLimited,
  recordPasswordRecoveryAttempt,
} from "@/lib/auth/password-recovery-rate-limit";
import {
  PASSWORD_MISMATCH_MESSAGE,
  validatePermanentPassword,
} from "@/lib/auth/password";
import { normalizePersonnelEmail } from "@/lib/personnel";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

const PASSWORD_RECOVERY_COOKIE_NAME = "ifd_password_recovery";
const PASSWORD_RECOVERY_COOKIE_MAX_AGE_SECONDS = 60 * 30;

type AuthUserLookupResult =
  | { kind: "found" }
  | { kind: "missing" }
  | { kind: "ambiguous" };

async function resolveAuthUserForPasswordRecovery(
  email: string,
  personnelId: string,
): Promise<AuthUserLookupResult> {
  const service = createServiceRoleClient();
  const normalizedEmail = normalizePersonnelEmail(email);
  const matches: string[] = [];
  let page = 1;

  while (page <= 10) {
    const { data, error } = await service.auth.admin.listUsers({
      page,
      perPage: 200,
    });

    if (error) {
      console.error("Password recovery Auth user lookup failed", {
        operation: "auth.admin.listUsers",
        personnelId,
        code: error.code,
        message: error.message,
      });
      return { kind: "missing" };
    }

    if (!data.users.length) {
      break;
    }

    for (const user of data.users) {
      if (
        user.email &&
        normalizePersonnelEmail(user.email) === normalizedEmail
      ) {
        matches.push(user.id);
      }
    }

    if (data.users.length < 200) {
      break;
    }

    page += 1;
  }

  if (matches.length === 0) {
    return { kind: "missing" };
  }

  if (matches.length > 1) {
    return { kind: "ambiguous" };
  }

  return { kind: "found" };
}

export function getPasswordRecoveryRedirectUrl(requestOrigin?: string): string {
  return buildApplicationPathUrl("/reset-password", requestOrigin);
}

function createPasswordRecoveryEmailClient() {
  const { url, anonKey } = getSupabaseEnv();

  return createSupabaseClient(url, anonKey, {
    auth: {
      flowType: "implicit",
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export async function markPasswordRecoverySession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(PASSWORD_RECOVERY_COOKIE_NAME, "1", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: PASSWORD_RECOVERY_COOKIE_MAX_AGE_SECONDS,
    path: "/",
  });
}

async function hasPasswordRecoveryCookie(): Promise<boolean> {
  const cookieStore = await cookies();
  return cookieStore.get(PASSWORD_RECOVERY_COOKIE_NAME)?.value === "1";
}

export async function clearPasswordRecoverySession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(PASSWORD_RECOVERY_COOKIE_NAME);
  const supabase = await createClient();
  await supabase.auth.signOut();
}

export async function requestPasswordRecovery(input: {
  badgeNumber: string;
  ipAddress: string;
  requestOrigin: string;
}): Promise<{ ok: true; message: string }> {
  const normalizedBadge = normalizeBadgeNumberForLookup(input.badgeNumber);
  const rateLimitBadge = normalizedBadge || input.badgeNumber.trim();
  const genericResponse = {
    ok: true as const,
    message: PASSWORD_RECOVERY_REQUEST_SUCCESS_MESSAGE,
  };

  if (
    isPasswordRecoveryRateLimited(input.ipAddress, rateLimitBadge) ||
    !rateLimitBadge
  ) {
    return genericResponse;
  }

  recordPasswordRecoveryAttempt(input.ipAddress, rateLimitBadge);

  if (!normalizedBadge) {
    return genericResponse;
  }

  const personnel = await resolveActivePersonnelByBadge(normalizedBadge);

  if (!personnel) {
    return genericResponse;
  }

  const authLookup = await resolveAuthUserForPasswordRecovery(
    personnel.email,
    personnel.id,
  );

  if (authLookup.kind !== "found") {
    return genericResponse;
  }

  const redirectTo = getPasswordRecoveryRedirectUrl(input.requestOrigin);
  console.log("Password recovery redirect URL:", redirectTo);
  const supabase = createPasswordRecoveryEmailClient();
  const { error: emailError } = await supabase.auth.resetPasswordForEmail(
    normalizePersonnelEmail(personnel.email),
    { redirectTo },
  );

  if (emailError) {
    console.error("Password recovery email request failed", {
      operation: "auth.resetPasswordForEmail",
      personnelId: personnel.id,
      code: emailError.code,
      message: emailError.message,
    });
  }

  return genericResponse;
}

async function verifyRecoverySession(): Promise<boolean> {
  if (!(await hasPasswordRecoveryCookie())) {
    return false;
  }

  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user?.email) {
    return false;
  }

  const personnel = await getAuthenticatedPersonnel();

  if (!personnel) {
    await clearPasswordRecoverySession();
    return false;
  }

  if (
    normalizePersonnelEmail(user.email) !==
    normalizePersonnelEmail(personnel.email)
  ) {
    await clearPasswordRecoverySession();
    return false;
  }

  return true;
}

export async function exchangePasswordRecoveryCode(
  code: string,
): Promise<{ ok: boolean }> {
  const trimmedCode = code.trim();
  if (!trimmedCode) {
    return { ok: false };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(trimmedCode);

  if (error) {
    console.error("Password recovery code exchange failed", {
      operation: "auth.exchangeCodeForSession",
      code: error.code,
      message: error.message,
    });
    await clearPasswordRecoverySession();
    return { ok: false };
  }

  await markPasswordRecoverySession();

  const valid = await verifyRecoverySession();
  if (!valid) {
    await clearPasswordRecoverySession();
    return { ok: false };
  }

  return { ok: true };
}

export async function hasPasswordRecoverySession(): Promise<boolean> {
  return verifyRecoverySession();
}

export async function establishPasswordRecoverySessionFromAuthUser(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user?.email || !user.recovery_sent_at) {
    return false;
  }

  const personnel = await getAuthenticatedPersonnel();

  if (!personnel) {
    return false;
  }

  if (
    normalizePersonnelEmail(user.email) !==
    normalizePersonnelEmail(personnel.email)
  ) {
    return false;
  }

  await markPasswordRecoverySession();
  return true;
}

export async function completePasswordRecovery(input: {
  newPassword: string;
  confirmPassword: string;
}): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  if (input.newPassword !== input.confirmPassword) {
    return { ok: false, error: PASSWORD_MISMATCH_MESSAGE };
  }

  const passwordError = validatePermanentPassword(input.newPassword);
  if (passwordError) {
    return { ok: false, error: passwordError };
  }

  const hasSession = await verifyRecoverySession();
  if (!hasSession) {
    return { ok: false, error: PASSWORD_RECOVERY_SESSION_REQUIRED_MESSAGE };
  }

  const supabase = await createClient();
  const { error: updateError } = await supabase.auth.updateUser({
    password: input.newPassword,
  });

  if (updateError) {
    console.error("Password recovery update failed", {
      operation: "auth.updateUser",
      code: updateError.code,
      message: updateError.message,
    });
    return { ok: false, error: PASSWORD_RECOVERY_FAILED_MESSAGE };
  }

  await clearPasswordRecoverySession();

  return { ok: true, message: PASSWORD_RECOVERY_SUCCESS_MESSAGE };
}
