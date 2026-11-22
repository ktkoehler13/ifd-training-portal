import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { canEditReviewExpenses } from "./mto-expense-review";
import { formatAuditAction, getAuditCommentLabel } from "./pdf/build-audit-trail";
import {
  isDecisionChangeKind,
  isSignatureRequiredWorkflowKind,
  mapWorkflowKindToExpectedAction,
} from "./training-request-signature-snapshot";
import { canChangeDecision, isBeforeCourseStart } from "./training-request-workflow";
import { validateSignatureWorkflowActionInput } from "./training-request-workflow-policy";
import { handleSignatureWorkflowCompletionFailure } from "./training-request-workflow-reconciliation";
import type { TrainingRequestActionRecord } from "@/types/training-request-action";
import type { TrainingRequestRecord } from "@/types/training-request";

// 2026-11-22 15:00 UTC is 10:00 on Nov 22 in Ithaca.
const NOW = new Date("2026-11-22T15:00:00Z");

function action(overrides: Partial<TrainingRequestActionRecord>): TrainingRequestActionRecord {
  return {
    id: "a", trainingRequestId: "r", actorPersonnelId: "p", actorName: "Test", actorBadgeNumber: "1",
    actorRole: "mto", action: "mto_approved", comments: "Because", signatureName: null, signedAt: null,
    electronicSignatureConfirmed: true, signatureStorageBucket: null, signatureStoragePath: null,
    signatureSha256: null, signatureMimeType: null, signatureFileSizeBytes: null,
    createdAt: "2026-11-22T15:00:00Z", ...overrides,
  } as TrainingRequestActionRecord;
}

describe("decision change permissions (D27)", () => {
  it("allows MTO and Deputy Chief to change a final decision before the start date only", () => {
    const request = { status: "approved" as const, courseStartDate: "2026-11-23", deletedAt: null };
    for (const role of ["mto", "deputy_chief"]) assert.equal(canChangeDecision(role, request, NOW), true);
    for (const role of ["admin", "office", "firefighter"]) assert.equal(canChangeDecision(role, request, NOW), false);
    assert.equal(canChangeDecision("mto", { ...request, status: "denied" }, NOW), true);
    for (const status of ["pending_mto", "pending_deputy_chief", "returned_for_correction", "draft"] as const) {
      assert.equal(canChangeDecision("mto", { ...request, status }, NOW), false);
    }
    assert.equal(canChangeDecision("mto", { ...request, courseStartDate: "2026-11-22" }, NOW), false, "start day is locked");
    assert.equal(canChangeDecision("mto", { ...request, deletedAt: "2026-11-01" }, NOW), false);
  });

  it("uses the Ithaca calendar date", () => {
    // 03:00 UTC on Nov 23 is still Nov 22 in Ithaca.
    assert.equal(isBeforeCourseStart("2026-11-23", new Date("2026-11-23T03:00:00Z")), true);
    assert.equal(isBeforeCourseStart("2026-11-23", new Date("2026-11-23T06:00:00Z")), false);
    assert.equal(isBeforeCourseStart("", NOW), false);
  });

  it("lets the Deputy Chief edit expenses during DC review, and MTO during MTO review", () => {
    assert.equal(canEditReviewExpenses("deputy_chief", { status: "pending_deputy_chief", currentActionRole: "deputy_chief" }), true);
    assert.equal(canEditReviewExpenses("mto", { status: "pending_mto", currentActionRole: "mto" }), true);
    assert.equal(canEditReviewExpenses("mto", { status: "pending_deputy_chief", currentActionRole: "deputy_chief" }), false);
    assert.equal(canEditReviewExpenses("deputy_chief", { status: "approved", currentActionRole: null }), false);
  });
});

describe("decision change signing", () => {
  it("treats decision changes as signed actions that need a reason", () => {
    for (const kind of ["change_to_denied", "change_to_approved", "resign_expenses"]) {
      assert.equal(isDecisionChangeKind(kind), true);
      assert.equal(isSignatureRequiredWorkflowKind(kind), true);
      assert.equal(mapWorkflowKindToExpectedAction(kind), null, "the database derives the MTO/DC action");
      assert.throws(() => validateSignatureWorkflowActionInput({ action: kind as "change_to_denied", comments: " ", electronicSignatureConfirmed: true }), /reason/);
      assert.doesNotThrow(() => validateSignatureWorkflowActionInput({ action: kind as "change_to_denied", comments: "Budget", electronicSignatureConfirmed: true }));
    }
    assert.equal(isDecisionChangeKind("mto_approve"), false);
  });

  it("regenerates approved forms after any committed action that leaves the request approved", async () => {
    let generated = 0;
    const request = { id: "r", status: "approved" } as TrainingRequestRecord;
    await handleSignatureWorkflowCompletionFailure({
      requestId: "r", reservationId: "x", snapshotPath: "r/x/signature.png", action: "resign_expenses",
      originalError: new Error("Timed out"),
      findMatchingAction: async () => ({ id: "x" }),
      findReservation: async () => ({ consumed_at: "2026-11-22T15:00:00Z" }),
      loadRequest: async () => request,
      deleteSnapshot: async () => undefined,
      generateApprovedPacket: async () => { generated += 1; },
      createAmbiguousError: (message) => new Error(message),
    });
    assert.equal(generated, 1);
  });

  it("routes decision changes through the dedicated reservation and the signature route", () => {
    const server = readFileSync("lib/training-request-workflow-server.ts", "utf8");
    const route = readFileSync("app/api/training-requests/[id]/workflow/route.ts", "utf8");
    assert.match(server, /reserve_training_request_decision_change/);
    assert.match(server, /if \(updatedRequest\.status === "approved"\)/);
    for (const kind of ["change_to_denied", "change_to_approved", "resign_expenses"]) assert.match(route, new RegExp(kind));
  });
});

describe("decision change history wording", () => {
  it("describes changed decisions and re-signed expenses in the audit trail", () => {
    assert.equal(formatAuditAction(action({ action: "deputy_chief_denied", decisionChange: true })), "Changed decision to Denied");
    assert.equal(formatAuditAction(action({ action: "mto_approved", decisionChange: true })), "Changed decision to Approved");
    assert.equal(formatAuditAction(action({ expenseChanges: { before: {}, after: {} } })), "Re-signed approval with updated expenses");
    assert.equal(formatAuditAction(action({ action: "deputy_chief_expenses_updated", actorRole: "deputy_chief" })), "Updated estimated expenses");
    assert.equal(formatAuditAction(action({})), "Approved request");
    assert.equal(getAuditCommentLabel(action({ decisionChange: true })), "Reason");
    assert.equal(getAuditCommentLabel(action({})), "Comment");
  });
});
