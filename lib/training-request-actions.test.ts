import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  shouldShowCorrectionAlert,
  shouldShowWizardCorrectionAlert,
} from "@/components/requests/CorrectionRequiredAlert";
import {
  getCorrectionCommentsDisplay,
  getCorrectionReturnedAt,
  getLatestCorrectionAction,
  getLatestCorrectionComments,
  MISSING_CORRECTION_COMMENTS_MESSAGE,
} from "@/lib/training-request-actions";
import type { TrainingRequestActionRecord } from "@/types/training-request-action";

function makeAction(
  overrides: Partial<TrainingRequestActionRecord>,
): TrainingRequestActionRecord {
  return {
    id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    trainingRequestId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    actorPersonnelId: "cccccccc-cccc-cccc-cccc-cccccccccccc",
    actorName: "Alex Reviewer",
    actorBadgeNumber: "101",
    actorRole: "mto",
    action: "mto_returned",
    comments: "Update the course dates.",
    signatureName: "Alex Reviewer",
    signedAt: "2026-07-01T14:00:00.000Z",
    electronicSignatureConfirmed: true,
    signatureStorageBucket: null,
    signatureStoragePath: null,
    signatureSha256: null,
    signatureMimeType: null,
    signatureFileSizeBytes: null,
    createdAt: "2026-07-01T14:00:00.000Z",
    ...overrides,
  };
}

describe("getLatestCorrectionAction", () => {
  it("selects the latest MTO return action", () => {
    const actions = [
      makeAction({
        id: "1",
        action: "submitted",
        comments: null,
        createdAt: "2026-07-01T10:00:00.000Z",
      }),
      makeAction({
        id: "2",
        action: "mto_returned",
        comments: "Fix mileage.",
        actorRole: "mto",
        createdAt: "2026-07-01T12:00:00.000Z",
      }),
    ];

    const latest = getLatestCorrectionAction(actions);

    assert.equal(latest?.id, "2");
    assert.equal(latest?.action, "mto_returned");
  });

  it("selects the latest Deputy Chief return action", () => {
    const actions = [
      makeAction({
        id: "1",
        action: "mto_approved",
        comments: null,
        createdAt: "2026-07-01T10:00:00.000Z",
      }),
      makeAction({
        id: "2",
        action: "deputy_chief_returned",
        comments: "Clarify lodging.",
        actorName: "Taylor Chief",
        actorRole: "deputy_chief",
        createdAt: "2026-07-02T09:00:00.000Z",
      }),
    ];

    const latest = getLatestCorrectionAction(actions);

    assert.equal(latest?.id, "2");
    assert.equal(latest?.action, "deputy_chief_returned");
  });

  it("selects the newest return when a request was returned more than once", () => {
    const actions = [
      makeAction({
        id: "1",
        action: "mto_returned",
        comments: "First return.",
        createdAt: "2026-07-01T12:00:00.000Z",
      }),
      makeAction({
        id: "2",
        action: "resubmitted",
        comments: null,
        createdAt: "2026-07-02T12:00:00.000Z",
      }),
      makeAction({
        id: "3",
        action: "deputy_chief_returned",
        comments: "Second return.",
        actorRole: "deputy_chief",
        createdAt: "2026-07-03T12:00:00.000Z",
      }),
    ];

    const latest = getLatestCorrectionAction(actions);

    assert.equal(latest?.id, "3");
    assert.equal(latest?.comments, "Second return.");
  });
});

describe("getCorrectionCommentsDisplay", () => {
  it("shows fallback text for legacy returns without comments", () => {
    const action = makeAction({ comments: null });

    assert.equal(
      getCorrectionCommentsDisplay(action),
      MISSING_CORRECTION_COMMENTS_MESSAGE,
    );
    assert.equal(getCorrectionCommentsDisplay(null), MISSING_CORRECTION_COMMENTS_MESSAGE);
  });

  it("preserves line breaks in correction comments", () => {
    const multiline = "Line one\nLine two\nLine three";
    const action = makeAction({ comments: multiline });

    assert.equal(getCorrectionCommentsDisplay(action), multiline);
    assert.match(getCorrectionCommentsDisplay(action), /\n/);
  });
});

describe("getLatestCorrectionComments", () => {
  it("returns null when the latest return has no comments", () => {
    const actions = [
      makeAction({
        action: "mto_returned",
        comments: null,
      }),
    ];

    assert.equal(getLatestCorrectionComments(actions), null);
  });
});

describe("correction alert visibility", () => {
  it("shows the correction alert on the request detail page", () => {
    assert.equal(shouldShowCorrectionAlert("returned_for_correction"), true);
  });

  it("keeps the correction alert visible in the edit wizard", () => {
    assert.equal(shouldShowWizardCorrectionAlert("returned_for_correction"), true);
    assert.equal(shouldShowWizardCorrectionAlert("draft"), false);
    assert.equal(shouldShowWizardCorrectionAlert(null), false);
  });

  it("does not show the correction alert for ordinary draft and submitted requests", () => {
    assert.equal(shouldShowCorrectionAlert("draft"), false);
    assert.equal(shouldShowCorrectionAlert("submitted"), false);
    assert.equal(shouldShowCorrectionAlert("pending_mto"), false);
    assert.equal(shouldShowCorrectionAlert("approved"), false);
  });
});

describe("getCorrectionReturnedAt", () => {
  it("prefers signedAt over createdAt", () => {
    const action = makeAction({
      signedAt: "2026-07-01T15:30:00.000Z",
      createdAt: "2026-07-01T14:00:00.000Z",
    });

    assert.match(getCorrectionReturnedAt(action), /2026/);
  });
});
