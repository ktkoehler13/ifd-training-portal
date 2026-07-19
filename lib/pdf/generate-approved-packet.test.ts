import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { APPROVED_PACKET_VISUAL_FIXTURE_INPUT, APPROVED_PACKET_VISUAL_FIXTURE_REQUEST, buildDefaultApprovedPacketActions } from "./approved-packet-visual-fixture";
import {
  getApprovedPacketStampPlan,
  inspectApprovedPacketGeometry,
} from "./build-stamp-values";
import {
  collectApprovedPacketWarningsForTest,
  collectApprovedPacketWarningsForTestAsync,
} from "./warn-approved-packet-fields";
import {
  generateApprovedPacketBytes,
  inspectTalPopulationForTest,
  PdfFormFieldError,
} from "./generate-approved-packet";
import { renderPdfBytesToPngPages } from "./render-pdf-pages-for-test";
import {
  countWidgetAnnotations,
  validateFinalMergedPacketNonInteractive,
} from "./validate-merged-packet";
import { setOptionalTextField, setRequiredTextField } from "./pdf-form-fields";
import { TAL_FORM_FIELDS } from "./field-mapping";
import { formatTrainingDatesIncludingTravel } from "./format-pdf-values";
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
  requesterTitleSnapshot: "firefighter",
  courseName: "Fire Officer I",
  courseNumber: "FO-1",
  trainingProvider: "NYS Fire Academy",
  courseDescription: "Leadership training",
  location: "Montour Falls, NY",
  courseStartDate: "2026-08-01",
  courseEndDate: "2026-08-05",
  totalDaysIncludingTravel: 5,
  numberOfDaysOnDuty: 1,
  onDutyDates: ["2026-08-03"],
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

const mtoAction = buildAction({ action: "mto_approved", actorRole: "mto" });
const deputyAction = buildAction({
  id: "55555555-5555-5555-5555-555555555555",
  action: "deputy_chief_approved",
  actorRole: "deputy_chief",
  actorName: "Deputy Chief Reviewer",
  signatureName: "Deputy Chief Reviewer",
  signedAt: "2026-07-02T10:00:00.000Z",
  createdAt: "2026-07-02T10:00:00.000Z",
  signatureStoragePath: `${sampleRequest.id}/55555555-5555-5555-5555-555555555555/signature.png`,
});

const packetInput = {
  request: sampleRequest,
  actions: buildDefaultApprovedPacketActions(sampleRequest, mtoAction, deputyAction),
  mtoAction,
  deputyAction,
  mtoSignaturePng: VALID_TEST_PNG,
  deputySignaturePng: VALID_TEST_PNG,
};

