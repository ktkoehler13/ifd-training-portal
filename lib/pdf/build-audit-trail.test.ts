import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import {
  APPROVED_PACKET_VISUAL_FIXTURE_ACTIONS,
  APPROVED_PACKET_VISUAL_FIXTURE_INPUT,
  APPROVED_PACKET_VISUAL_FIXTURE_REQUEST,
} from "./approved-packet-visual-fixture";
import {
  AUDIT_ACTION_PHRASES,
  buildAuditTrailEntries,
  createAuditTrailPages,
  formatAuditAction,
  formatAuditActor,
  formatAuditTimestamp,
  formatRequesterAuditActor,
  getAuditCommentLabel,
  getAuditTimestampSource,
  prepareAuditTrailActions,
  serializeAuditTrailForInspection,
} from "./build-audit-trail";
import {
  collectApprovedPacketWarningsForTestAsync,
} from "./warn-approved-packet-fields";
import { generateApprovedPacketBytes } from "./generate-approved-packet";
import { validateFinalMergedPacketNonInteractive } from "./validate-merged-packet";
import type { TrainingRequestActionRecord } from "@/types/training-request-action";
import type { TrainingRequestRecord } from "@/types/training-request";

function buildAction(
  overrides: Partial<TrainingRequestActionRecord>,
): TrainingRequestActionRecord {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    trainingRequestId: APPROVED_PACKET_VISUAL_FIXTURE_REQUEST.id,
    actorPersonnelId: "22222222-2222-2222-2222-222222222222",
    actorName: "Fire Fighter",
    actorBadgeNumber: "207",
    actorRole: "firefighter",
    action: "submitted",
    comments: null,
    signatureName: null,
    signedAt: null,
    electronicSignatureConfirmed: false,
    signatureStorageBucket: null,
    signatureStoragePath: null,
    signatureSha256: null,
    signatureMimeType: null,
    signatureFileSizeBytes: null,
    createdAt: "2026-07-06T18:34:00.000Z",
    ...overrides,
  };
}

