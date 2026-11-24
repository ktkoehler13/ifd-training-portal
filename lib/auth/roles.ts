import type { PersonnelRole } from "@/types/personnel";

export const ADMINISTRATIVE_ROLES = [
  "mto",
  "deputy_chief",
  "admin",
  "office",
] as const satisfies readonly PersonnelRole[];

export type AdministrativeRole = (typeof ADMINISTRATIVE_ROLES)[number];

export function isAdministrativeRole(
  role: PersonnelRole,
): role is AdministrativeRole {
  return (
    role === "mto" || role === "deputy_chief" || role === "admin" || role === "office"
  );
}

export function isPersonnelPasswordResetRole(role: PersonnelRole): boolean {
  return role === "mto" || role === "admin" || role === "office";
}

export function isSignatureEligibleRole(role: PersonnelRole): boolean {
  return role === "firefighter" || role === "mto" || role === "deputy_chief" || role === "admin" || role === "office";
}
