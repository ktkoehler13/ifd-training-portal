import { buildNotificationEmail, getRetryTime, type EmailNotification, type EmailRequest } from "./email.ts";

export interface DeliveryConfig {
  supabaseUrl?: string;
  serviceRoleKey?: string;
  resendApiKey?: string;
  fromEmail?: string;
  appBaseUrl?: string;
  enabled?: string;
  startAt?: string;
}

type Fetch = typeof fetch;
interface Action { id: string; comments: string | null }
interface Recipient { id: string; email: string; role: string; active: boolean }
const workflowActions = "submitted,resubmitted,mto_approved,mto_returned,mto_denied,deputy_chief_approved,deputy_chief_returned,deputy_chief_denied,cancelled";

export function createNotificationHandler(config: DeliveryConfig, fetcher: Fetch = fetch, now: () => number = Date.now) {
  const json = (body: object, status = 200) => Response.json(body, { status });
  return async (request: Request): Promise<Response> => {
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
    if (!config.serviceRoleKey || !config.supabaseUrl) return json({ error: "Database configuration missing" }, 503);
    // Verify caller credentials with PostgREST using the caller's own key.
    // The capability RPC is executable only by service_role. Never use our
    // privileged key to validate an untrusted caller's role.
    const authorization = request.headers.get("authorization") ?? "";
    const callerKey = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!callerKey) return json({ error: "Unauthorized" }, 401);
    try {
      const permission = await fetcher(`${config.supabaseUrl}/rest/v1/rpc/training_notification_dispatch_authorized`, {
        method: "POST", headers: { apikey: callerKey, Authorization: authorization, "Content-Type": "application/json" },
        body: "{}", signal: AbortSignal.timeout(10_000),
      });
      if (!permission.ok || await permission.json() !== true) return json({ error: "Unauthorized" }, 401);
    } catch { return json({ error: "Unable to verify dispatcher authorization" }, 503); }
    if (config.enabled !== "true") return json({ enabled: false, processed: 0 });
    if (!config.resendApiKey || !config.fromEmail || !config.appBaseUrl || !config.startAt || !Number.isFinite(Date.parse(config.startAt))) {
      return json({ error: "Email sender, portal URL, and activation date must be configured" }, 503);
    }
    try {
      const base = new URL(config.appBaseUrl);
      if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash || !/^\/?$/.test(base.pathname)) throw new Error();
    } catch { return json({ error: "APP_BASE_URL must be an HTTPS origin" }, 503); }
    const headers = { apikey: config.serviceRoleKey, Authorization: `Bearer ${config.serviceRoleKey}`, "Content-Type": "application/json" };
    async function database<T>(path: string, init?: RequestInit): Promise<T> {
      const response = await fetcher(`${config.supabaseUrl}/rest/v1/${path}`, { ...init, headers, signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw new Error(`Database operation failed (${response.status})`);
      return (response.status === 204 ? null : await response.json()) as T;
    }
    const update = (notification: EmailNotification, fields: object) => database(
      `training_request_notifications?id=eq.${notification.id}&status=eq.processing&attempts=eq.${notification.attempts}`,
      { method: "PATCH", body: JSON.stringify(fields) },
    );
    let notifications: EmailNotification[];
    try {
      notifications = await database<EmailNotification[]>("rpc/claim_pending_training_request_notifications", {
        method: "POST", body: JSON.stringify({ batch_size: 10 }),
      });
    } catch { return json({ error: "Unable to claim notification queue" }, 503); }
    let sent = 0, failed = 0, skipped = 0, stateErrors = 0;
    for (const notification of notifications) {
      try {
        let skipReason: string | null = Date.parse(notification.created_at) < Date.parse(config.startAt)
          ? "Created before email alerts were activated"
          : notification.attempts > 1 && now() - Date.parse(notification.created_at) >= 23 * 60 * 60_000
            ? "Retry window expired; manual review required" : null;
        let training: EmailRequest | undefined;
        let action: Action | undefined;
        if (!skipReason) {
          const [requests, actions, recipients] = await Promise.all([
            database<EmailRequest[]>(`training_requests?id=eq.${notification.training_request_id}&select=id,request_number,requester_name,requester_personnel_id,training_title,status,current_action_role`),
            database<Action[]>(`training_request_actions?training_request_id=eq.${notification.training_request_id}&action=in.(${workflowActions})&select=id,comments&order=created_at.desc,id.desc&limit=1`),
            notification.recipient_personnel_id
              ? database<Recipient[]>(`personnel?id=eq.${notification.recipient_personnel_id}&select=id,email,role,active`)
              : Promise.resolve([]),
          ]);
          training = requests[0]; action = actions[0];
          const recipient = recipients[0];
          const role = notification.event_type === "pending_mto" ? "mto"
            : notification.event_type === "pending_deputy_chief" ? "deputy_chief" : null;
          if (!training || training.status !== notification.event_type || action?.id !== notification.source_action_id) {
            skipReason = "Request has moved beyond this workflow action";
          } else if (!recipient?.active || recipient.email.toLowerCase() !== notification.recipient_email.toLowerCase()
            || (role ? recipient.role !== role || training.current_action_role !== role : recipient.id !== training.requester_personnel_id)) {
            skipReason = "Recipient is no longer eligible for this alert";
          }
        }
        if (skipReason) {
          await update(notification, { status: "skipped", last_error: skipReason, processing_started_at: null });
          skipped++; continue;
        }
        const email = buildNotificationEmail(training!, notification, config.appBaseUrl, action?.comments ?? null);
        const response = await fetcher("https://api.resend.com/emails", {
          method: "POST", signal: AbortSignal.timeout(15_000),
          headers: { Authorization: `Bearer ${config.resendApiKey}`, "Content-Type": "application/json", "Idempotency-Key": notification.id },
          body: JSON.stringify({ from: config.fromEmail, to: [notification.recipient_email], subject: email.subject, text: email.text, html: email.html }),
        });
        if (!response.ok) throw new Error(`Email provider rejected delivery (${response.status})`);
        await update(notification, { status: "sent", sent_at: new Date(now()).toISOString(), last_error: null, processing_started_at: null });
        sent++;
      } catch (error) {
        failed++;
        try {
          await update(notification, {
            status: "failed", processing_started_at: null,
            last_error: error instanceof Error ? error.message.slice(0, 300) : "Email delivery failed",
            next_attempt_at: getRetryTime(notification.attempts, now()) ?? new Date(now()).toISOString(),
          });
        } catch { stateErrors++; }
      }
    }
    return json({ processed: notifications.length, sent, failed, skipped, stateErrors }, stateErrors ? 503 : 200);
  };
}
