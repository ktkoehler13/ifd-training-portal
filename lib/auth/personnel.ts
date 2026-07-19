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
