import { createNotificationHandler } from "./handler.ts";

// Keep gateway JWT verification enabled. The handler also requires the service
// credential; an ordinary signed-in user's token must never dispatch the queue.
Deno.serve(createNotificationHandler({
  supabaseUrl: Deno.env.get("SUPABASE_URL"),
  serviceRoleKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
  resendApiKey: Deno.env.get("RESEND_API_KEY"),
  fromEmail: Deno.env.get("RESEND_FROM_EMAIL"),
  appBaseUrl: Deno.env.get("APP_BASE_URL"),
  enabled: Deno.env.get("NOTIFICATIONS_ENABLED"),
  startAt: Deno.env.get("NOTIFICATIONS_START_AT"),
}));