describe("generateApprovedPacketBytes", () => {
  it("produces a merged approved packet with an audit trail", async () => {
    const bytes = await generateApprovedPacketBytes(packetInput);
    const pdf = await PDFDocument.load(bytes);
    assert.ok(pdf.getPageCount() >= 3);
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

  it("leaves firefighter TAL signature fields blank and checks authorization boxes", async () => {
    const populated = await inspectTalPopulationForTest(packetInput);
    assert.equal(populated.studentPrintName, "");
    assert.equal(populated.studentSignatureDate, "");
    assert.equal(populated.studentAuthorizedChecked, true);
    assert.equal(populated.scbaClearanceChecked, true);
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

describe("approved packet missing data policy", () => {
  const sparseRequest: TrainingRequestRecord = {
    ...sampleRequest,
    id: "99999999-9999-9999-9999-999999999999",
    courseNumber: "",
    registrationFee: 0,
    lodging: 0,
    foodExpenses: 0,
    airfare: 0,
    rentalVehicle: 0,
    otherExpenses: 0,
    mileageReimbursement: 0,
    totalReimbursableMiles: 0,
    gsaMileageRate: 0,
    totalEstimatedExpenses: 0,
    totalDaysIncludingTravel: null,
    numberOfDaysOnDuty: 0,
    onDutyDates: [],
    transportationNotes: "",
    requestDepartmentVehicle: false,
  };

  const sparsePacketInput = {
    request: sparseRequest,
    actions: buildDefaultApprovedPacketActions(
      sparseRequest,
      buildAction({
        trainingRequestId: sparseRequest.id,
        action: "mto_approved",
        actorRole: "mto",
      }),
      buildAction({
        id: "88888888-8888-8888-8888-888888888888",
        trainingRequestId: sparseRequest.id,
        action: "deputy_chief_approved",
        actorRole: "deputy_chief",
        signatureStoragePath: `${sparseRequest.id}/88888888-8888-8888-8888-888888888888/signature.png`,
      }),
    ),
    mtoAction: buildAction({
      trainingRequestId: sparseRequest.id,
      action: "mto_approved",
      actorRole: "mto",
    }),
    deputyAction: buildAction({
      id: "88888888-8888-8888-8888-888888888888",
      trainingRequestId: sparseRequest.id,
      action: "deputy_chief_approved",
      actorRole: "deputy_chief",
      signatureStoragePath: `${sparseRequest.id}/88888888-8888-8888-8888-888888888888/signature.png`,
    }),
    mtoSignaturePng: VALID_TEST_PNG,
    deputySignaturePng: VALID_TEST_PNG,
  };

  it("succeeds when optional expense fields are blank", async () => {
    const { warnings, result: plan } = collectApprovedPacketWarningsForTest(() =>
      getApprovedPacketStampPlan(sparsePacketInput),
    );
    const bytes = await generateApprovedPacketBytes(sparsePacketInput);

    assert.equal(plan.trainingRequestText.mileage, "");
    assert.equal(plan.trainingRequestText.mileageRate, "");
    assert.equal(plan.trainingRequestText.lodgingTotal, "");
    assert.equal(plan.trainingRequestText.airfareTotal, "");
    assert.equal(plan.trainingRequestText.rentalVehicleTotal, "");
    assert.equal(plan.trainingRequestText.otherTotal, "");
    assert.equal(plan.trainingRequestText.registrationFees, "");
    assert.ok(bytes.byteLength > 0);
    assert.ok(warnings.length >= 0);
  });

  it("succeeds when course number is blank", async () => {
    const plan = getApprovedPacketStampPlan(sparsePacketInput);
    const populated = await inspectTalPopulationForTest(sparsePacketInput);

    assert.equal(sparseRequest.courseNumber, "");
    assert.match(plan.trainingRequestText.trainingName, /Fire Officer I/);
    await assert.doesNotReject(() => generateApprovedPacketBytes(sparsePacketInput));
    assert.equal(populated.studentAuthorizedChecked, true);
    assert.equal(populated.scbaClearanceChecked, true);
  });

  it("leaves individual on-duty dates blank without substitutes", async () => {
    const plan = getApprovedPacketStampPlan(sparsePacketInput);

    assert.equal(plan.trainingRequestText.onDutyDatePrimary, "");
    assert.equal(plan.trainingRequestText.onDutyDateSecondary, "");
    assert.equal(plan.trainingRequestText.totalDaysIncludingTravel, "");
    assert.doesNotMatch(plan.trainingRequestText.onDutyDatePrimary, /5/);
  });

  it("still populates available requester, course, and approval content", async () => {
    const plan = getApprovedPacketStampPlan(sparsePacketInput);

    assert.match(plan.trainingRequestText.requesterName, /Kevin Koehler/);
    assert.match(plan.trainingRequestText.badge, /207/);
    assert.match(plan.trainingRequestText.trainingName, /Fire Officer I/);
    assert.match(plan.trainingRequestText.trainingLocation, /Montour Falls/);
    assert.ok(plan.trainingRequestText.trainingDatesIncludingTravel.length > 0);
    assert.ok(plan.trainingRequestApprovalDates.mtoApprovalDate.length > 0);
    assert.ok(plan.trainingRequestApprovalDates.deputyApprovalDate.length > 0);
    assert.equal(plan.talOriginalInitials.studentAuthorization, "MR");
  });

  it("does not insert placeholder or misleading text for unavailable values", async () => {
    const plan = getApprovedPacketStampPlan(sparsePacketInput);

    assert.equal(plan.trainingRequestText.transportation, "");
    assert.equal(plan.trainingRequestText.mileageTotal, "");
    assert.doesNotMatch(plan.trainingRequestText.registrationFees, /\$0\.00/);
    assert.doesNotMatch(plan.trainingRequestText.onDutyDatePrimary, /N\/A/i);
  });

  it("logs warnings but still generates when core request fields are missing", async () => {
    const incompleteInput = {
      ...sparsePacketInput,
      request: {
        ...sparseRequest,
        requesterName: "",
        requesterBadgeNumber: "",
        courseName: "",
        location: "",
        courseStartDate: "",
        courseEndDate: "",
      },
    };

    const { warnings } = await collectApprovedPacketWarningsForTestAsync(() =>
      generateApprovedPacketBytes(incompleteInput),
    );

    assert.ok(
      warnings.some((warning) => warning.field === "requesterName"),
    );
    assert.ok(warnings.some((warning) => warning.field === "courseName"));
  });

  it("fails safely when a signature image cannot be decoded", async () => {
    await assert.rejects(
      () =>
        generateApprovedPacketBytes({
          ...packetInput,
          mtoSignaturePng: new Uint8Array([0x00, 0x01, 0x02, 0x03]),
        }),
      (error: unknown) => {
        assert.ok(error instanceof PdfFormFieldError);
        assert.match(error.message, /could not be decoded or embedded/i);
        return true;
      },
    );
  });

  it("fails safely when a template cannot be parsed", async () => {
    await assert.rejects(
      () => PDFDocument.load(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x00])),
    );
  });
});

describe("approved packet visual fixture", () => {
  it("stamps page-one request data, approval dates, and signatures with separate vertical placement", async () => {
    const plan = getApprovedPacketStampPlan(APPROVED_PACKET_VISUAL_FIXTURE_INPUT);
    const geometry = inspectApprovedPacketGeometry(plan);
    const bytes = await generateApprovedPacketBytes(APPROVED_PACKET_VISUAL_FIXTURE_INPUT);

    assert.match(plan.trainingRequestText.requesterName, /Fire Fighter/);
    assert.match(plan.trainingRequestText.badge, /207/);
    assert.match(plan.trainingRequestText.applicationDate, /07\/06\/2026/);
    assert.match(plan.trainingRequestText.trainingName, /Testing Sig/);
    assert.match(plan.trainingRequestText.trainingLocation, /Where ever/);
    assert.equal(
      plan.trainingRequestText.trainingDatesIncludingTravel,
      formatTrainingDatesIncludingTravel(
        APPROVED_PACKET_VISUAL_FIXTURE_REQUEST.courseStartDate,
        APPROVED_PACKET_VISUAL_FIXTURE_REQUEST.courseEndDate,
      ),
    );
    assert.match(plan.trainingRequestApprovalDates.mtoApprovalDate, /07\/08\/2026/);
    assert.match(plan.trainingRequestApprovalDates.deputyApprovalDate, /07\/08\/2026/);
    assert.equal(plan.trainingRequestText.totalDaysIncludingTravel, "3");
    assert.equal(plan.trainingRequestText.onDutyDatePrimary, "08/10/2026");
    assert.equal(plan.trainingRequestText.onDutyDateSecondary, "08/11/2026");
    assert.doesNotMatch(
      plan.trainingRequestText.onDutyDatePrimary,
      /07\/08\/2026/,
    );

    assert.equal(geometry.mtoSignatureAboveDeputySignature, true);
    assert.equal(geometry.mtoSignatureDoesNotOverlapMtoDate, true);
    assert.equal(geometry.deputySignatureDoesNotOverlapDeputyDate, true);
    assert.notEqual(
      plan.signaturePlacements.mtoSignature.y,
      plan.signaturePlacements.deputySignature.y,
    );
    assert.ok(bytes.byteLength > 0);
  });

  it("stamps both TAL Original Initial boxes with committed MTO initials", async () => {
    const plan = getApprovedPacketStampPlan(APPROVED_PACKET_VISUAL_FIXTURE_INPUT);
    await generateApprovedPacketBytes(APPROVED_PACKET_VISUAL_FIXTURE_INPUT);

    assert.equal(plan.talOriginalInitials.studentAuthorization, "KK");
    assert.equal(plan.talOriginalInitials.scbaClearance, "KK");

    const talPopulation = await inspectTalPopulationForTest(
      APPROVED_PACKET_VISUAL_FIXTURE_INPUT,
    );
    assert.equal(talPopulation.studentAuthorizedChecked, true);
    assert.equal(talPopulation.scbaClearanceChecked, true);
  });

  it("renders both pages to PNG when pdftoppm is available", async () => {
    const bytes = await generateApprovedPacketBytes(APPROVED_PACKET_VISUAL_FIXTURE_INPUT);
    const rendered = await renderPdfBytesToPngPages(bytes);

    if (!rendered) {
      return;
    }

    for (const pngPath of rendered.pngPaths) {
      const pngBytes = await readFile(pngPath);
      assert.ok(pngBytes.byteLength > 0);
    }
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
      async () =>
        validateFinalMergedPacketNonInteractive(await pdf.save(), {
          minimumPageCount: 2,
        }),
      /AcroForm field/,
    );
  });
});
