import type {
  PersonnelInsertInput,
  PersonnelRecord,
  PersonnelRole,
  PersonnelRow,
  PersonnelUpdateInput,
} from "@/types/personnel";

export function mapPersonnelRow(row: PersonnelRow): PersonnelRecord {
  return {
    id: row.id,
    badgeNumber: row.badge_number,
    email: row.email,
    role: row.role,
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

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
  "Changing your email will sign you out. Future sign-in links will be sent to the new email address.";

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
  badgeNumber: string;
  email: string;
  role: PersonnelRole | "";
  active: boolean;
}

export type AddUserFormValues = PersonnelFormValues;

export type PersonnelFormErrors = Partial<
  Record<keyof PersonnelFormValues | "submit", string>
>;

export type AddUserFormErrors = PersonnelFormErrors;

export function personnelRecordToFormValues(
  user: PersonnelRecord,
): PersonnelFormValues {
  return {
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
  const email = normalizePersonnelEmail(values.email);
  const comparableUsers = options?.excludeUserId
    ? existingUsers.filter((user) => user.id !== options.excludeUserId)
    : existingUsers;

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
    const duplicateBadge = comparableUsers.some(
      (user) => user.badgeNumber.toLowerCase() === badgeNumber.toLowerCase(),
    );
    if (duplicateBadge) {
      errors.badgeNumber = "This badge number is already in use.";
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
  values: PersonnelFormValues,
  existingUsers: PersonnelRecord[],
): PersonnelFormErrors {
  return validatePersonnelForm(values, existingUsers);
}

export function toPersonnelUpdateInput(
  values: PersonnelFormValues,
): PersonnelUpdateInput {
  return {
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
      return "A user with this badge number or email already exists.";
    }

    return error.message;
  }

  return "An unexpected error occurred while communicating with Supabase.";
}
