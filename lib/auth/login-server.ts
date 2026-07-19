import "server-only";

import { INVALID_CREDENTIALS_MESSAGE } from "@/lib/auth/password";
import {
  normalizeBadgeNumberForLookup,
  resolveActivePersonnelByBadge,
} from "@/lib/auth/personnel-lookup-server";
import { normalizePersonnelEmail } from "@/lib/personnel";
import { createClient } from "@/lib/supabase/server";

export interface PasswordLoginInput {
  badgeNumber: string;
  password: string;
}

export async function performPasswordLogin(
  input: PasswordLoginInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const badgeNumber = normalizeBadgeNumberForLookup(input.badgeNumber);
  const password = input.password;

  if (!badgeNumber || !password) {
    return { ok: false, error: INVALID_CREDENTIALS_MESSAGE };
  }

  const personnel = await resolveActivePersonnelByBadge(badgeNumber);
  const supabase = await createClient();

  if (!personnel) {
    return { ok: false, error: INVALID_CREDENTIALS_MESSAGE };
  }

  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: personnel.email,
    password,
  });

  if (signInError) {
    await supabase.auth.signOut();
    return { ok: false, error: INVALID_CREDENTIALS_MESSAGE };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    await supabase.auth.signOut();
    return { ok: false, error: INVALID_CREDENTIALS_MESSAGE };
  }

  const authEmail = normalizePersonnelEmail(user.email);
  const personnelEmail = normalizePersonnelEmail(personnel.email);

  if (authEmail !== personnelEmail) {
    await supabase.auth.signOut();
    return { ok: false, error: INVALID_CREDENTIALS_MESSAGE };
  }

  const verifiedPersonnel = await resolveActivePersonnelByBadge(badgeNumber);

  if (
    !verifiedPersonnel ||
    verifiedPersonnel.id !== personnel.id ||
    verifiedPersonnel.email !== personnel.email
  ) {
    await supabase.auth.signOut();
    return { ok: false, error: INVALID_CREDENTIALS_MESSAGE };
  }

  return { ok: true };
}
