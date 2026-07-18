import type { PersonnelRole } from "@/types/personnel";

export const ADMINISTRATIVE_ROLES = [
  "mto",
  "deputy_chief",
  "admin",
] as const satisfies readonly PersonnelRole[];

export type AdministrativeRole = (typeof ADMINISTRATIVE_ROLES)[number];

export function isAdministrativeRole(
  role: PersonnelRole,
): role is AdministrativeRole {
  return (
    role === "mto" || role === "deputy_chief" || role === "admin"
  );
}

export function isSignatureEligibleRole(role: PersonnelRole): boolean {
  return role === "mto" || role === "deputy_chief";
}
