import "server-only";

import { getApplicationOrigin } from "@/lib/auth/app-url";
import { markPersonnelMustChangePassword } from "@/lib/auth/admin-personnel-server";
import {
  normalizeBadgeNumberForLookup,
  resolveActivePersonnelByBadge,
} from "@/lib/auth/personnel-lookup-server";
import { PASSWORD_SETUP_REQUEST_SUCCESS_MESSAGE } from "@/lib/auth/password-setup-messages";
import {
  isPasswordSetupRateLimited,
  recordPasswordSetupAttempt,
} from "@/lib/auth/password-setup-rate-limit";
import { normalizePersonnelEmail } from "@/lib/personnel";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";

type AuthUserLookupResult =
  | { kind: "found" }
  | { kind: "missing" }
  | { kind: "ambiguous" };

async function resolveAuthUserForPasswordSetup(
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
      console.error("Password setup Auth user lookup failed", {
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

export async function requestPasswordSetup(input: {
  badgeNumber: string;
  ipAddress: string;
  requestOrigin: string;
}): Promise<{ ok: true; message: string }> {
  const normalizedBadge = normalizeBadgeNumberForLookup(input.badgeNumber);
  const rateLimitBadge = normalizedBadge || input.badgeNumber.trim();
  const genericResponse = {
    ok: true as const,
    message: PASSWORD_SETUP_REQUEST_SUCCESS_MESSAGE,
  };

  if (
    isPasswordSetupRateLimited(input.ipAddress, rateLimitBadge) ||
    !rateLimitBadge
  ) {
    return genericResponse;
  }

  recordPasswordSetupAttempt(input.ipAddress, rateLimitBadge);

  if (!normalizedBadge) {
    return genericResponse;
  }

  const personnel = await resolveActivePersonnelByBadge(normalizedBadge);

  if (!personnel) {
    return genericResponse;
  }

  if (personnel.passwordSetupCompletedAt && !personnel.mustChangePassword) {
    return genericResponse;
  }

  const authLookup = await resolveAuthUserForPasswordSetup(
    personnel.email,
    personnel.id,
  );

  if (authLookup.kind !== "found") {
    return genericResponse;
  }

  try {
    await markPersonnelMustChangePassword(personnel.id);
  } catch {
    return genericResponse;
  }

  const supabase = await createClient();
  const redirectTo = `${getApplicationOrigin(input.requestOrigin)}/auth/callback?flow=password-setup`;
  const { error: emailError } = await supabase.auth.resetPasswordForEmail(
    normalizePersonnelEmail(personnel.email),
    { redirectTo },
  );

  if (emailError) {
    console.error("Password setup email request failed", {
      operation: "auth.resetPasswordForEmail",
      personnelId: personnel.id,
      code: emailError.code,
      message: emailError.message,
    });
  }

  return genericResponse;
}
