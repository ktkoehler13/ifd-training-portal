import "server-only";

import { normalizeBadgeNumberForLookup } from "@/lib/auth/badge";
import { mapPersonnelRow, normalizePersonnelEmail } from "@/lib/personnel";
import { createServiceRoleClient } from "@/lib/supabase/service";
import type { PersonnelRecord, PersonnelRow } from "@/types/personnel";
import { isPersonnelRole } from "@/lib/personnel";

export { normalizeBadgeNumberForLookup } from "@/lib/auth/badge";

export async function resolveActivePersonnelByBadge(
  badgeNumber: string,
): Promise<PersonnelRecord | null> {
  const normalizedBadge = normalizeBadgeNumberForLookup(badgeNumber);

  if (!normalizedBadge) {
    return null;
  }

  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("personnel")
    .select("*")
    .eq("active", true);

  if (error || !data) {
    return null;
  }

  const matches = (data as PersonnelRow[]).filter(
    (row) =>
      row.badge_number.trim().toLowerCase() === normalizedBadge.toLowerCase(),
  );

  if (matches.length !== 1) {
    return null;
  }

  const personnel = mapPersonnelRow(matches[0]);

  if (!isPersonnelRole(personnel.role)) {
    return null;
  }

  return personnel;
}

export async function resolvePersonnelByEmail(
  email: string,
): Promise<PersonnelRecord | null> {
  const normalizedEmail = normalizePersonnelEmail(email);

  if (!normalizedEmail) {
    return null;
  }

  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("personnel")
    .select("*")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const personnel = mapPersonnelRow(data as PersonnelRow);

  if (!personnel.active || !isPersonnelRole(personnel.role)) {
    return null;
  }

  return personnel;
}
