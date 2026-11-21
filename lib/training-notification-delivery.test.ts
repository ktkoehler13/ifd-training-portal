import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import { existsSync } from "node:fs";
import { buildNotificationEmail, getRetryTime, type EmailNotification, type EmailRequest } from "../supabase/functions/send-training-request-notifications/email";
import { createNotificationHandler, type DeliveryConfig } from "../supabase/functions/send-training-request-notifications/handler";

const id = "12345678-1234-1234-1234-123456789abc";
const request: EmailRequest = { id, request_number: "Owner, R, Training, 2026.1", requester_name: "Request Owner", requester_personnel_id: "owner", training_title: "Officer training", status: "pending_mto", current_action_role: "mto" };
const notification: EmailNotification = { id: "alert", training_request_id: id, source_action_id: "action", recipient_personnel_id: "mto", recipient_email: "mto@example.test", event_type: "pending_mto", attempts: 1, created_at: "2026-10-08T15:00:00Z" };
const config: DeliveryConfig = { supabaseUrl: "https://database.test", serviceRoleKey: "test-service-key", resendApiKey: "test-email-key", fromEmail: "Training <notifications@example.test>", appBaseUrl: "https://portal.test", enabled: "true", startAt: "2026-10-08T14:00:00Z" };
const packetBytes = new TextEncoder().encode("%PDF-1.7 approved forms fixture");
const packet = { request_id: id, storage_bucket: "training-request-packets", storage_path: `${id}/approved-packet.pdf`, filename: "approved-forms.pdf", sha256: createHash("sha256").update(packetBytes).digest("hex"), file_size_bytes: packetBytes.length, status: "ready" };
const now = Date.parse("2026-10-08T15:00:00Z");
function harness(options: { config?: Partial<DeliveryConfig>; notification?: Partial<EmailNotification>; request?: Partial<EmailRequest>; recipient?: object; action?: object; providerStatus?: number; patchFailure?: boolean; claimFailure?: boolean; primaryDeputy?: string; missingDeputySetting?: boolean; packet?: object; corruptPacket?: boolean; downloadStatus?: number; requestAfterDownload?: Partial<EmailRequest>; settings?: Record<string, string>; cityStatus?: string; compensation?: { status: string; latestEvent: string } } = {}) {
  let downloaded = false;
  const calls: { url: string; init?: RequestInit }[] = [];
  const patches: Record<string, unknown>[] = [];
  const sent: Record<string, unknown>[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input); calls.push({ url, init });
    if (url.endsWith("/rpc/training_notification_dispatch_authorized")) {
      const authorized = new Headers(init?.headers).get("authorization") === "Bearer test-service-key";
      return Response.json(authorized, { status: authorized ? 200 : 401 });
    }
    if (url.includes("/rpc/")) return Response.json([{ ...notification, ...options.notification }], { status: options.claimFailure ? 500 : 200 });
    if (init?.method === "PATCH") { patches.push(JSON.parse(String(init.body))); return new Response(null, { status: options.patchFailure ? 500 : 204 }); }
    if (url.startsWith("https://api.resend.com/")) { sent.push(JSON.parse(String(init?.body))); return Response.json({ id: "email" }, { status: options.providerStatus ?? 200 }); }
    if (url.includes("/training_requests?")) return Response.json([{ ...request, ...options.request, ...(downloaded ? options.requestAfterDownload : {}) }]);
    if (url.includes("/training_request_packets?")) return Response.json([{ ...packet, ...options.packet }]);
    if (url.includes("/storage/v1/object/authenticated/")) { downloaded = true; return new Response(options.corruptPacket ? new TextEncoder().encode("%PDF-wrong") : packetBytes, { status: options.downloadStatus ?? 200 }); }
    if (url.includes("/system_settings?")) {
      const key = /key=eq\.([a-z_]+)/.exec(url)?.[1] ?? "";
      if (options.settings) return Response.json(key in options.settings ? [{ value: options.settings[key] }] : []);
      return Response.json(options.missingDeputySetting ? [] : [{ value: options.primaryDeputy ?? "" }]);
    }
    if (url.includes("/training_request_city_authorizations?")) return Response.json(options.cityStatus ? [{ status: options.cityStatus }] : []);
    if (url.includes("/training_compensation_packets?")) return Response.json(options.compensation ? [{ id: "packet", status: options.compensation.status }] : []);
    if (url.includes("/training_compensation_events?")) return Response.json(options.compensation ? [{ id: options.compensation.latestEvent }] : []);
    if (url.includes("/training_request_actions?")) return Response.json([{ id: "action", comments: "Correct the course dates", ...options.action }]);
    if (url.includes("/personnel?")) return Response.json([{ id: "mto", email: "mto@example.test", role: "mto", active: true, ...options.recipient }]);
    throw new Error(`Unexpected request: ${url}`);
  };
  const handler = createNotificationHandler({ ...config, ...options.config }, fetcher, () => now);
  return { calls, patches, sent, run: (authorization: string | null = "Bearer test-service-key", method = "POST") => handler(new Request("https://function.test", { method, headers: authorization ? { authorization } : undefined })) };
}

