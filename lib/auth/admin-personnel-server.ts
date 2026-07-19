import "server-only";

import {
  generateTemporaryPassword,
  validatePasswordStrength,
} from "@/lib/auth/password";
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

async function findAuthUserIdByEmail(email: string): Promise<string | null> {
  const service = createServiceRoleClient();
  const normalizedEmail = normalizePersonnelEmail(email);
  let page = 1;

  while (page <= 10) {
    const { data, error } = await service.auth.admin.listUsers({
      page,
      perPage: 200,
    });

    if (error || !data.users.length) {
      return null;
    }

    const match = data.users.find(
      (user) =>
        user.email &&
        normalizePersonnelEmail(user.email) === normalizedEmail,
    );

    if (match) {
      return match.id;
    }

    if (data.users.length < 200) {
      break;
    }

    page += 1;
  }

  return null;
}

async function deleteAuthUserById(userId: string): Promise<void> {
  const service = createServiceRoleClient();
  await service.auth.admin.deleteUser(userId);
}

export async function requireAdministrativePersonnel(): Promise<PersonnelRecord> {
  const personnel = await getAuthenticatedPersonnel();

  if (!personnel || !isAdministrativeRole(personnel.role)) {
    throw new Error("Administrative access is required.");
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
    throw new Error("Personnel record not found.");
  }

  const personnel = mapPersonnelRow(personnelRow as PersonnelRow);
  const authUserId = await findAuthUserIdByEmail(personnel.email);

  if (!authUserId) {
    throw new Error(
      "No Supabase Auth account exists for this personnel email.",
    );
  }

  const temporaryPassword = generateTemporaryPassword();
  const passwordError = validatePasswordStrength(temporaryPassword);

  if (passwordError) {
    throw new Error("Unable to generate a valid temporary password.");
  }

  const { error: updateError } = await service.auth.admin.updateUserById(
    authUserId,
    {
      password: temporaryPassword,
    },
  );

  if (updateError) {
    throw new Error("Unable to reset the password for this user.");
  }

  return { temporaryPassword };
}
