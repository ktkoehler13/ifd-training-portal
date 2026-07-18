import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, type PDFPage } from "pdf-lib";
import {
  TAL_CONSTANTS,
  TAL_FORM_FIELDS,
  TAL_SIGNATURE_PLACEMENTS,
  TRAINING_REQUEST_FORM_FIELDS,
  TRAINING_REQUEST_FORM_SIGNATURE_PLACEMENTS,
} from "@/lib/pdf/field-mapping";
import {
  formatPdfCurrency,
  formatPdfDate,
  formatPdfNumber,
  formatTrainingDatesIncludingTravel,
  formatTransportationSelection,
  splitRequesterNameForTal,
} from "@/lib/pdf/format-pdf-values";
import type { TrainingRequestActionRecord } from "@/types/training-request-action";
import type { TrainingRequestRecord } from "@/types/training-request";

const TEMPLATE_DIR = path.join(process.cwd(), "lib/pdf/templates");
const TRAINING_REQUEST_FORM_TEMPLATE = path.join(
  TEMPLATE_DIR,
  "training-request-form-2026.pdf",
);
const TAL_TEMPLATE = path.join(TEMPLATE_DIR, "tal.pdf");

export interface ApprovedPacketGenerationInput {
  request: TrainingRequestRecord;
  mtoAction: TrainingRequestActionRecord;
  deputyAction: TrainingRequestActionRecord;
  mtoSignaturePng: Uint8Array;
  deputySignaturePng: Uint8Array;
}

function setTextField(
  form: ReturnType<PDFDocument["getForm"]>,
  fieldName: string,
  value: string,
): void {
  if (!value) {
    return;
  }

  try {
    form.getTextField(fieldName).setText(value);
  } catch {
    // Unsupported or missing field names are ignored.
  }
}

function checkField(
  form: ReturnType<PDFDocument["getForm"]>,
  fieldName: string,
): void {
  try {
    form.getCheckBox(fieldName).check();
  } catch {
    // Unsupported or missing field names are ignored.
  }
}

function uncheckField(
  form: ReturnType<PDFDocument["getForm"]>,
  fieldName: string,
): void {
  try {
    form.getCheckBox(fieldName).uncheck();
  } catch {
    // Unsupported or missing field names are ignored.
  }
}

async function drawSignatureInBox(
  page: PDFPage,
  pdf: PDFDocument,
  pngBytes: Uint8Array,
  placement: { x: number; y: number; width: number; height: number },
): Promise<void> {
  const image = await pdf.embedPng(pngBytes);
  const scale = Math.min(
    placement.width / image.width,
    placement.height / image.height,
  );
  const width = image.width * scale;
  const height = image.height * scale;
  const x = placement.x + (placement.width - width) / 2;
  const y = placement.y + (placement.height - height) / 2;

  page.drawImage(image, { x, y, width, height });
}

function populateTrainingRequestForm(
  pdf: PDFDocument,
  input: ApprovedPacketGenerationInput,
): void {
  const form = pdf.getForm();
  const { request, mtoAction, deputyAction } = input;
  const fields = TRAINING_REQUEST_FORM_FIELDS;

  setTextField(form, fields.requesterName, request.requesterName);
  setTextField(form, fields.badge, request.requesterBadgeNumber);
  setTextField(
    form,
    fields.applicationDate,
    formatPdfDate(request.submittedAt ?? request.createdAt),
  );
  setTextField(form, fields.trainingName, request.courseName);
  setTextField(form, fields.trainingLocation, request.location);
  setTextField(
    form,
    fields.trainingDatesIncludingTravel,
    formatTrainingDatesIncludingTravel(
      request.courseStartDate,
      request.courseEndDate,
    ),
  );
  setTextField(
    form,
    fields.totalDaysIncludingTravel,
    formatPdfNumber(request.numberOfDaysOnDuty),
  );
  setTextField(
    form,
    fields.transportation,
    formatTransportationSelection({
      requestDepartmentVehicle: request.requestDepartmentVehicle,
      transportationNotes: request.transportationNotes,
    }),
  );
  setTextField(
    form,
    fields.registrationFees,
    formatPdfCurrency(request.registrationFee),
  );
  setTextField(
    form,
    fields.mileage,
    formatPdfNumber(request.totalReimbursableMiles),
  );
  setTextField(
    form,
    fields.mileageRate,
    formatPdfCurrency(request.gsaMileageRate),
  );
  setTextField(
    form,
    fields.mileageTotal,
    formatPdfCurrency(request.mileageReimbursement),
  );
  setTextField(form, fields.mealFoodTotal, formatPdfCurrency(request.foodExpenses));
  setTextField(form, fields.lodgingTotal, formatPdfCurrency(request.lodging));
  setTextField(form, fields.otherTotal, formatPdfCurrency(request.otherExpenses));
  setTextField(form, fields.airfareTotal, formatPdfCurrency(request.airfare));
  setTextField(
    form,
    fields.rentalVehicleTotal,
    formatPdfCurrency(request.rentalVehicle),
  );
  setTextField(
    form,
    fields.totalEstimatedExpenses,
    formatPdfCurrency(request.totalEstimatedExpenses),
  );
  setTextField(
    form,
    fields.onDutyDatePrimary,
    formatTrainingDatesIncludingTravel(
      request.courseStartDate,
      request.courseEndDate,
    ),
  );
  setTextField(
    form,
    fields.onDutyDateSecondary,
    formatPdfNumber(request.numberOfDaysOnDuty),
  );

  checkField(form, fields.approvedCheckbox);
  uncheckField(form, fields.deniedCheckbox);
  setTextField(form, fields.denialReason, "");

  checkField(form, fields.mtoApprovalCheckbox);
  checkField(form, fields.deputyApprovalCheckbox);
  setTextField(
    form,
    fields.mtoApprovalDate,
    formatPdfDate(mtoAction.signedAt ?? mtoAction.createdAt),
  );
  setTextField(
    form,
    fields.deputyApprovalDate,
    formatPdfDate(deputyAction.signedAt ?? deputyAction.createdAt),
  );
}