describe("training notification email content", () => {
  for (const event of ["pending_mto", "pending_deputy_chief", "returned_for_correction", "approved", "denied"]) {
    it(`${event} includes request details and links to an existing protected route`, () => {
      const email = buildNotificationEmail(request, { ...notification, event_type: event }, "https://portal.test", "Correct the dates");
      const reviewer = event.startsWith("pending_");
      assert.equal(email.link, `https://portal.test/${reviewer ? `approvals/${id}` : `requests/${id}/confirmation`}`);
      assert.ok(existsSync(reviewer ? "app/approvals/[id]/page.tsx" : "app/requests/[id]/confirmation/page.tsx"));
      for (const value of [request.request_number, request.requester_name, request.training_title]) assert.ok(email.text.includes(value));
      assert.match(email.html, /Sign in/);
      assert.equal(email.text.includes("Correct the dates"), ["returned_for_correction", "denied"].includes(event));
      for (const content of [email.text, email.html]) {
        assert.equal(content.includes("Your responsibilities"), event === "approved");
        assert.equal(content.includes("Meal reimbursement"), event === "approved");
        assert.equal(content.includes("tips up to 18%"), event === "approved");
      }
    });
  }
  it("escapes names, courses and reviewer comments in HTML", () => {
    const email = buildNotificationEmail({ ...request, training_title: '<script>alert("x")</script>', requester_name: "A & B" }, { ...notification, event_type: "denied" }, "https://portal.test", "<img src=x>\nSecond line");
    assert.doesNotMatch(email.html, /<script>|<img src=x>/);
    assert.match(email.html, /A &amp; B/);
    assert.match(email.html, /&lt;img src=x&gt;<br>Second line/);
  });
  it("rejects misconfigured or unsafe portal origins", () => {
    for (const origin of ["http://portal.test", "https://user:secret@portal.test", "https://portal.test/path", "https://portal.test?x=1", "not a url"]) assert.throws(() => buildNotificationEmail(request, notification, origin, null));
  });
});

