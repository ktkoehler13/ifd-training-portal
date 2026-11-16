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
import { sendGoTruePasswordRecoveryEmail } from "@/lib/auth/gotrue-recover";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { hasRecentRecoveryAuthentication } from "@/lib/auth/password-recovery-session";
import { createPasswordRecoveryProof, verifyPasswordRecoveryProof, type RecoveryIdentity } from "@/lib/auth/password-recovery-proof";
import { getSupabaseServiceRoleKey } from "@/lib/supabase/service-env";

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

async function savePasswordRecoveryProof(identity: RecoveryIdentity): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(PASSWORD_RECOVERY_COOKIE_NAME, createPasswordRecoveryProof(identity, getSupabaseServiceRoleKey()), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: PASSWORD_RECOVERY_COOKIE_MAX_AGE_SECONDS,
    path: "/",
  });
}

// PKCE callbacks must prove recovery through verified claims. A type=recovery
// query parameter or an ordinary OTP/password session is not sufficient.
export async function markPasswordRecoverySession(): Promise<boolean> {
  const identity = await getRecoveryIdentity(await createClient());
  if (!identity || !hasRecentRecoveryAuthentication(identity.claims, identity.userId)) return false;
  await savePasswordRecoveryProof(identity);
  return true;
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
  const emailResult = await sendGoTruePasswordRecoveryEmail({
    email: normalizePersonnelEmail(personnel.email),
    redirectTo,
  });

  if (!emailResult.ok) {
    console.error("Password recovery email request failed", {
      operation: "auth.v1.recover",
      personnelId: personnel.id,
      code: emailResult.code,
      message: emailResult.message,
      status: emailResult.status,
    });
  }

  return genericResponse;
}

async function getRecoveryIdentity(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user?.email) return null;

  const { data: verified, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError || verified?.claims.sub !== user.id || typeof verified.claims.session_id !== "string" || !verified.claims.session_id) return null;

  const personnel = await getAuthenticatedPersonnel();
  if (!personnel || normalizePersonnelEmail(user.email) !== normalizePersonnelEmail(personnel.email)) return null;
  return { userId: user.id, sessionId: verified.claims.session_id, claims: verified.claims };
}

async function verifyRecoverySession(): Promise<boolean> {
  const cookieStore = await cookies();
  const proof = cookieStore.get(PASSWORD_RECOVERY_COOKIE_NAME)?.value;
  if (!proof) return false;
  const identity = await getRecoveryIdentity(await createClient());
  return Boolean(identity && verifyPasswordRecoveryProof(proof, identity, getSupabaseServiceRoleKey()));
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

  const valid = await markPasswordRecoverySession();
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
  // Reopening the form may reuse proof for this session, but never renew its expiry.
  return await verifyRecoverySession() || await markPasswordRecoverySession();
}

export async function verifyPasswordRecoveryToken(tokenHash: string): Promise<boolean> {
  if (!/^[a-f0-9]{40,128}$/i.test(tokenHash)) return false;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" });
  if (error || !data.user) return false;
  // Supabase's token-hash recovery exchange issues an "otp" AMR. The successful
  // recovery-specific exchange is the proof of purpose; bind it to this session.
  const identity = await getRecoveryIdentity(supabase);
  if (!identity || identity.userId !== data.user.id) return false;
  await savePasswordRecoveryProof(identity);
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