function populateTalForm(pdf: PDFDocument, input: ApprovedPacketGenerationInput): void {
  const form = pdf.getForm();
  const { request, mtoAction } = input;
  const fields = TAL_FORM_FIELDS;
  const student = splitRequesterNameForTal(request.requesterName);

  setTextField(form, fields.courseName, request.courseName);
  setTextField(form, fields.courseNumber, request.courseNumber);
  setTextField(form, fields.courseLocation, request.location);
  setTextField(form, fields.agencyName, TAL_CONSTANTS.agencyName);
  setTextField(form, fields.fdid, TAL_CONSTANTS.fdid);
  setTextField(
    form,
    fields.authorizationDate,
    formatPdfDate(mtoAction.signedAt ?? mtoAction.createdAt),
  );
  setTextField(
    form,
    fields.authorizedRepresentativeName,
    mtoAction.signatureName ?? mtoAction.actorName,
  );
  checkField(form, fields.studentAuthorized);
  setTextField(form, fields.lastName, student.lastName);
  setTextField(form, fields.firstName, student.firstName);
  setTextField(form, fields.email, request.requesterEmail);

  // Future personnel fields intentionally left blank until trusted data exists.
}

async function stampTrainingRequestSignatures(
  pdf: PDFDocument,
  input: ApprovedPacketGenerationInput,
): Promise<void> {
  const page = pdf.getPage(TRAINING_REQUEST_FORM_SIGNATURE_PLACEMENTS.mtoSignature.pageIndex);

  await drawSignatureInBox(
    page,
    pdf,
    input.mtoSignaturePng,
    TRAINING_REQUEST_FORM_SIGNATURE_PLACEMENTS.mtoSignature,
  );
  await drawSignatureInBox(
    page,
    pdf,
    input.deputySignaturePng,
    TRAINING_REQUEST_FORM_SIGNATURE_PLACEMENTS.deputySignature,
  );
}

async function stampTalAgencySignature(
  pdf: PDFDocument,
  mtoSignaturePng: Uint8Array,
): Promise<void> {
  const page = pdf.getPage(TAL_SIGNATURE_PLACEMENTS.agencyAuthorization.pageIndex);

  await drawSignatureInBox(
    page,
    pdf,
    mtoSignaturePng,
    TAL_SIGNATURE_PLACEMENTS.agencyAuthorization,
  );
}

export async function generateApprovedPacketBytes(
  input: ApprovedPacketGenerationInput,
): Promise<Uint8Array> {
  const [trainingTemplateBytes, talTemplateBytes] = await Promise.all([
    readFile(TRAINING_REQUEST_FORM_TEMPLATE),
    readFile(TAL_TEMPLATE),
  ]);

  const trainingPdf = await PDFDocument.load(trainingTemplateBytes);
  const talPdf = await PDFDocument.load(talTemplateBytes);

  populateTrainingRequestForm(trainingPdf, input);
  populateTalForm(talPdf, input);

  await stampTrainingRequestSignatures(trainingPdf, input);
  await stampTalAgencySignature(talPdf, input.mtoSignaturePng);

  const trainingForm = trainingPdf.getForm();
  trainingForm.updateFieldAppearances();

  const talForm = talPdf.getForm();
  talForm.updateFieldAppearances();
  talForm.flatten();

  // The training request template contains legacy AcroForm widget refs that
  // pdf-lib cannot flatten directly; copying the rendered page removes the form.
  const mergedPdf = await PDFDocument.create();
  const [trainingPage] = await mergedPdf.copyPages(trainingPdf, [0]);
  const [talPage] = await mergedPdf.copyPages(talPdf, [0]);
  mergedPdf.addPage(trainingPage);
  mergedPdf.addPage(talPage);

  return mergedPdf.save();
}

export async function inspectTalPopulationForTest(
  input: ApprovedPacketGenerationInput,
): Promise<{
  studentPrintName: string;
  studentSignatureDate: string;
}> {
  const talPdf = await PDFDocument.load(await readFile(TAL_TEMPLATE));
  populateTalForm(talPdf, input);
  const form = talPdf.getForm();

  function safeGetText(fieldName: string): string {
    try {
      return form.getTextField(fieldName).getText() ?? "";
    } catch {
      return "";
    }
  }

  return {
    studentPrintName: safeGetText(TAL_FORM_FIELDS.studentPrintName),
    studentSignatureDate: safeGetText(TAL_FORM_FIELDS.studentSignatureDate),
  };
}

export async function loadApprovedPacketTemplatesForTest(): Promise<{
  trainingRequestFormPageCount: number;
  talPageCount: number;
}> {
  const [trainingTemplateBytes, talTemplateBytes] = await Promise.all([
    readFile(TRAINING_REQUEST_FORM_TEMPLATE),
    readFile(TAL_TEMPLATE),
  ]);
  const trainingPdf = await PDFDocument.load(trainingTemplateBytes);
  const talPdf = await PDFDocument.load(talTemplateBytes);

  return {
    trainingRequestFormPageCount: trainingPdf.getPageCount(),
    talPageCount: talPdf.getPageCount(),
  };
}
