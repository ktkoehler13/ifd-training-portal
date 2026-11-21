import { isAdministrativeRole, isSignatureEligibleRole } from "@/lib/auth/roles";
import type { PersonnelRole } from "@/types/personnel";

export interface NavLink {
  label: string;
  href: string;
}

/** Main portal navigation for a signed-in role. Pages still enforce access. */
export function primaryNavLinks(role: PersonnelRole): NavLink[] {
  const links: NavLink[] = [
    { label: "Dashboard", href: "/dashboard" },
    { label: "My requests", href: "/requests" },
  ];
  if (role === "mto" || role === "deputy_chief") links.push({ label: "Approvals", href: "/approvals" });
  links.push({ label: "Compensation", href: "/compensation" });
  if (role === "office" || isAdministrativeRole(role)) links.push({ label: "City Authorizations", href: "/city-authorizations" });
  return links;
}

export function adminNavLinks(role: PersonnelRole): NavLink[] {
  if (!isAdministrativeRole(role)) return [];
  return [
    { label: "User management", href: "/admin/users" },
    { label: "All requests", href: "/admin/requests" },
    { label: "Approved training", href: "/admin/approved-training" },
    { label: "System settings", href: "/admin/settings" },
  ];
}

export function accountNavLinks(role: PersonnelRole): NavLink[] {
  return [
    { label: "My profile", href: "/settings/profile" },
    ...(isSignatureEligibleRole(role) ? [{ label: "My signature", href: "/settings/signature" }] : []),
    { label: "Change password", href: "/settings/password" },
  ];
}

/** Dashboard matches exactly; other sections also match their sub-pages. */
export function isActiveNavLink(href: string, pathname: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  if (href === "/requests") return pathname === "/requests" || (pathname.startsWith("/requests/") && !pathname.startsWith("/requests/new"));
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function personnelInitials(firstName: string | null | undefined, lastName: string | null | undefined, badgeNumber: string): string {
  const initials = `${firstName?.trim()?.[0] ?? ""}${lastName?.trim()?.[0] ?? ""}`.toUpperCase();
  return initials || badgeNumber.slice(0, 2).toUpperCase();
}
