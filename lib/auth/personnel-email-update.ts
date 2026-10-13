import { isAdministrativeRole } from "./roles";
import { isValidPersonnelEmail, normalizePersonnelEmail } from "../personnel";
import type { PersonnelRecord, PersonnelRow, PersonnelUpdateInput } from "../../types/personnel";

export const SEPARATE_EMAIL_CHANGE_MESSAGE =
  "Save changes to the name, badge, rank, role, or status before changing the email address.";

export function hasOtherPersonnelChanges(user: PersonnelRecord, input: PersonnelUpdateInput): boolean {
  return (user.firstName ?? "") !== input.firstName || (user.lastName ?? "") !== input.lastName ||
    user.badgeNumber !== input.badgeNumber || user.title !== input.title ||
    user.role !== input.role || user.active !== input.active;
}

export class PersonnelEmailUpdateError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

type LinkedPersonnel = PersonnelRow & { auth_user_id: string | null };
export interface PersonnelEmailDependencies {
  getPersonnel(id: string): Promise<LinkedPersonnel | null>;
  getAuthUser(id: string): Promise<{ id: string; email?: string } | null>;
  updateAuthEmail(id: string, email: string): Promise<void>;
}

export async function updatePersonnelEmail(
  actor: PersonnelRecord | null,
  input: { personnelId: string; email: string; expectedEmail: string },
  dependencies: PersonnelEmailDependencies,
): Promise<LinkedPersonnel> {
  if (!actor?.active || !isAdministrativeRole(actor.role)) {
    throw new PersonnelEmailUpdateError("Access denied.", 403);
  }
  const email = normalizePersonnelEmail(input.email);
  if (!isValidPersonnelEmail(email)) {
    throw new PersonnelEmailUpdateError("Enter a valid email address.", 400);
  }
  const target = await dependencies.getPersonnel(input.personnelId);
  if (!target) throw new PersonnelEmailUpdateError("Personnel record not found.", 404);
  if (!target.auth_user_id) {
    throw new PersonnelEmailUpdateError("This personnel record has no linked sign-in account. Contact an administrator.", 409);
  }
  const authUser = await dependencies.getAuthUser(target.auth_user_id);
  if (!authUser?.email || authUser.id !== target.auth_user_id || normalizePersonnelEmail(authUser.email) !== target.email) {
    throw new PersonnelEmailUpdateError("The profile and sign-in account do not match. Contact an administrator before changing the email.", 409);
  }
  // A retry after a successful save is harmless, including a lost HTTP response.
  if (target.email === email) return target;
  if (target.email !== normalizePersonnelEmail(input.expectedEmail)) {
    throw new PersonnelEmailUpdateError("This email was changed by someone else. Refresh before editing it again.", 409);
  }

  let updateFailed = false;
  try {
    // The database trigger updates personnel in this same Auth transaction.
    // Never write personnel.email separately or create a replacement Auth user.
    await dependencies.updateAuthEmail(target.auth_user_id, email);
  } catch { updateFailed = true; }

  const [updated, verifiedAuth] = await Promise.all([
    dependencies.getPersonnel(target.id), dependencies.getAuthUser(target.auth_user_id),
  ]);
  if (updated?.auth_user_id === target.auth_user_id && updated.email === email &&
      verifiedAuth?.id === target.auth_user_id && verifiedAuth.email &&
      normalizePersonnelEmail(verifiedAuth.email) === email) return updated;

  throw new PersonnelEmailUpdateError(updateFailed
    ? "Unable to change the email. It may already be in use. Refresh the record and try again."
    : "Unable to confirm the email change. Refresh the record before trying again.", 409);
}
