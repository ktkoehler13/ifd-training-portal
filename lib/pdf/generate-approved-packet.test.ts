import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import {
  generateApprovedPacketBytes,
  inspectTalPopulationForTest,
  PdfFormFieldError,
  populateTrainingRequestFormForTest,
} from "./generate-approved-packet";
import {
  countWidgetAnnotations,
  validateFinalMergedPacketNonInteractive,
} from "./validate-merged-packet";
import { setOptionalTextField, setRequiredTextField } from "./pdf-form-fields";
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

const packetInput = {
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
  mtoSignaturePng: VALID_TEST_PNG,
  deputySignaturePng: VALID_TEST_PNG,
};

describe("generateApprovedPacketBytes", () => {
  it("produces a two-page merged approved packet", async () => {
    const bytes = await generateApprovedPacketBytes(packetInput);
    const pdf = await PDFDocument.load(bytes);
    assert.equal(pdf.getPageCount(), 2);
  });

  it("validates the final packet has zero AcroForm fields", async () => {
    const bytes = await generateApprovedPacketBytes(packetInput);
    const pdf = await PDFDocument.load(bytes);
    assert.equal(pdf.getForm().getFields().length, 0);
    await validateFinalMergedPacketNonInteractive(bytes);
  });

  it("validates the final packet has no widget annotations", async () => {
    const bytes = await generateApprovedPacketBytes(packetInput);
    const pdf = await PDFDocument.load(bytes);
    assert.equal(countWidgetAnnotations(pdf), 0);
  });

  it("leaves firefighter TAL signature fields blank", async () => {
    const populated = await inspectTalPopulationForTest(packetInput);
    assert.equal(populated.studentPrintName, "");
    assert.equal(populated.studentSignatureDate, "");
  });

  it("fails generation when a required training request field is missing", async () => {
    await assert.rejects(
      () =>
        populateTrainingRequestFormForTest({
          ...packetInput,
          request: { ...sampleRequest, requesterName: "" },
        }),
      (error: unknown) => {
        assert.ok(error instanceof PdfFormFieldError);
        assert.match(error.message, /"Name"/i);
        return true;
      },
    );
  });

  it("does not fail when an optional TAL field is absent", async () => {
    const talPdf = await PDFDocument.load(
      await readFile("lib/pdf/templates/tal.pdf"),
    );
    const form = talPdf.getForm();

    assert.doesNotThrow(() => {
      setRequiredTextField(form, TAL_FORM_FIELDS.courseName, "Fire Officer I", "TAL");
      setOptionalTextField(form, TAL_FORM_FIELDS.courseNumber, "");
    });
  });
});

describe("validateFinalMergedPacketNonInteractive", () => {
  it("rejects packets that still contain AcroForm fields", async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage();
    pdf.addPage();
    const form = pdf.getForm();
    form.createTextField("test-field");

    await assert.rejects(
      async () => validateFinalMergedPacketNonInteractive(await pdf.save()),
      /AcroForm field/,
    );
  });
});
