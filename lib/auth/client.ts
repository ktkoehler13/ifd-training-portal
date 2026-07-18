"use client";

import { mapPersonnelRow, normalizePersonnelEmail } from "@/lib/personnel";
import { createClient } from "@/lib/supabase/client";
import type { AuthenticatedPersonnel } from "@/lib/auth/personnel";
import type { PersonnelRow } from "@/types/personnel";

export async function getClientAuthenticatedPersonnel(): Promise<AuthenticatedPersonnel | null> {
  const supabase = createClient();
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

export async function getClientAuthenticatedPersonnelForLogin(input: {
  badgeNumber: string;
  email: string;
}): Promise<AuthenticatedPersonnel | null> {
  const supabase = createClient();
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

export async function signOutClientSession() {
  const supabase = createClient();
  await supabase.auth.signOut();
}