describe("notification dispatcher", () => {
  it("verifies the caller’s own service credential before touching the queue or provider", async () => {
    for (const authorization of [null, "Bearer anon-token", "Bearer user-token", "Bearer test-service-key-wrong"]) {
      const h = harness(); assert.equal((await h.run(authorization)).status, 401); assert.ok(h.calls.every(c => c.url.endsWith("/rpc/training_notification_dispatch_authorized")));
    }
  });
  it("does not run on GET", async () => { const h=harness(); assert.equal((await h.run(null,"GET")).status,405); assert.ok(h.calls.every(c => c.url.endsWith("/rpc/training_notification_dispatch_authorized"))); });
  it("stays off until explicitly activated", async () => {
    for (const enabled of [undefined, "false", "TRUE"]) { const h=harness({config:{enabled}}); assert.deepEqual(await (await h.run()).json(),{enabled:false,processed:0}); assert.ok(h.calls.every(c => c.url.endsWith("/rpc/training_notification_dispatch_authorized"))); }
  });
  for (const field of ["resendApiKey", "fromEmail", "appBaseUrl", "startAt"] as const) it(`does not claim emails without ${field}`, async () => {
    const h=harness({config:{[field]:undefined}}); assert.equal((await h.run()).status,503); assert.ok(h.calls.every(c => c.url.endsWith("/rpc/training_notification_dispatch_authorized")));
  });
  it("does not claim emails with an invalid activation date", async () => { const h=harness({config:{startAt:"invalid"}}); assert.equal((await h.run()).status,503); assert.ok(h.calls.every(c => c.url.endsWith("/rpc/training_notification_dispatch_authorized"))); });
  it("sends one current alert and records provider acceptance", async () => {
    const h=harness(); assert.equal((await h.run()).status,200); assert.equal(h.sent.length,1); assert.equal(h.patches[0].status,"sent");
    assert.deepEqual(h.sent[0].to,["mto@example.test"]);
    assert.equal(new Headers(h.calls.find(c=>c.url.includes("api.resend"))?.init?.headers).get("Idempotency-Key"),"alert");
    assert.ok(h.calls.filter(c=>!c.url.includes("api.resend")).every(c=>new Headers(c.init?.headers).get("Authorization")==="Bearer test-service-key"));
  });
  for (const [label,options] of [
    ["historical backlog",{notification:{created_at:"2026-07-18T12:00:00Z"}}],
    ["expired retries",{config:{startAt:"2026-10-01T00:00:00Z"},notification:{attempts:2,created_at:"2026-10-07T12:00:00Z"}}],
    ["completed review",{request:{status:"approved"}}],
    ["earlier review cycle",{action:{id:"new-action"}}],
    ["inactive recipient",{recipient:{active:false}}],
    ["changed recipient email",{recipient:{email:"new@example.test"}}],
    ["changed reviewer role",{recipient:{role:"firefighter"}}],
    ["wrong current reviewer",{request:{current_action_role:"deputy_chief"}}],
  ] as const) it(`skips ${label}`, async () => { const h=harness(options); await h.run(); assert.equal(h.sent.length,0); assert.equal(h.patches[0].status,"skipped"); });
  it("sends a final decision only to the active requester", async () => {
    const options={notification:{event_type:"approved",recipient_personnel_id:"owner",recipient_email:"owner@example.test"},request:{status:"approved",current_action_role:null},recipient:{id:"owner",email:"owner@example.test",role:"firefighter"}};
    const h=harness(options); await h.run(); assert.equal(h.sent.length,1);
    const wrong=harness({...options,recipient:{...options.recipient,id:"other"}}); await wrong.run(); assert.equal(wrong.sent.length,0);
  });
  it("rechecks the selected Deputy Chief immediately before sending queued mail", async () => {
    const options = { notification: { event_type: "pending_deputy_chief" },
      request: { status: "pending_deputy_chief", current_action_role: "deputy_chief" },
      recipient: { role: "deputy_chief" } };
    const selected = harness({ ...options, primaryDeputy: "mto" });
    await selected.run(); assert.equal(selected.sent.length, 1);
    const backup = harness({ ...options, primaryDeputy: "other-dc" });
    await backup.run(); assert.equal(backup.sent.length, 0);
    assert.equal(backup.patches[0].status, "skipped");
    const unavailable = harness({ ...options, missingDeputySetting: true });
    await unavailable.run(); assert.equal(unavailable.sent.length, 0);
    assert.equal(unavailable.patches[0].status, "failed");
  });
  it("retries a temporary provider failure without marking sent", async () => {
    const h=harness({providerStatus:429}); await h.run(); assert.equal(h.patches[0].status,"failed"); assert.equal(h.patches[0].next_attempt_at,"2026-10-08T15:05:00.000Z");
  });
  it("reports a claim failure without attempting delivery", async () => {const h=harness({claimFailure:true});assert.equal((await h.run()).status,503);assert.equal(h.sent.length,0);});
  it("reports database acknowledgement failures for monitoring", async () => {const h=harness({patchFailure:true});const response=await h.run();assert.equal(response.status,503);assert.equal((await response.json()).stateErrors,1);});
  it("bounds retries below the provider's 24-hour idempotency window", () => {
    assert.equal(getRetryTime(1,now),"2026-10-08T15:05:00.000Z"); assert.equal(getRetryTime(4,now),"2026-10-08T21:00:00.000Z"); assert.equal(getRetryTime(5,now),null);
  });
});

