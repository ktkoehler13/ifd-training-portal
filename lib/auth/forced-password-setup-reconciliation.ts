import "server-only";

import { clearPersonnelMustChangePassword } from "@/lib/auth/admin-personnel-server";
import { resolvePersonnelByEmail } from "@/lib/auth/personnel-lookup-server";
import { normalizePersonnelEmail } from "@/lib/personnel";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";

export const FORCED_PASSWORD_SETUP_PENDING_FINALIZE_METADATA_KEY =
  "forced_password_setup_pending_finalize";

function readPendingFinalizeMarker(
  appMetadata: Record<string, unknown> | undefined,
): boolean {
  return appMetadata?.[FORCED_PASSWORD_SETUP_PENDING_FINALIZE_METADATA_KEY] === true;
}

export async function markForcedPasswordSetupPendingFinalize(
  userId: string,
  appMetadata: Record<string, unknown> | undefined,
): Promise<void> {
  const service = createServiceRoleClient();
  const { error } = await service.auth.admin.updateUserById(userId, {
    app_metadata: {
      ...(appMetadata ?? {}),
      [FORCED_PASSWORD_SETUP_PENDING_FINALIZE_METADATA_KEY]: true,
    },
  });

  if (error) {
    console.error("Forced password setup pending finalize marker failed", {
      userId,
      code: error.code,
      message: error.message,
    });
  }
}

async function clearForcedPasswordSetupPendingFinalize(
  userId: string,
  appMetadata: Record<string, unknown> | undefined,
): Promise<void> {
  const service = createServiceRoleClient();
  const { error } = await service.auth.admin.updateUserById(userId, {
    app_metadata: {
      ...(appMetadata ?? {}),
      [FORCED_PASSWORD_SETUP_PENDING_FINALIZE_METADATA_KEY]: false,
    },
  });

  if (error) {
    console.error("Forced password setup pending finalize metadata clear failed", {
      userId,
      code: error.code,
      message: error.message,
    });
    throw error;
  }
}

export async function reconcileForcedPasswordSetupIfPending(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user?.id || !user.email) {
    return false;
  }

  const appMetadata = (user.app_metadata ?? {}) as Record<string, unknown>;
  if (!readPendingFinalizeMarker(appMetadata)) {
    return false;
  }

  const personnel = await resolvePersonnelByEmail(user.email);
  if (!personnel?.active || !personnel.mustChangePassword) {
    return false;
  }

  if (
    normalizePersonnelEmail(user.email) !==
    normalizePersonnelEmail(personnel.email)
  ) {
    return false;
  }

  try {
    await clearPersonnelMustChangePassword(personnel.id);
  } catch {
    return false;
  }

  try {
    await clearForcedPasswordSetupPendingFinalize(user.id, appMetadata);
  } catch {
    return true;
  }

  return true;
}
