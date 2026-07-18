import { mapPersonnelRow, normalizePersonnelEmail } from "@/lib/personnel";
import { createClient } from "@/lib/supabase/server";
import type { PersonnelRecord, PersonnelRow } from "@/types/personnel";

export type AuthenticatedPersonnel = PersonnelRecord;

export async function getAuthenticatedPersonnel(): Promise<AuthenticatedPersonnel | null> {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user?.email) {
    return null;
  }

  const email = normalizePersonnelEmail(user.email);
  const { data, error } = await supabase
    .from("personnel")
    .select("*")
    .eq("email", email)
    .maybeSingle();

  if (error || !data || !data.active) {
    return null;
  }

  return mapPersonnelRow(data as PersonnelRow);
}

export async function getAuthenticatedPersonnelForLogin(input: {
  badgeNumber: string;
  email: string;
}): Promise<AuthenticatedPersonnel | null> {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user?.email) {
    return null;
  }

  const normalizedEmail = normalizePersonnelEmail(input.email);
  const authEmail = normalizePersonnelEmail(user.email);

  if (authEmail !== normalizedEmail) {
    return null;
  }

  const { data, error } = await supabase
    .from("personnel")
    .select("*")
    .eq("email", normalizedEmail)
    .eq("badge_number", input.badgeNumber.trim())
    .maybeSingle();

  if (error || !data || !data.active) {
    return null;
  }

  return mapPersonnelRow(data as PersonnelRow);
}