describe("buildAuditTrailEntries", () => {
  it("sorts audit actions chronologically by createdAt", () => {
    const actions = [
      buildAction({
        id: "b",
        action: "mto_approved",
        actorName: "Kevin Koehler",
        actorRole: "mto",
        createdAt: "2026-07-08T13:45:00.000Z",
        signedAt: "2026-07-08T13:45:00.000Z",
      }),
      buildAction({
        id: "a",
        action: "submitted",
        createdAt: "2026-07-06T18:34:00.000Z",
      }),
    ];

    const entries = buildAuditTrailEntries(APPROVED_PACKET_VISUAL_FIXTURE_REQUEST, actions);
    assert.equal(entries[0]?.eventLine.includes("Submitted request"), true);
    assert.equal(entries[1]?.eventLine.includes("Approved request"), true);
  });

  it("formats submitted actions as LastName, F.", () => {
    assert.equal(formatRequesterAuditActor("Fire Fighter"), "Fighter, F.");
    assert.equal(formatRequesterAuditActor("Alix Gresov"), "Gresov, A.");
    assert.equal(
      formatAuditActor(buildAction({ action: "submitted", actorName: "Fire Fighter" })),
      "Fighter, F.",
    );
  });

  it("formats MTO actions as MTO plus last name", () => {
    assert.equal(
      formatAuditActor(
        buildAction({ action: "mto_returned", actorName: "Kevin Koehler", actorRole: "mto" }),
      ),
      "MTO Koehler",
    );
  });

  it("formats Deputy Chief actions as Deputy Chief plus last name", () => {
    assert.equal(
      formatAuditActor(
        buildAction({
          action: "deputy_chief_approved",
          actorName: "John Smith",
          actorRole: "deputy_chief",
        }),
      ),
      "Deputy Chief Smith",
    );
  });

  it("formats timestamps in America/New_York using HH:mm MM/DD/YYYY", () => {
    assert.equal(formatAuditTimestamp("2026-07-06T18:34:00.000Z"), "14:34 07/06/2026");
    assert.equal(formatAuditTimestamp("2026-07-07T13:45:00.000Z"), "09:45 07/07/2026");
    assert.doesNotMatch(formatAuditTimestamp("2026-07-07T13:45:00.000Z"), /7\/7\/26/);
  });

  it("prefers signedAt for signed approval actions", () => {
    const action = buildAction({
      action: "mto_approved",
      actorRole: "mto",
      actorName: "Kevin Koehler",
      createdAt: "2026-07-08T10:00:00.000Z",
      signedAt: "2026-07-08T13:45:00.000Z",
    });

    assert.equal(getAuditTimestampSource(action), "2026-07-08T13:45:00.000Z");
    assert.equal(formatAuditTimestamp(getAuditTimestampSource(action)), "09:45 07/08/2026");
  });

  it("uses createdAt for non-signed approval actions", () => {
    const action = buildAction({
      action: "mto_returned",
      actorRole: "mto",
      createdAt: "2026-07-07T13:45:00.000Z",
      signedAt: null,
    });

    assert.equal(getAuditTimestampSource(action), "2026-07-07T13:45:00.000Z");
  });

  it("labels returned comments as Correction requested", () => {
    const action = buildAction({
      action: "mto_returned",
      actorRole: "mto",
      comments: "Please attach the course registration information.",
    });

    assert.equal(getAuditCommentLabel(action), "Correction requested");
  });

  it("labels denial comments as Reason", () => {
    const action = buildAction({
      action: "deputy_chief_denied",
      actorRole: "deputy_chief",
      comments: "Budget unavailable.",
    });

    assert.equal(getAuditCommentLabel(action), "Reason");
  });

  it("omits blank comments", () => {
    const entries = buildAuditTrailEntries(APPROVED_PACKET_VISUAL_FIXTURE_REQUEST, [
      buildAction({ action: "submitted", comments: null }),
    ]);

    assert.equal(entries[0]?.commentText, null);
    assert.equal(entries[0]?.commentLabel, null);
  });

  it("maps all supported action types to readable phrases", () => {
    for (const action of Object.keys(AUDIT_ACTION_PHRASES)) {
      assert.ok(formatAuditAction(buildAction({ action: action as TrainingRequestActionRecord["action"] })));
    }
  });

  it("matches the uploaded visual fixture audit history", () => {
    const entries = buildAuditTrailEntries(
      APPROVED_PACKET_VISUAL_FIXTURE_REQUEST,
      APPROVED_PACKET_VISUAL_FIXTURE_ACTIONS,
    );

    assert.equal(
      entries[0]?.eventLine,
      "Fighter, F. — Submitted request — 14:34 07/06/2026",
    );
    assert.equal(
      entries[1]?.eventLine,
      "MTO Koehler — Returned request for correction — 09:45 07/07/2026",
    );
    assert.match(entries[1]?.commentText ?? "", /course registration information/);
    assert.equal(
      entries[2]?.eventLine,
      "Fighter, F. — Resubmitted request — 13:20 07/07/2026",
    );
    assert.equal(
      entries[3]?.eventLine,
      "MTO Koehler — Approved request — 09:45 07/08/2026",
    );
    assert.equal(
      entries[4]?.eventLine,
      "Deputy Chief Smith — Approved request — 11:02 07/08/2026",
    );
  });

  it("does not expose internal IDs or signature storage data", () => {
    const serialized = serializeAuditTrailForInspection(
      buildAuditTrailEntries(
        APPROVED_PACKET_VISUAL_FIXTURE_REQUEST,
        APPROVED_PACKET_VISUAL_FIXTURE_ACTIONS,
      ),
    );

    assert.doesNotMatch(serialized, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    assert.doesNotMatch(serialized, /signature\.png/i);
    assert.doesNotMatch(serialized, /signatureStorage/i);
    assert.doesNotMatch(serialized, /@/);
  });
});

describe("createAuditTrailPages", () => {
  it("creates continuation pages for long audit histories", async () => {
    const actions = Array.from({ length: 30 }, (_, index) =>
      buildAction({
        id: `${index.toString().padStart(8, "0")}-1111-1111-1111-111111111111`,
        action: index % 2 === 0 ? "submitted" : "mto_returned",
        actorRole: index % 2 === 0 ? "firefighter" : "mto",
        actorName: index % 2 === 0 ? "Fire Fighter" : "Kevin Koehler",
        comments:
          "Please attach the course registration information and any supporting documentation required for review.",
        createdAt: `2026-07-${String((index % 28) + 1).padStart(2, "0")}T12:00:00.000Z`,
      }),
    );

    const pdf = await PDFDocument.create();
    const pageCount = await createAuditTrailPages(
      pdf,
      APPROVED_PACKET_VISUAL_FIXTURE_REQUEST,
      actions,
      new Date("2026-07-18T12:00:00.000Z"),
    );

    assert.ok(pageCount >= 2);
    assert.equal(pdf.getPageCount(), pageCount);
  });

  it("keeps entries in chronological order across pages", async () => {
    const actions = Array.from({ length: 24 }, (_, index) =>
      buildAction({
        id: `${index.toString().padStart(8, "0")}-2222-2222-2222-222222222222`,
        action: "mto_returned",
        actorRole: "mto",
        actorName: "Kevin Koehler",
        comments: "Correction note with enough text to consume vertical space on the page.",
        createdAt: `2026-07-${String((index % 28) + 1).padStart(2, "0")}T${String(index).padStart(2, "0")}:00:00.000Z`,
      }),
    );

    const entries = buildAuditTrailEntries(APPROVED_PACKET_VISUAL_FIXTURE_REQUEST, actions);
    const sorted = [...entries].sort((left, right) =>
      left.sortTimestamp.localeCompare(right.sortTimestamp),
    );

    assert.deepEqual(
      entries.map((entry) => entry.sortTimestamp),
      sorted.map((entry) => entry.sortTimestamp),
    );
  });
});

describe("approved packet audit integration", () => {
  it("includes audit pages after the TAL and keeps the packet noninteractive", async () => {
    const bytes = await generateApprovedPacketBytes(APPROVED_PACKET_VISUAL_FIXTURE_INPUT);
    const pdf = await PDFDocument.load(bytes);

    assert.ok(pdf.getPageCount() >= 3);
    assert.equal(pdf.getForm().getFields().length, 0);
    await validateFinalMergedPacketNonInteractive(bytes);
  });

  it("still generates when optional audit values are missing", async () => {
    const sparseRequest: TrainingRequestRecord = {
      ...APPROVED_PACKET_VISUAL_FIXTURE_REQUEST,
      requestNumber: null,
      requesterName: "",
      courseName: "",
    };

    const sparseInput = {
      ...APPROVED_PACKET_VISUAL_FIXTURE_INPUT,
      request: sparseRequest,
      actions: [
        buildAction({
          action: "submitted",
          actorName: "",
          comments: null,
          createdAt: "invalid-date",
        }),
      ],
    };

    const { warnings, result: bytes } = await collectApprovedPacketWarningsForTestAsync(() =>
      generateApprovedPacketBytes(sparseInput),
    );

    assert.ok(bytes.byteLength > 0);
    assert.ok(warnings.some((warning) => warning.field === "auditActorName"));
  });

  it("filters actions to the current request before rendering", () => {
    const actions = prepareAuditTrailActions(APPROVED_PACKET_VISUAL_FIXTURE_REQUEST, [
      ...APPROVED_PACKET_VISUAL_FIXTURE_ACTIONS,
      buildAction({
        trainingRequestId: "other-request-id",
        action: "submitted",
        createdAt: "2026-01-01T00:00:00.000Z",
      }),
    ]);

    assert.equal(actions.length, APPROVED_PACKET_VISUAL_FIXTURE_ACTIONS.length);
  });
});

describe("audit technical failures", () => {
  it("fails safely when a signature image cannot be decoded", async () => {
    await assert.rejects(
      () =>
        generateApprovedPacketBytes({
          ...APPROVED_PACKET_VISUAL_FIXTURE_INPUT,
          mtoSignaturePng: new Uint8Array([0x00, 0x01, 0x02, 0x03]),
        }),
    );
  });
});
