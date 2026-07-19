import "server-only";

import { clearPersonnelMustChangePassword } from "@/lib/auth/admin-personnel-server";
import {
  generateTemporaryPassword,
  validatePasswordStrength,
  CURRENT_PASSWORD_INCORRECT_MESSAGE,
  PASSWORD_MISMATCH_MESSAGE,
  PASSWORD_CHANGE_SUCCESS_MESSAGE,
} from "@/lib/auth/password";
import { resolvePersonnelByEmail } from "@/lib/auth/personnel-lookup-server";
import { getAuthenticatedPersonnel } from "@/lib/auth/personnel";
import { normalizePersonnelEmail } from "@/lib/personnel";
import { createClient } from "@/lib/supabase/server";

export interface ChangePasswordInput {
  currentPassword?: string;
  newPassword: string;
  confirmPassword: string;
  requiredPasswordChange?: boolean;
}

export async function changeAuthenticatedUserPassword(
  input: ChangePasswordInput,
): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const personnel = await getAuthenticatedPersonnel();

  if (!personnel) {
    return { ok: false, error: "Sign in to change your password." };
  }

  if (input.newPassword !== input.confirmPassword) {
    return { ok: false, error: PASSWORD_MISMATCH_MESSAGE };
  }

  const passwordError = validatePasswordStrength(input.newPassword);
  if (passwordError) {
    return { ok: false, error: passwordError };
  }

  const supabase = await createClient();
  const requiresCurrentPassword =
    !input.requiredPasswordChange || !personnel.mustChangePassword;

  if (requiresCurrentPassword) {
    const currentPassword = input.currentPassword?.trim() ?? "";

    if (!currentPassword) {
      return { ok: false, error: CURRENT_PASSWORD_INCORRECT_MESSAGE };
    }

    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: personnel.email,
      password: currentPassword,
    });

    if (verifyError) {
      return { ok: false, error: CURRENT_PASSWORD_INCORRECT_MESSAGE };
    }
  }

  const { error: updateError } = await supabase.auth.updateUser({
    password: input.newPassword,
  });

  if (updateError) {
    return {
      ok: false,
      error: "Unable to update password right now. Try again later.",
    };
  }

  if (personnel.mustChangePassword) {
    await clearPersonnelMustChangePassword(personnel.id);
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

export { generateTemporaryPassword, validatePasswordStrength };
