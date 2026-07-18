import type {
  PersonnelInsertInput,
  PersonnelRecord,
  PersonnelRole,
  PersonnelRow,
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

export interface AddUserFormValues {
  badgeNumber: string;
  email: string;
  role: PersonnelRole | "";
  active: boolean;
}

export type AddUserFormErrors = Partial<
  Record<keyof AddUserFormValues | "submit", string>
>;

export function validateAddUserForm(
  values: AddUserFormValues,
  existingUsers: PersonnelRecord[],
): AddUserFormErrors {
  const errors: AddUserFormErrors = {};
  const badgeNumber = values.badgeNumber.trim();
  const email = normalizePersonnelEmail(values.email);

  if (!badgeNumber) {
    errors.badgeNumber = "Badge number is required.";
  }

  if (!email) {
    errors.email = "Department email is required.";
  } else if (!isValidPersonnelEmail(email)) {
    errors.email = "Enter a valid email address.";
  }

  if (!values.role) {
    errors.role = "Role is required.";
  }

  if (badgeNumber) {
    const duplicateBadge = existingUsers.some(
      (user) => user.badgeNumber.toLowerCase() === badgeNumber.toLowerCase(),
    );
    if (duplicateBadge) {
      errors.badgeNumber = "This badge number is already in use.";
    }
  }

  if (email) {
    const duplicateEmail = existingUsers.some((user) => user.email === email);
    if (duplicateEmail) {
      errors.email = "This email address is already in use.";
    }
  }

  return errors;
}

export function toPersonnelInsertInput(
  values: AddUserFormValues,
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
      return "Access denied by Supabase Row Level Security. Admin privileges are required to manage personnel records.";
    }

    if (error.message.includes("duplicate key")) {
      return "A user with this badge number or email already exists.";
    }

    return error.message;
  }

  return "An unexpected error occurred while communicating with Supabase.";
}
