import "server-only";

import {
  generateTemporaryPassword,
  validatePasswordStrength,
} from "@/lib/auth/password";
import {
  PasswordResetError,
  PASSWORD_RESET_AMBIGUOUS_AUTH_ACCOUNT_MESSAGE,
  PASSWORD_RESET_FAILED_MESSAGE,
  PASSWORD_RESET_INACTIVE_MESSAGE,
  PASSWORD_RESET_NO_AUTH_ACCOUNT_MESSAGE,
  PASSWORD_RESET_PERSONNEL_NOT_FOUND_MESSAGE,
  PASSWORD_RESET_UNAUTHORIZED_MESSAGE,
} from "@/lib/auth/password-reset-messages";
import { getAuthenticatedPersonnel } from "@/lib/auth/personnel";
import {
  mapPersonnelRow,
  normalizePersonnelEmail,
  getPersonnelErrorMessage,
} from "@/lib/personnel";
import { isAdministrativeRole } from "@/lib/auth/roles";
import { createServiceRoleClient } from "@/lib/supabase/service";
import type {
  PersonnelInsertInput,
  PersonnelRecord,
  PersonnelRow,
} from "@/types/personnel";

type AuthUserLookupResult =
  | { kind: "found"; authUserId: string }
  | { kind: "missing" }
  | { kind: "ambiguous" };

async function findAuthUserMatchesByEmail(
  email: string,
  personnelId?: string,
): Promise<string[]> {
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
      console.error("Administrator password reset Auth user lookup failed", {
        operation: "auth.admin.listUsers",
        personnelId,
        code: error.code,
        message: error.message,
      });
      throw new PasswordResetError(PASSWORD_RESET_FAILED_MESSAGE);
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

  return matches;
}

async function resolveAuthUserIdByPersonnelEmail(
  email: string,
  personnelId?: string,
): Promise<AuthUserLookupResult> {
  const matches = await findAuthUserMatchesByEmail(email, personnelId);

  if (matches.length === 0) {
    return { kind: "missing" };
  }

  if (matches.length > 1) {
    return { kind: "ambiguous" };
  }

  return { kind: "found", authUserId: matches[0]! };
}

async function deleteAuthUserById(userId: string): Promise<void> {
  const service = createServiceRoleClient();
  await service.auth.admin.deleteUser(userId);
}

async function markPersonnelMustChangePassword(
  personnelId: string,
): Promise<void> {
  const service = createServiceRoleClient();
  const { error } = await service
    .from("personnel")
    .update({ must_change_password: true })
    .eq("id", personnelId);

  if (error) {
    console.error("Administrator password reset personnel flag update failed", {
      personnelId,
      code: error.code,
      message: error.message,
    });
    throw new PasswordResetError(PASSWORD_RESET_FAILED_MESSAGE);
  }
}

export async function clearPersonnelMustChangePassword(
  personnelId: string,
): Promise<void> {
  const service = createServiceRoleClient();
  const { error } = await service
    .from("personnel")
    .update({ must_change_password: false })
    .eq("id", personnelId);

  if (error) {
    throw new Error("Unable to clear the required password change flag.");
  }
}

export async function requireAdministrativePersonnel(): Promise<PersonnelRecord> {
  const personnel = await getAuthenticatedPersonnel();

  if (!personnel || !isAdministrativeRole(personnel.role)) {
    throw new PasswordResetError(PASSWORD_RESET_UNAUTHORIZED_MESSAGE);
  }

  return personnel;
}

export async function createPersonnelAuthAccount(input: {
  personnel: PersonnelInsertInput;
}): Promise<{ personnel: PersonnelRecord; temporaryPassword: string }> {
  await requireAdministrativePersonnel();

  const temporaryPassword = generateTemporaryPassword();
  const passwordError = validatePasswordStrength(temporaryPassword);

  if (passwordError) {
    throw new Error("Unable to generate a valid temporary password.");
  }

  const service = createServiceRoleClient();
  let createdAuthUserId: string | null = null;

  try {
    const { data: authData, error: authError } =
      await service.auth.admin.createUser({
        email: normalizePersonnelEmail(input.personnel.email),
        password: temporaryPassword,
        email_confirm: true,
      });

    if (authError || !authData.user) {
      throw new Error(
        authError?.message ??
          "Unable to create the Supabase Auth account for this user.",
      );
    }

    createdAuthUserId = authData.user.id;

    const { data, error } = await service
      .from("personnel")
      .insert({
        first_name: input.personnel.firstName,
        last_name: input.personnel.lastName,
        badge_number: input.personnel.badgeNumber,
        email: normalizePersonnelEmail(input.personnel.email),
        role: input.personnel.role,
        active: input.personnel.active,
        must_change_password: true,
      })
      .select("*")
      .single();

    if (error || !data) {
      throw new Error(getPersonnelErrorMessage(error));
    }

    return {
      personnel: mapPersonnelRow(data as PersonnelRow),
      temporaryPassword,
    };
  } catch (error) {
    if (createdAuthUserId) {
      await deleteAuthUserById(createdAuthUserId);
    }

    throw error instanceof Error
      ? error
      : new Error("Unable to create personnel account.");
  }
}

export async function resetPersonnelAuthPassword(input: {
  personnelId: string;
}): Promise<{ temporaryPassword: string }> {
  await requireAdministrativePersonnel();

  const service = createServiceRoleClient();
  const { data: personnelRow, error: personnelError } = await service
    .from("personnel")
    .select("*")
    .eq("id", input.personnelId)
    .maybeSingle();

  if (personnelError || !personnelRow) {
    throw new PasswordResetError(PASSWORD_RESET_PERSONNEL_NOT_FOUND_MESSAGE);
  }

  const personnel = mapPersonnelRow(personnelRow as PersonnelRow);

  if (!personnel.active) {
    throw new PasswordResetError(PASSWORD_RESET_INACTIVE_MESSAGE);
  }

  const authLookup = await resolveAuthUserIdByPersonnelEmail(
    personnel.email,
    personnel.id,
  );

  if (authLookup.kind === "missing") {
    throw new PasswordResetError(PASSWORD_RESET_NO_AUTH_ACCOUNT_MESSAGE);
  }

  if (authLookup.kind === "ambiguous") {
    throw new PasswordResetError(PASSWORD_RESET_AMBIGUOUS_AUTH_ACCOUNT_MESSAGE);
  }

  const temporaryPassword = generateTemporaryPassword();
  const passwordError = validatePasswordStrength(temporaryPassword);

  if (passwordError) {
    throw new PasswordResetError(PASSWORD_RESET_FAILED_MESSAGE);
  }

  const { error: updateError } = await service.auth.admin.updateUserById(
    authLookup.authUserId,
    {
      password: temporaryPassword,
    },
  );

  if (updateError) {
    console.error("Administrator password reset Auth update failed", {
      personnelId: personnel.id,
      code: updateError.code,
      message: updateError.message,
    });
    throw new PasswordResetError(PASSWORD_RESET_FAILED_MESSAGE);
  }

  await markPersonnelMustChangePassword(personnel.id);

  return { temporaryPassword };
}

export { PasswordResetError } from "@/lib/auth/password-reset-messages";
