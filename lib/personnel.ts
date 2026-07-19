import type {
  PersonnelInsertInput,
  PersonnelRecord,
  PersonnelRole,
  PersonnelRow,
  PersonnelUpdateInput,
  CreatePersonnelAccountInput,
} from "@/types/personnel";
import { PERSONNEL_ROLE_LABELS } from "@/types/personnel";
import {
  INITIAL_PASSWORD_MISMATCH_MESSAGE,
  validateInitialPassword,
} from "@/lib/auth/password";

export function mapPersonnelRow(row: PersonnelRow): PersonnelRecord {
  return {
    id: row.id,
    badgeNumber: row.badge_number,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    role: row.role,
    active: row.active,
    mustChangePassword: row.must_change_password ?? false,
    passwordSetupCompletedAt: row.password_setup_completed_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function normalizePersonnelName(value: string): string {
  return value.trim();
}

export function hasCompletePersonnelName(
  personnel: Pick<PersonnelRecord, "firstName" | "lastName">,
): boolean {
  return Boolean(personnel.firstName?.trim() && personnel.lastName?.trim());
}

export function formatPersonnelFullName(
  personnel: Pick<PersonnelRecord, "firstName" | "lastName">,
): string | null {
  if (!hasCompletePersonnelName(personnel)) {
    return null;
  }

  return `${personnel.firstName!.trim()} ${personnel.lastName!.trim()}`;
}

export function formatPersonnelLastFirstName(
  personnel: Pick<PersonnelRecord, "firstName" | "lastName">,
): string {
  if (!hasCompletePersonnelName(personnel)) {
    return "Name not entered";
  }

  return `${personnel.lastName!.trim()}, ${personnel.firstName!.trim()}`;
}

export function formatPersonnelDashboardIdentity(
  personnel: Pick<PersonnelRecord, "badgeNumber" | "role" | "firstName" | "lastName">,
): string {
  const fullName = formatPersonnelFullName(personnel);
  const roleLabel = PERSONNEL_ROLE_LABELS[personnel.role];

  if (fullName) {
    return `${fullName} — Badge ${personnel.badgeNumber} (${roleLabel})`;
  }

  return `Badge ${personnel.badgeNumber} (${roleLabel})`;
}

export const PERSONNEL_NAME_REQUIRED_MESSAGE =
  "Your personnel profile must include a first and last name before creating a training request.";

export function normalizePersonnelEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidPersonnelEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizePersonnelEmail(email));
}

export function isPersonnelRole(value: string): value is PersonnelRole {
  return (
    value === "firefighter" ||
    value === "mto" ||
    value === "deputy_chief" ||
    value === "admin"
  );
}

export const SELF_ACCOUNT_PROTECTION_MESSAGE =
  "You cannot deactivate or delete your own signed-in account.";

export const SELF_EDIT_NOTICE =
  "You cannot deactivate or delete your own signed-in account. Changing your email will sign you out.";

export const SELF_EDIT_EMAIL_CONFIRM_MESSAGE =
  "Changing your email will sign you out. Sign in again with your badge number and the password for the updated account.";

export const SELF_EDIT_IDENTITY_CONFIRM_MESSAGE =
  "Changing your own badge number or role can affect how your account is identified and authorized. Continue only if you intend to make this change.";

export interface SelfEditChanges {
  emailChanged: boolean;
  badgeChanged: boolean;
  roleChanged: boolean;
  activeChanged: boolean;
  hasChanges: boolean;
  requiresEmailSignOut: boolean;
  requiresIdentityConfirmation: boolean;
}

export function getSelfEditChanges(
  user: PersonnelRecord,
  values: PersonnelFormValues,
  currentUserEmail: string,
): SelfEditChanges {
  const normalizedCurrentEmail = normalizePersonnelEmail(currentUserEmail);
  const normalizedNextEmail = normalizePersonnelEmail(values.email);
  const emailChanged = normalizedNextEmail !== normalizedCurrentEmail;
  const badgeChanged = values.badgeNumber.trim() !== user.badgeNumber;
  const roleChanged = values.role !== user.role;
  const activeChanged = values.active !== user.active;
  const hasChanges = emailChanged || badgeChanged || roleChanged || activeChanged;

  return {
    emailChanged,
    badgeChanged,
    roleChanged,
    activeChanged,
    hasChanges,
    requiresEmailSignOut: emailChanged,
    requiresIdentityConfirmation: badgeChanged || roleChanged,
  };
}

export interface PersonnelFormValues {
  firstName: string;
  lastName: string;
  badgeNumber: string;
  email: string;
  role: PersonnelRole | "";
  active: boolean;
}

