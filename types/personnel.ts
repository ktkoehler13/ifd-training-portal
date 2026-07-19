export type PersonnelRole = "firefighter" | "mto" | "deputy_chief" | "admin";

export type PersonnelTitle =
  | "firefighter"
  | "lieutenant"
  | "assistant_chief"
  | "deputy_chief"
  | "fire_chief";

export interface PersonnelRecord {
  id: string;
  badgeNumber: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  title: PersonnelTitle;
  role: PersonnelRole;
  active: boolean;
  mustChangePassword: boolean;
  passwordSetupCompletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PersonnelUpdateInput {
  firstName: string;
  lastName: string;
  badgeNumber: string;
  email: string;
  title: PersonnelTitle;
  role: PersonnelRole;
  active: boolean;
}

export interface PersonnelInsertInput {
  firstName: string;
  lastName: string;
  badgeNumber: string;
  email: string;
  title: PersonnelTitle;
  role: PersonnelRole;
  active: boolean;
}

export interface CreatePersonnelAccountInput extends PersonnelInsertInput {
  initialPassword: string;
}

export interface PersonnelRow {
  id: string;
  badge_number: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  title: PersonnelTitle;
  role: PersonnelRole;
  active: boolean;
  must_change_password: boolean;
  password_setup_completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export const PERSONNEL_TITLES: PersonnelTitle[] = [
  "firefighter",
  "lieutenant",
  "assistant_chief",
  "deputy_chief",
  "fire_chief",
];

export const PERSONNEL_TITLE_LABELS: Record<PersonnelTitle, string> = {
  firefighter: "Firefighter",
  lieutenant: "Lieutenant",
  assistant_chief: "Assistant Chief",
  deputy_chief: "Deputy Chief",
  fire_chief: "Fire Chief",
};

export const PERSONNEL_ROLES: PersonnelRole[] = [
  "firefighter",
  "mto",
  "deputy_chief",
  "admin",
];

export const PERSONNEL_ROLE_LABELS: Record<PersonnelRole, string> = {
  firefighter: "User",
  mto: "MTO",
  deputy_chief: "Deputy Chief",
  admin: "Admin",
};
