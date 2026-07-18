/**
 * Sends pending training request notification emails through Resend.
 *
 * Deployment notes:
 * - Keep JWT verification enabled when deploying this Edge Function.
 * - Database webhooks and schedulers must invoke the function with an authorized
 *   request (service role or Supabase-signed webhook), never from browser code.
 * - Do not expose SUPABASE_SERVICE_ROLE_KEY or RESEND_API_KEY to client code.
 * - Resend requests use Idempotency-Key: <notification UUID> so retries for the
 *   same outbox row do not create duplicate provider sends after uncertain results.
 */
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const BATCH_SIZE = 25;
const MAX_ATTEMPTS = 5;
const RETRY_DELAYS_MINUTES = [5, 15, 60, 360] as const;

interface NotificationRow {
  id: string;
  training_request_id: string;
  event_type: string;
  recipient_email: string;
  subject: string;
  message_text: string;
  attempts: number;
}

interface TrainingRequestRow {
  id: string;
  request_number: string;
  requester_name: string;
  training_title: string;
  status: string;
  current_action_role: string | null;
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getNextAttemptAt(attempts: number): string | null {
  if (attempts >= MAX_ATTEMPTS) {
    return null;
  }

  const delayMinutes =
    RETRY_DELAYS_MINUTES[Math.min(attempts, RETRY_DELAYS_MINUTES.length) - 1] ??
    RETRY_DELAYS_MINUTES[RETRY_DELAYS_MINUTES.length - 1];

  return new Date(Date.now() + delayMinutes * 60 * 1000).toISOString();
}

function buildRequestLink(
  appBaseUrl: string,
  notification: NotificationRow,
): string {
  const base = appBaseUrl.replace(/\/$/, "");

  if (
    notification.event_type === "pending_mto" ||
    notification.event_type === "pending_deputy_chief"
  ) {
    return `${base}/approvals/${notification.training_request_id}`;
  }

  return `${base}/requests/${notification.training_request_id}/confirmation`;
}

function buildEmailHtml(input: {
  request: TrainingRequestRow;
  notification: NotificationRow;
  requestLink: string;
}) {
  const actionRequired =
    input.notification.event_type === "pending_mto"
      ? "Review and sign as MTO"
      : input.notification.event_type === "pending_deputy_chief"
        ? "Review and sign as Deputy Chief"
        : input.notification.event_type === "returned_for_correction"
          ? "Edit and resubmit your request"
          : "View request details";

  const subject = escapeHtml(input.notification.subject);
  const messageHtml = escapeHtml(input.notification.message_text).replaceAll(
    "\n",
    "<br />",
  );
  const requestNumber = escapeHtml(input.request.request_number);
  const requesterName = escapeHtml(input.request.requester_name);
  const trainingTitle = escapeHtml(input.request.training_title);
  const status = escapeHtml(input.request.status);
  const actionRequiredHtml = escapeHtml(actionRequired);
  const requestLink = escapeHtml(input.requestLink);

  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #18181b;">
      <h2 style="margin-bottom: 16px;">${subject}</h2>
      <p>${messageHtml}</p>
      <table style="margin: 24px 0; border-collapse: collapse;">
        <tr><td style="padding: 4px 12px 4px 0;"><strong>Request number</strong></td><td>${requestNumber}</td></tr>
        <tr><td style="padding: 4px 12px 4px 0;"><strong>Requester</strong></td><td>${requesterName}</td></tr>
        <tr><td style="padding: 4px 12px 4px 0;"><strong>Training</strong></td><td>${trainingTitle}</td></tr>
        <tr><td style="padding: 4px 12px 4px 0;"><strong>Status</strong></td><td>${status}</td></tr>
        <tr><td style="padding: 4px 12px 4px 0;"><strong>Action required</strong></td><td>${actionRequiredHtml}</td></tr>
      </table>
      <p><a href="${requestLink}">Open this request securely</a></p>
    </div>
  `;
}

async function sendWithResend(input: {
  apiKey: string;
  fromEmail: string;
  idempotencyKey: string;
  to: string;
  subject: string;
  text: string;
  html: string;
}) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": input.idempotencyKey,
    },
    body: JSON.stringify({
      from: input.fromEmail,
      to: [input.to],
      subject: input.subject,
      text: input.text,
      html: input.html,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(errorBody || `Resend request failed with ${response.status}`);
  }
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const resendFromEmail = Deno.env.get("RESEND_FROM_EMAIL");
  const appBaseUrl = Deno.env.get("APP_BASE_URL");

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "Supabase service configuration is missing." }, 500);
  }

  if (!resendApiKey) {
    return jsonResponse({ error: "RESEND_API_KEY is not configured." }, 500);
  }

  if (!resendFromEmail) {
    return jsonResponse({ error: "RESEND_FROM_EMAIL is not configured." }, 500);
  }

  if (!appBaseUrl) {
    return jsonResponse({ error: "APP_BASE_URL is not configured." }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data: claimedRows, error: claimError } = await supabase.rpc(
    "claim_pending_training_request_notifications",
    { batch_size: BATCH_SIZE },
  );

  if (claimError) {
    return jsonResponse({ error: claimError.message }, 500);
  }

  const notifications = (claimedRows ?? []) as NotificationRow[];
  let sentCount = 0;
  let failedCount = 0;

  for (const notification of notifications) {
    try {
      const { data: requestRow, error: requestError } = await supabase
        .from("training_requests")
        .select("id, request_number, requester_name, training_title, status, current_action_role")
        .eq("id", notification.training_request_id)
        .maybeSingle();

      if (requestError || !requestRow) {
        throw new Error(requestError?.message ?? "Training request not found.");
      }

      const requestLink = buildRequestLink(appBaseUrl, notification);
      const textBody = `${notification.message_text}\n\nRequest number: ${requestRow.request_number}\nRequester: ${requestRow.requester_name}\nTraining: ${requestRow.training_title}\nCurrent status: ${requestRow.status}\nOpen securely: ${requestLink}`;
      const htmlBody = buildEmailHtml({
        request: requestRow as TrainingRequestRow,
        notification,
        requestLink,
      });

      await sendWithResend({
        apiKey: resendApiKey,
        fromEmail: resendFromEmail,
        idempotencyKey: notification.id,
        to: notification.recipient_email,
        subject: notification.subject,
        text: textBody,
        html: htmlBody,
      });

      const { error: markSentError } = await supabase
        .from("training_request_notifications")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          last_error: null,
          processing_started_at: null,
          next_attempt_at: new Date().toISOString(),
        })
        .eq("id", notification.id)
        .eq("status", "processing");

      if (markSentError) {
        throw new Error(markSentError.message);
      }

      sentCount += 1;
    } catch (error) {
      failedCount += 1;
      const message =
        error instanceof Error ? error.message : "Unknown notification send error.";
      const nextAttemptAt = getNextAttemptAt(notification.attempts);

      await supabase
        .from("training_request_notifications")
        .update({
          status: "failed",
          last_error: message.slice(0, 1000),
          processing_started_at: null,
          next_attempt_at: nextAttemptAt ?? new Date().toISOString(),
        })
        .eq("id", notification.id)
        .eq("status", "processing");
    }
  }

  return jsonResponse({
    processed: notifications.length,
    sent: sentCount,
    failed: failedCount,
  });
});