describe("approved-form email attachments", () => {
  const options = { notification: { event_type: "approved", recipient_personnel_id: "owner", recipient_email: "owner@example.test" }, request: { status: "approved", current_action_role: null }, recipient: { id: "owner", email: "owner@example.test", role: "firefighter" } };
  it("attaches the integrity-checked approved PDF after final approval", async () => {
    const h = harness(options); await h.run();
    for (const content of [String(h.sent[0].text), String(h.sent[0].html)]) {
      for (const instruction of ["Register directly", "required time off", "class contact hours", "itemized meal receipts", "tips up to 18%", "travel dates, destinations, and miles driven"]) assert.ok(content.includes(instruction));
    }
    assert.deepEqual(h.sent[0].attachments, [{ filename: "approved-forms.pdf", content: Buffer.from(packetBytes).toString("base64"), content_type: "application/pdf" }]);
    assert.equal(h.patches[0].status, "sent");
  });
  it("never downloads or attaches forms for a denial", async () => {
    const h = harness({ ...options, notification: { ...options.notification, event_type: "denied" }, request: { status: "denied", current_action_role: null } });
    await h.run(); assert.equal(h.sent.length, 1); assert.equal(h.sent[0].attachments, undefined);
    assert.equal(h.calls.some(c => c.url.includes("training_request_packets") || c.url.includes("/storage/")), false);
    assert.doesNotMatch(String(h.sent[0].text), /forms are attached/);
  });
  for (const status of ["pending", "processing", "failed"]) it(`retries instead of sending without ${status} forms`, async () => {
    const h = harness({ ...options, packet: { status } }); await h.run();
    assert.equal(h.sent.length, 0); assert.equal(h.patches[0].status, "failed");
  });
  for (const extra of [{ corruptPacket: true }, { downloadStatus: 500 }, { packet: { sha256: "0".repeat(64) } }, { packet: { storage_path: "someone-else/approved-packet.pdf" } }, { packet: { file_size_bytes: 16 * 1024 * 1024 } }]) it(`blocks invalid or unavailable attachments ${JSON.stringify(extra)}`, async () => {
    const h = harness({ ...options, ...extra }); await h.run(); assert.equal(h.sent.length, 0); assert.equal(h.patches[0].status, "failed");
  });
  it("rechecks approval after downloading the forms", async () => {
    const h = harness({ ...options, requestAfterDownload: { status: "denied" } }); await h.run();
    assert.equal(h.sent.length, 0); assert.equal(h.patches[0].status, "skipped");
  });
  it("sends to the request-specific contact email without changing the account email", async () => {
    const h = harness({ ...options, notification: { ...options.notification, recipient_email: "alternate@example.test" }, request: { ...options.request, request_contact_email: "alternate@example.test" } });
    await h.run(); assert.deepEqual(h.sent[0].to, ["alternate@example.test"]);
    const wrong = harness({ ...options, request: { ...options.request, request_contact_email: "alternate@example.test" } });
    await wrong.run(); assert.equal(wrong.sent.length, 0);
  });
  it("keeps reviewer alerts on the reviewer's account email", async () => {
    const h = harness({ request: { request_contact_email: "alternate@example.test" } }); await h.run(); assert.deepEqual(h.sent[0].to, ["mto@example.test"]);
  });
});

