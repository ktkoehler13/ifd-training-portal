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
import {
  checkOptionalCheckbox,
  checkRequiredCheckbox,
  PdfFormFieldError,
  setOptionalTextField,
  setRequiredTextField,
  uncheckOptionalCheckbox,
} from "@/lib/pdf/pdf-form-fields";
import {
  stripInteractivePdfArtifacts,
  validateFinalMergedPacketNonInteractive,
} from "@/lib/pdf/validate-merged-packet";
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

export { PdfFormFieldError };

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
  const context = "Training Request Form";
  const trainingDates = formatTrainingDatesIncludingTravel(
    request.courseStartDate,
    request.courseEndDate,
  );

  setRequiredTextField(form, fields.requesterName, request.requesterName, context);
  setRequiredTextField(form, fields.badge, request.requesterBadgeNumber, context);
  setRequiredTextField(
    form,
    fields.applicationDate,
    formatPdfDate(request.submittedAt ?? request.createdAt),
    context,
  );
  setRequiredTextField(form, fields.trainingName, request.courseName, context);
  setRequiredTextField(form, fields.trainingLocation, request.location, context);
  setRequiredTextField(form, fields.trainingDatesIncludingTravel, trainingDates, context);

  setOptionalTextField(
    form,
    fields.totalDaysIncludingTravel,
    formatPdfNumber(request.numberOfDaysOnDuty),
  );
  setOptionalTextField(
    form,
    fields.transportation,
    formatTransportationSelection({
      requestDepartmentVehicle: request.requestDepartmentVehicle,
      transportationNotes: request.transportationNotes,
    }),
  );
  setOptionalTextField(
    form,
    fields.registrationFees,
    formatPdfCurrency(request.registrationFee),
  );
  setOptionalTextField(
    form,
    fields.mileage,
    formatPdfNumber(request.totalReimbursableMiles),
  );
  setOptionalTextField(
    form,
    fields.mileageRate,
    formatPdfCurrency(request.gsaMileageRate),
  );
  setOptionalTextField(
    form,
    fields.mileageTotal,
    formatPdfCurrency(request.mileageReimbursement),
  );
  setOptionalTextField(form, fields.mealFoodTotal, formatPdfCurrency(request.foodExpenses));
  setOptionalTextField(form, fields.lodgingTotal, formatPdfCurrency(request.lodging));
  setOptionalTextField(form, fields.otherTotal, formatPdfCurrency(request.otherExpenses));
  setOptionalTextField(form, fields.airfareTotal, formatPdfCurrency(request.airfare));
  setOptionalTextField(
    form,
    fields.rentalVehicleTotal,
    formatPdfCurrency(request.rentalVehicle),
  );
  setOptionalTextField(
    form,
    fields.totalEstimatedExpenses,
    formatPdfCurrency(request.totalEstimatedExpenses),
  );
  setOptionalTextField(
    form,
    fields.onDutyDatePrimary,
    trainingDates,
  );
  setOptionalTextField(
    form,
    fields.onDutyDateSecondary,
    formatPdfNumber(request.numberOfDaysOnDuty),
  );

  checkRequiredCheckbox(form, fields.approvedCheckbox, context);
  uncheckOptionalCheckbox(form, fields.deniedCheckbox);
  setOptionalTextField(form, fields.denialReason, "");

  checkOptionalCheckbox(form, fields.mtoApprovalCheckbox);
  checkOptionalCheckbox(form, fields.deputyApprovalCheckbox);
  setRequiredTextField(
    form,
    fields.mtoApprovalDate,
    formatPdfDate(mtoAction.signedAt ?? mtoAction.createdAt),
    context,
  );
  setRequiredTextField(
    form,
    fields.deputyApprovalDate,
    formatPdfDate(deputyAction.signedAt ?? deputyAction.createdAt),
    context,
  );
}

function populateTalForm(pdf: PDFDocument, input: ApprovedPacketGenerationInput): void {
  const form = pdf.getForm();
  const { request, mtoAction } = input;
  const fields = TAL_FORM_FIELDS;
  const student = splitRequesterNameForTal(request.requesterName);
  const context = "TAL";

  setRequiredTextField(form, fields.courseName, request.courseName, context);
  setOptionalTextField(form, fields.courseNumber, request.courseNumber);
  setRequiredTextField(form, fields.courseLocation, request.location, context);
  setRequiredTextField(form, fields.agencyName, TAL_CONSTANTS.agencyName, context);
  setRequiredTextField(form, fields.fdid, TAL_CONSTANTS.fdid, context);
  setRequiredTextField(
    form,
    fields.authorizationDate,
    formatPdfDate(mtoAction.signedAt ?? mtoAction.createdAt),
    context,
  );
  setRequiredTextField(
    form,
    fields.authorizedRepresentativeName,
    mtoAction.signatureName ?? mtoAction.actorName,
    context,
  );
  checkRequiredCheckbox(form, fields.studentAuthorized, context);
  setRequiredTextField(form, fields.lastName, student.lastName, context);
  setRequiredTextField(form, fields.firstName, student.firstName, context);
  setRequiredTextField(form, fields.email, request.requesterEmail, context);
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

async function renderTrainingRequestFormNonInteractive(
  trainingPdf: PDFDocument,
): Promise<PDFDocument> {
  const form = trainingPdf.getForm();
  form.updateFieldAppearances();

  try {
    form.flatten();
    return trainingPdf;
  } catch {
    const rendered = await PDFDocument.create();
    const [page] = await rendered.copyPages(trainingPdf, [0]);
    rendered.addPage(page);

    const remainingFields = rendered.getForm().getFields();
    if (remainingFields.length > 0) {
      throw new PdfFormFieldError(
        `Training Request Form could not be flattened and still contains ${remainingFields.length} AcroForm field(s).`,
      );
    }

    return rendered;
  }
}

async function renderTalFormNonInteractive(talPdf: PDFDocument): Promise<PDFDocument> {
  const form = talPdf.getForm();
  form.updateFieldAppearances();
  form.flatten();
  return talPdf;
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

  const [renderedTrainingPdf, renderedTalPdf] = await Promise.all([
    renderTrainingRequestFormNonInteractive(trainingPdf),
    renderTalFormNonInteractive(talPdf),
  ]);

  const mergedPdf = await PDFDocument.create();
  const [trainingPage] = await mergedPdf.copyPages(renderedTrainingPdf, [0]);
  const [talPage] = await mergedPdf.copyPages(renderedTalPdf, [0]);
  mergedPdf.addPage(trainingPage);
  mergedPdf.addPage(talPage);

  stripInteractivePdfArtifacts(mergedPdf);

  const mergedBytes = await mergedPdf.save();
  await validateFinalMergedPacketNonInteractive(mergedBytes);

  return mergedBytes;
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

export async function populateTrainingRequestFormForTest(
  input: ApprovedPacketGenerationInput,
): Promise<void> {
  const trainingPdf = await PDFDocument.load(await readFile(TRAINING_REQUEST_FORM_TEMPLATE));
  populateTrainingRequestForm(trainingPdf, input);
}
