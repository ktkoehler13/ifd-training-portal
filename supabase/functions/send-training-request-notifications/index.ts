import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const BATCH_SIZE = 25;
const FROM_EMAIL = Deno.env.get("RESEND_FROM_EMAIL") ?? "IFD Training Portal <notifications@example.com>";

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

function buildRequestLink(
  appBaseUrl: string,
  notification: NotificationRow,
  requestNumber: string,
): string {
  const base = appBaseUrl.replace(/\/$/, "");

  if (
    notification.event_type === "pending_mto" ||
    notification.event_type === "pending_deputy_chief"
  ) {
    return `${base}/approvals/${notification.training_request_id}`;
  }

  return `${base}/requests/${encodeURIComponent(requestNumber)}/confirmation`;
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

  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #18181b;">
      <h2 style="margin-bottom: 16px;">${input.notification.subject}</h2>
      <p>${input.notification.message_text.replace(/\n/g, "<br />")}</p>
      <table style="margin: 24px 0; border-collapse: collapse;">
        <tr><td style="padding: 4px 12px 4px 0;"><strong>Request number</strong></td><td>${input.request.request_number}</td></tr>
        <tr><td style="padding: 4px 12px 4px 0;"><strong>Requester</strong></td><td>${input.request.requester_name}</td></tr>
        <tr><td style="padding: 4px 12px 4px 0;"><strong>Training</strong></td><td>${input.request.training_title}</td></tr>
        <tr><td style="padding: 4px 12px 4px 0;"><strong>Status</strong></td><td>${input.request.status}</td></tr>
        <tr><td style="padding: 4px 12px 4px 0;"><strong>Action required</strong></td><td>${actionRequired}</td></tr>
      </table>
      <p><a href="${input.requestLink}">Open this request securely</a></p>
    </div>
  `;
}

async function sendWithResend(input: {
  apiKey: string;
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
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
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
  const appBaseUrl = Deno.env.get("APP_BASE_URL");

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "Supabase service configuration is missing." }, 500);
  }

  if (!resendApiKey) {
    return jsonResponse({ error: "RESEND_API_KEY is not configured." }, 500);
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

      const requestLink = buildRequestLink(
        appBaseUrl,
        notification,
        requestRow.request_number,
      );
      const textBody = `${notification.message_text}\n\nRequest number: ${requestRow.request_number}\nRequester: ${requestRow.requester_name}\nTraining: ${requestRow.training_title}\nCurrent status: ${requestRow.status}\nOpen securely: ${requestLink}`;
      const htmlBody = buildEmailHtml({
        request: requestRow as TrainingRequestRow,
        notification,
        requestLink,
      });

      await sendWithResend({
        apiKey: resendApiKey,
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

      await supabase
        .from("training_request_notifications")
        .update({
          status: "failed",
          last_error: message.slice(0, 1000),
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
