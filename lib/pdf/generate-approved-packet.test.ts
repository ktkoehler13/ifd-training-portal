import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import {
  generateApprovedPacketBytes,
  inspectTalPopulationForTest,
  loadApprovedPacketTemplatesForTest,
} from "./generate-approved-packet";
import { TAL_FORM_FIELDS } from "./field-mapping";
import type { TrainingRequestActionRecord } from "@/types/training-request-action";
import type { TrainingRequestRecord } from "@/types/training-request";
import { VALID_TEST_PNG } from "@/lib/test-utils/valid-test-png";

const sampleRequest: TrainingRequestRecord = {
  id: "11111111-1111-1111-1111-111111111111",
  requestNumber: "Koehler, K, Fire Officer I, 2026.1",
  requesterPersonnelId: "22222222-2222-2222-2222-222222222222",
  requesterBadgeNumber: "207",
  requesterEmail: "firefighter@ifd.example",
  requesterName: "Kevin Koehler",
  courseName: "Fire Officer I",
  courseNumber: "FO-1",
  trainingProvider: "NYS Fire Academy",
  courseDescription: "Leadership training",
  location: "Montour Falls, NY",
  courseStartDate: "2026-08-01",
  courseEndDate: "2026-08-05",
  numberOfDaysOnDuty: 5,
  registrationFee: 250,
  lodging: 400,
  foodExpenses: 150,
  airfare: 0,
  rentalVehicle: 0,
  otherExpenses: 25,
  mileageReimbursement: 84,
  totalReimbursableMiles: 120,
  gsaMileageRate: 0.7,
  totalEstimatedExpenses: 909,
  requestDepartmentVehicle: false,
  transportationNotes: "Personal Vehicle",
  status: "approved",
  currentActionRole: null,
  submittedAt: "2026-07-01T12:00:00.000Z",
  createdAt: "2026-06-30T12:00:00.000Z",
  updatedAt: "2026-07-02T12:00:00.000Z",
};

function buildAction(
  overrides: Partial<TrainingRequestActionRecord>,
): TrainingRequestActionRecord {
  return {
    id: "33333333-3333-3333-3333-333333333333",
    trainingRequestId: sampleRequest.id,
    actorPersonnelId: "44444444-4444-4444-4444-444444444444",
    actorName: "MTO Reviewer",
    actorBadgeNumber: "100",
    actorRole: "mto",
    action: "mto_approved",
    comments: null,
    signatureName: "MTO Reviewer",
    signedAt: "2026-07-01T15:00:00.000Z",
    electronicSignatureConfirmed: true,
    signatureStorageBucket: "training-request-signature-snapshots",
    signatureStoragePath: `${sampleRequest.id}/33333333-3333-3333-3333-333333333333/signature.png`,
    signatureSha256: "abc",
    signatureMimeType: "image/png",
    signatureFileSizeBytes: 100,
    createdAt: "2026-07-01T15:00:00.000Z",
    ...overrides,
  };
}

describe("generateApprovedPacketBytes", () => {
  it("loads one-page source templates", async () => {
    const templates = await loadApprovedPacketTemplatesForTest();
    assert.equal(templates.trainingRequestFormPageCount, 1);
    assert.equal(templates.talPageCount, 1);
  });

  it("produces a two-page merged approved packet", async () => {
    const mtoPng = VALID_TEST_PNG;
    const deputyPng = VALID_TEST_PNG;
    const bytes = await generateApprovedPacketBytes({
      request: sampleRequest,
      mtoAction: buildAction({ action: "mto_approved", actorRole: "mto" }),
      deputyAction: buildAction({
        id: "55555555-5555-5555-5555-555555555555",
        action: "deputy_chief_approved",
        actorRole: "deputy_chief",
        actorName: "Deputy Chief Reviewer",
        signatureName: "Deputy Chief Reviewer",
        signatureStoragePath: `${sampleRequest.id}/55555555-5555-5555-5555-555555555555/signature.png`,
      }),
      mtoSignaturePng: mtoPng,
      deputySignaturePng: deputyPng,
    });

    const pdf = await PDFDocument.load(bytes);
    assert.equal(pdf.getPageCount(), 2);
  });

  it("leaves firefighter TAL signature fields blank", async () => {
    const populated = await inspectTalPopulationForTest({
      request: sampleRequest,
      mtoAction: buildAction({ action: "mto_approved" }),
      deputyAction: buildAction({
        id: "55555555-5555-5555-5555-555555555555",
        action: "deputy_chief_approved",
        actorRole: "deputy_chief",
      }),
      mtoSignaturePng: VALID_TEST_PNG,
      deputySignaturePng: VALID_TEST_PNG,
    });

    assert.equal(populated.studentPrintName, "");
    assert.equal(populated.studentSignatureDate, "");
  });

  it("uses immutable MTO snapshot bytes in both required signature placements", async () => {
    const mtoPng = VALID_TEST_PNG;
    const bytes = await generateApprovedPacketBytes({
      request: sampleRequest,
      mtoAction: buildAction({
        signatureStoragePath: `${sampleRequest.id}/mto-action/signature.png`,
      }),
      deputyAction: buildAction({
        id: "55555555-5555-5555-5555-555555555555",
        action: "deputy_chief_approved",
        actorRole: "deputy_chief",
        signatureStoragePath: `${sampleRequest.id}/deputy-action/signature.png`,
      }),
      mtoSignaturePng: mtoPng,
      deputySignaturePng: VALID_TEST_PNG,
    });

    assert.ok(bytes.byteLength > 0);
    assert.match(
      buildAction().signatureStoragePath ?? "",
      /^[0-9a-f-]+\/[0-9a-f-]+\/signature\.png$/,
    );
  });
});

describe("TAL student signature fields", () => {
  it("documents unsupported student signature field names", () => {
    assert.equal(TAL_FORM_FIELDS.studentSignatureField, "Student signature");
    assert.equal(TAL_FORM_FIELDS.studentSignatureDate, "DATE OF STUDENT SIGNATURE");
  });
});