export interface AddUserFormValues extends PersonnelFormValues {
  initialPassword: string;
  confirmInitialPassword: string;
}

export type PersonnelFormErrors = Partial<
  Record<keyof PersonnelFormValues | "submit", string>
>;

export type AddUserFormErrors = Partial<
  Record<keyof AddUserFormValues | "submit", string>
>;

export function personnelRecordToFormValues(
  user: PersonnelRecord,
): PersonnelFormValues {
  return {
    firstName: user.firstName ?? "",
    lastName: user.lastName ?? "",
    badgeNumber: user.badgeNumber,
    email: user.email,
    role: user.role,
    active: user.active,
  };
}

export function isSamePersonnelRecord(
  user: PersonnelRecord,
  currentEmail: string,
): boolean {
  return user.email === normalizePersonnelEmail(currentEmail);
}

export function validatePersonnelForm(
  values: PersonnelFormValues,
  existingUsers: PersonnelRecord[],
  options?: { excludeUserId?: string },
): PersonnelFormErrors {
  const errors: PersonnelFormErrors = {};
  const badgeNumber = values.badgeNumber.trim();
  const firstName = normalizePersonnelName(values.firstName);
  const lastName = normalizePersonnelName(values.lastName);
  const email = normalizePersonnelEmail(values.email);
  const comparableUsers = options?.excludeUserId
    ? existingUsers.filter((user) => user.id !== options.excludeUserId)
    : existingUsers;

  if (!firstName) {
    errors.firstName = "First name is required.";
  }

  if (!lastName) {
    errors.lastName = "Last name is required.";
  }

  if (!badgeNumber) {
    errors.badgeNumber = "Badge number is required.";
  }

  if (!email) {
    errors.email = "Department email is required.";
  } else if (!isValidPersonnelEmail(email)) {
    errors.email = "Enter a valid email address.";
  }

  if (!values.role || !isPersonnelRole(values.role)) {
    errors.role = "Role is required.";
  }

  if (badgeNumber) {
    const willBeActive = values.active !== false;
    const duplicateBadge = comparableUsers.some(
      (user) =>
        user.active &&
        willBeActive &&
        user.badgeNumber.trim().toLowerCase() === badgeNumber.toLowerCase(),
    );
    if (duplicateBadge) {
      errors.badgeNumber =
        "This badge number is already in use by an active personnel record.";
    }
  }

  if (email) {
    const duplicateEmail = comparableUsers.some((user) => user.email === email);
    if (duplicateEmail) {
      errors.email = "This email address is already in use.";
    }
  }

  return errors;
}

export function validateAddUserForm(
  values: AddUserFormValues,
  existingUsers: PersonnelRecord[],
): AddUserFormErrors {
  const errors: AddUserFormErrors = validatePersonnelForm(values, existingUsers);
  const initialPasswordError = validateInitialPassword(values.initialPassword);

  if (initialPasswordError) {
    errors.initialPassword = initialPasswordError;
  }

  if (
    values.initialPassword !== values.confirmInitialPassword &&
    !errors.confirmInitialPassword
  ) {
    errors.confirmInitialPassword = INITIAL_PASSWORD_MISMATCH_MESSAGE;
  }

  return errors;
}

export function toCreatePersonnelAccountInput(
  values: AddUserFormValues,
): CreatePersonnelAccountInput {
  return {
    ...toPersonnelInsertInput(values),
    initialPassword: values.initialPassword,
  };
}

export function toPersonnelUpdateInput(
  values: PersonnelFormValues,
): PersonnelUpdateInput {
  return {
    firstName: normalizePersonnelName(values.firstName),
    lastName: normalizePersonnelName(values.lastName),
    badgeNumber: values.badgeNumber.trim(),
    email: normalizePersonnelEmail(values.email),
    role: values.role as PersonnelRole,
    active: values.active,
  };
}

export function toPersonnelInsertInput(
  values: PersonnelFormValues,
): PersonnelInsertInput {
  return {
    firstName: normalizePersonnelName(values.firstName),
    lastName: normalizePersonnelName(values.lastName),
    badgeNumber: values.badgeNumber.trim(),
    email: normalizePersonnelEmail(values.email),
    role: values.role as PersonnelRole,
    active: values.active,
  };
}

export function formatPersonnelCreatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function getPersonnelErrorMessage(error: unknown): string {
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    if (error.message.includes("permission denied") || error.message.includes("RLS")) {
      return "Access denied by Supabase Row Level Security. Administrative access is required to manage personnel records.";
    }

    if (error.message.includes("duplicate key")) {
      return "A user with this badge number or email already exists. Active badge numbers must be unique.";
    }

    return error.message;
  }

  return "An unexpected error occurred while communicating with Supabase.";
}
