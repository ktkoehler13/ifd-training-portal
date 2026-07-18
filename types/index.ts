export type UserRole = "firefighter" | "officer" | "admin";

export interface User {
  id: string;
  name: string;
  role: UserRole;
}