describe("Office and primary MTO routing in the worker", () => {
  const office = { id: "office", email: "office@example.test", role: "office", active: true };
  const approved = { status: "approved", current_action_role: null };
  const cityAlert = { event_type: "office_city_authorization", recipient_personnel_id: "office", recipient_email: "office@example.test" };
  const compAlert = { event_type: "office_compensation", source_action_id: null, source_compensation_event_id: "event-2", recipient_personnel_id: "office", recipient_email: "office@example.test" };
  it("links Office emails to the request and the compensation packet", () => {
    assert.equal(buildNotificationEmail(request, { ...notification, ...cityAlert }, "https://portal.test", null).link, `https://portal.test/requests/${id}/confirmation`);
    const comp = buildNotificationEmail(request, { ...notification, ...compAlert }, "https://portal.test", null);
    assert.equal(comp.link, `https://portal.test/compensation/${id}`);
    assert.ok(existsSync("app/compensation/[requestId]/page.tsx"));
    assert.match(comp.subject, /^Compensation packet ready for Office/);
    assert.doesNotMatch(comp.text, /Your responsibilities/);
  });
  it("sends a City Authorization alert while the task is pending", async () => {
    const h = harness({ notification: cityAlert, request: approved, recipient: office, settings: { primary_office: "" }, cityStatus: "pending" });
    await h.run();
    assert.equal(h.sent.length, 1); assert.deepEqual(h.sent[0].to, ["office@example.test"]); assert.equal(h.patches[0].status, "sent");
  });
  it("sends a compensation alert only for the latest MTO-signed handoff", async () => {
    const ok = harness({ notification: compAlert, request: approved, recipient: office, settings: { primary_office: "office" }, compensation: { status: "pending_office", latestEvent: "event-2" } });
    await ok.run(); assert.equal(ok.sent.length, 1);
    const stale = harness({ notification: compAlert, request: approved, recipient: office, settings: { primary_office: "" }, compensation: { status: "pending_office", latestEvent: "event-3" } });
    await stale.run(); assert.equal(stale.sent.length, 0); assert.equal(stale.patches[0].last_error, "Office task is no longer awaiting action");
  });
  for (const [label, options, reason] of [
    ["an uploaded City Authorization", { cityStatus: "uploaded" }, "Office task is no longer awaiting action"],
    ["a deleted request", { cityStatus: "pending", request: { ...approved, deleted_at: "2026-11-21" } }, "Office task is no longer awaiting action"],
    ["a recipient who is no longer Office", { cityStatus: "pending", recipient: { ...office, role: "firefighter" } }, "Recipient is no longer eligible for this alert"],
    ["a different primary Office person", { cityStatus: "pending", settings: { primary_office: "office2" } }, "Office alert recipient changed"],
  ] as const) it(`skips the Office alert for ${label}`, async () => {
    const h = harness({ notification: cityAlert, request: approved, recipient: office, settings: { primary_office: "" }, ...options });
    await h.run();
    assert.equal(h.sent.length, 0); assert.equal(h.patches[0].status, "skipped"); assert.equal(h.patches[0].last_error, reason);
  });
  it("retries instead of guessing when the Office routing setting is missing", async () => {
    const h = harness({ notification: cityAlert, request: approved, recipient: office, settings: {}, cityStatus: "pending" });
    await h.run(); assert.equal(h.sent.length, 0); assert.equal(h.patches[0].status, "failed");
  });
  it("rechecks the primary MTO before sending an MTO review alert", async () => {
    const other = harness({ settings: { primary_approval_mto: "mto2" } });
    await other.run(); assert.equal(other.sent.length, 0); assert.equal(other.patches[0].last_error, "MTO approval recipient changed");
    const chosen = harness({ settings: { primary_approval_mto: "mto" } });
    await chosen.run(); assert.equal(chosen.sent.length, 1);
  });
});
