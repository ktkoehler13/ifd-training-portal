import "server-only";

import { reconcileForcedPasswordSetupIfPending } from "@/lib/auth/forced-password-setup-reconciliation";
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
): Promise<
  | { ok: true; mustChangePassword: boolean }
  | { ok: false; error: string }
> {
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

  await reconcileForcedPasswordSetupIfPending();

  const refreshedPersonnel = await resolveActivePersonnelByBadge(badgeNumber);

  return {
    ok: true,
    mustChangePassword:
      refreshedPersonnel?.mustChangePassword ??
      verifiedPersonnel.mustChangePassword,
  };
}
