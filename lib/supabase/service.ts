import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServiceEnv } from "@/lib/supabase/service-env";

export function createServiceRoleClient() {
  const { url, serviceRoleKey } = getSupabaseServiceEnv();

  return createSupabaseClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
