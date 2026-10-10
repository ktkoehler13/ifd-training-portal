export interface EmailRequest {
  id: string;
  request_number: string;
  requester_name: string;
  requester_personnel_id: string;
  training_title: string;
  status: string;
  current_action_role: string | null;
}

export interface EmailNotification {
  id: string;
  training_request_id: string;
  source_action_id: string;
  recipient_personnel_id: string | null;
  recipient_email: string;
  event_type: string;
  created_at: string;
  attempts: number;
}

const events: Record<string, { heading: string; action: string; button: string }> = {
  pending_mto: { heading: "MTO review required", action: "Review this training request and record your decision.", button: "Review request" },
  pending_deputy_chief: { heading: "Deputy Chief review required", action: "Review this training request and record your decision.", button: "Review request" },
  returned_for_correction: { heading: "Training request needs corrections", action: "Read the reviewer’s comments, edit your request, and resubmit it.", button: "Review corrections" },
  approved: { heading: "Training request approved", action: "Your training request is approved. Open the portal to view the details and approved forms.", button: "View approved request" },
  denied: { heading: "Training request denied", action: "Open the portal to review the decision and reviewer’s comments.", button: "View decision" },
};

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

export function buildNotificationEmail(
  request: EmailRequest,
  notification: EmailNotification,
  appBaseUrl: string,
  comments: string | null,
) {
  const copy = events[notification.event_type];
  if (!copy) throw new Error("Unsupported notification event");
  const base = new URL(appBaseUrl);
  if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash || !/^\/?$/.test(base.pathname)) {
    throw new Error("APP_BASE_URL must be an HTTPS origin");
  }
  const id = encodeURIComponent(request.id);
  const path = notification.event_type.startsWith("pending_")
    ? `/approvals/${id}`
    : `/requests/${id}/confirmation`;
  const link = new URL(path, base).href;
  const reviewComments = ["returned_for_correction", "denied"].includes(notification.event_type)
    ? comments?.trim() : null;
  const subject = `${copy.heading}: ${request.request_number}`.replace(/[\r\n]+/g, " ");
  const text = [
    "ITHACA FIRE DEPARTMENT — TRAINING PORTAL", copy.heading, copy.action,
    `Request: ${request.request_number}`, `Requester: ${request.requester_name}`,
    `Course: ${request.training_title}`,
    ...(reviewComments ? [`Reviewer comments: ${reviewComments}`] : []),
    `${copy.button}: ${link}`, "Sign in to the portal to view or act on this request.",
    "This is an automated notification. Please use the portal for request actions.",
  ].join("\n\n");
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;background:#f4f4f5;font-family:Arial,sans-serif;color:#18181b">
<table role="presentation" style="width:100%;padding:24px 12px"><tr><td align="center">
<table role="presentation" style="width:100%;max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden">
<tr><td style="background:#991b1b;color:#ffffff;padding:24px;font-size:13px;font-weight:bold;letter-spacing:1px">ITHACA FIRE DEPARTMENT<br><span style="font-weight:normal;letter-spacing:0">Training Portal</span></td></tr>
<tr><td style="padding:28px;line-height:1.6;overflow-wrap:anywhere;word-break:break-word">
<h1 style="font-size:24px;line-height:1.3;margin:0 0 16px">${escapeHtml(copy.heading)}</h1>
<p>${escapeHtml(copy.action)}</p>
<p><strong>Request:</strong> ${escapeHtml(request.request_number)}<br>
<strong>Requester:</strong> ${escapeHtml(request.requester_name)}<br>
<strong>Course:</strong> ${escapeHtml(request.training_title)}</p>
${reviewComments ? `<div style="background:#f4f4f5;padding:16px;border-left:3px solid #991b1b"><strong>Reviewer comments</strong><br>${escapeHtml(reviewComments).replaceAll("\n", "<br>")}</div>` : ""}
<p style="margin:28px 0"><a href="${escapeHtml(link)}" style="display:inline-block;background:#991b1b;color:#ffffff;padding:12px 22px;text-decoration:none;border-radius:6px;font-weight:bold">${escapeHtml(copy.button)}</a></p>
<p style="font-size:13px;color:#52525b">Sign in to the portal to view or act on this request.</p>
<p style="font-size:12px;color:#71717a">This is an automated notification. Please use the portal for request actions.</p>
</td></tr></table></td></tr></table></body></html>`;
  return { subject, text, html, link };
}

export function getRetryTime(attempts: number, now: number): string | null {
  if (attempts >= 5) return null;
  const minutes = [5, 15, 60, 360][Math.max(0, attempts - 1)] ?? 360;
  return new Date(now + minutes * 60_000).toISOString();
}
