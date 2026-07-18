import { getSupabaseEnv } from "@/lib/supabase/env";

export function getSupabaseServiceRoleKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured on the server.");
  }

  return key;
}

export function getSupabaseServiceEnv() {
  const { url } = getSupabaseEnv();
  return {
    url,
    serviceRoleKey: getSupabaseServiceRoleKey(),
  };
}
