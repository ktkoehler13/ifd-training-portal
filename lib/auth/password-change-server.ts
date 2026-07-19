import "server-only";

import { clearPersonnelMustChangePassword } from "@/lib/auth/admin-personnel-server";
import {
  markForcedPasswordSetupPendingFinalize,
  reconcileForcedPasswordSetupIfPending,
} from "@/lib/auth/forced-password-setup-reconciliation";
import {
  generateMemorableInitialPassword,
  validatePermanentPassword,
  CURRENT_PASSWORD_INCORRECT_MESSAGE,
  PASSWORD_MISMATCH_MESSAGE,
  PASSWORD_CHANGE_SUCCESS_MESSAGE,
} from "@/lib/auth/password";
import { resolvePersonnelByEmail } from "@/lib/auth/personnel-lookup-server";
import { normalizePersonnelEmail } from "@/lib/personnel";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";

export interface ChangePasswordInput {
  currentPassword?: string;
  newPassword: string;
  confirmPassword: string;
}

const FORCED_PASSWORD_UPDATE_FAILED_MESSAGE =
  "Unable to update password right now. Try again later.";

export const FORCED_PASSWORD_SETUP_PARTIAL_SUCCESS_MESSAGE =
  "Your password was changed, but account setup could not be finalized. Sign out and sign in with your new password, or contact an administrator.";

export async function changeAuthenticatedUserPassword(
  input: ChangePasswordInput,
): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  if (input.newPassword !== input.confirmPassword) {
    return { ok: false, error: PASSWORD_MISMATCH_MESSAGE };
  }

  const passwordError = validatePermanentPassword(input.newPassword);
  if (passwordError) {
    return { ok: false, error: passwordError };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user?.id || !user.email) {
    return { ok: false, error: "Sign in to change your password." };
  }

  await reconcileForcedPasswordSetupIfPending();

  const personnel = await resolvePersonnelByEmail(user.email);

  if (!personnel?.active) {
    return { ok: false, error: "Sign in to change your password." };
  }

  if (
    normalizePersonnelEmail(user.email) !==
    normalizePersonnelEmail(personnel.email)
  ) {
    return { ok: false, error: "Sign in to change your password." };
  }

  const hadPendingFinalize =
    (user.app_metadata as Record<string, unknown> | undefined)
      ?.forced_password_setup_pending_finalize === true;

  if (hadPendingFinalize && !personnel.mustChangePassword) {
    return { ok: true, message: PASSWORD_CHANGE_SUCCESS_MESSAGE };
  }

  if (personnel.mustChangePassword) {
    const service = createServiceRoleClient();
    const { error: updateError } = await service.auth.admin.updateUserById(
      user.id,
      {
        password: input.newPassword,
      },
    );

    if (updateError) {
      console.error("Password update failed", {
        mode: "forced-setup",
        personnelId: personnel.id,
        code: updateError.code,
        message: updateError.message,
      });
      return { ok: false, error: FORCED_PASSWORD_UPDATE_FAILED_MESSAGE };
    }

    try {
      await clearPersonnelMustChangePassword(personnel.id);
    } catch {
      await markForcedPasswordSetupPendingFinalize(
        user.id,
        user.app_metadata as Record<string, unknown> | undefined,
      );
      return { ok: false, error: FORCED_PASSWORD_SETUP_PARTIAL_SUCCESS_MESSAGE };
    }

    return { ok: true, message: PASSWORD_CHANGE_SUCCESS_MESSAGE };
  }

  const currentPassword = input.currentPassword ?? "";

  if (!currentPassword || currentPassword.trim().length === 0) {
    return { ok: false, error: CURRENT_PASSWORD_INCORRECT_MESSAGE };
  }

  const { error: updateError } = await supabase.auth.updateUser({
    password: input.newPassword,
    current_password: currentPassword,
  });

  if (updateError) {
    console.error("Password update failed", {
      mode: "ordinary-change",
      personnelId: personnel.id,
      code: updateError.code,
      message: updateError.message,
    });
    return { ok: false, error: CURRENT_PASSWORD_INCORRECT_MESSAGE };
  }

  return { ok: true, message: PASSWORD_CHANGE_SUCCESS_MESSAGE };
}

export async function verifyAuthenticatedSessionMatchesPersonnel(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return false;
  }

  const personnel = await resolvePersonnelByEmail(user.email);
  if (!personnel) {
    return false;
  }

  return (
    normalizePersonnelEmail(user.email) === normalizePersonnelEmail(personnel.email)
  );
}

export { generateMemorableInitialPassword, validatePermanentPassword };
