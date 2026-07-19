import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, type PDFPage } from "pdf-lib";
import {
  buildTalOriginalInitialStampValues,
  buildTrainingRequestApprovalStampValues,
  buildTrainingRequestFormStampValues,
  getApprovedPacketStampPlan,
} from "@/lib/pdf/build-stamp-values";
import { createAuditTrailPages } from "@/lib/pdf/build-audit-trail";
import { warnApprovedPacketFieldUnavailable } from "@/lib/pdf/warn-approved-packet-fields";
import { cropSignaturePngTransparentMargins } from "@/lib/pdf/crop-signature-png";
import {
  TAL_CONSTANTS,
  TAL_FORM_FIELDS,
  TAL_ORIGINAL_INITIAL_PLACEMENTS,
  TAL_SIGNATURE_PLACEMENTS,
  TRAINING_REQUEST_FORM_FIELDS,
  TRAINING_REQUEST_FORM_SIGNATURE_PLACEMENTS,
  TRAINING_REQUEST_FORM_TEXT_PLACEMENTS,
  type PdfImageBoxPlacement,
} from "@/lib/pdf/field-mapping";
import {
  formatPdfDate,
  splitRequesterNameForTal,
} from "@/lib/pdf/format-pdf-values";
import {
  checkOptionalCheckbox,
  checkRequiredCheckbox,
  PdfFormFieldError,
  setOptionalTextField,
  uncheckOptionalCheckbox,
} from "@/lib/pdf/pdf-form-fields";
import {
  stampCenteredTextInBox,
  stampTextInBox,
} from "@/lib/pdf/stamp-pdf-text";
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
  actions: TrainingRequestActionRecord[];
  mtoAction: TrainingRequestActionRecord;
  deputyAction: TrainingRequestActionRecord;
  mtoSignaturePng: Uint8Array;
  deputySignaturePng: Uint8Array;
}

export { PdfFormFieldError, getApprovedPacketStampPlan };

async function drawSignatureInBox(
  page: PDFPage,
  pdf: PDFDocument,
  pngBytes: Uint8Array,
  placement: PdfImageBoxPlacement,
  context: string,
): Promise<void> {
  if (pngBytes.byteLength === 0) {
    throw new PdfFormFieldError(`${context} signature image is empty and cannot be embedded.`);
  }

  const cropped = cropSignaturePngTransparentMargins(pngBytes);

  let image;
  try {
    image = await pdf.embedPng(cropped);
  } catch {
    throw new PdfFormFieldError(`${context} signature image could not be decoded or embedded.`);
  }

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

function populateTrainingRequestCheckboxes(pdf: PDFDocument): void {
  const form = pdf.getForm();
  const fields = TRAINING_REQUEST_FORM_FIELDS;
  const context = "Training Request Form";

  checkRequiredCheckbox(form, fields.approvedCheckbox, context);
  uncheckOptionalCheckbox(form, fields.deniedCheckbox);
  checkOptionalCheckbox(form, fields.mtoApprovalCheckbox);
  checkOptionalCheckbox(form, fields.deputyApprovalCheckbox);
  setOptionalTextField(form, fields.denialReason, "");
}

function populateTalForm(pdf: PDFDocument, input: ApprovedPacketGenerationInput): void {
  const form = pdf.getForm();
  const { request, mtoAction } = input;
  const fields = TAL_FORM_FIELDS;
  const student = splitRequesterNameForTal(request.requesterName);

  setOptionalTextField(form, fields.courseName, request.courseName);
  setOptionalTextField(form, fields.courseNumber, request.courseNumber);
  setOptionalTextField(form, fields.courseLocation, request.location);
  setOptionalTextField(form, fields.agencyName, TAL_CONSTANTS.agencyName);
  setOptionalTextField(form, fields.fdid, TAL_CONSTANTS.fdid);
  setOptionalTextField(
    form,
    fields.authorizationDate,
    formatPdfDate(mtoAction.signedAt ?? mtoAction.createdAt),
  );
  setOptionalTextField(
    form,
    fields.authorizedRepresentativeName,
    mtoAction.signatureName ?? mtoAction.actorName,
  );
  checkOptionalCheckbox(form, fields.studentAuthorized);
  checkOptionalCheckbox(form, fields.scbaClearance);
  setOptionalTextField(form, fields.lastName, student.lastName);
  setOptionalTextField(form, fields.firstName, student.firstName);
  setOptionalTextField(form, fields.email, request.requesterEmail);
}

async function stampTrainingRequestFormText(
  pdf: PDFDocument,
  input: ApprovedPacketGenerationInput,
): Promise<void> {
  const page = pdf.getPage(0);
  const textValues = buildTrainingRequestFormStampValues(input);
  const approvalDates = buildTrainingRequestApprovalStampValues(input);

  for (const [key, placement] of Object.entries(TRAINING_REQUEST_FORM_TEXT_PLACEMENTS)) {
    const value = textValues[key as keyof typeof TRAINING_REQUEST_FORM_TEXT_PLACEMENTS];
    if (!value.trim()) {
      continue;
    }

    await stampTextInBox(pdf, page, value, placement);
  }

  await stampTextInBox(
    pdf,
    page,
    approvalDates.mtoApprovalDate,
    TRAINING_REQUEST_FORM_SIGNATURE_PLACEMENTS.mtoApprovalDate,
  );
  await stampTextInBox(
    pdf,
    page,
    approvalDates.deputyApprovalDate,
    TRAINING_REQUEST_FORM_SIGNATURE_PLACEMENTS.deputyApprovalDate,
  );
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
    "MTO",
  );
  await drawSignatureInBox(
    page,
    pdf,
    input.deputySignaturePng,
    TRAINING_REQUEST_FORM_SIGNATURE_PLACEMENTS.deputySignature,
    "Deputy Chief",
  );
}

async function stampTalOriginalInitials(
  pdf: PDFDocument,
  input: ApprovedPacketGenerationInput,
): Promise<void> {
  const page = pdf.getPage(0);
  const initialsByBox = buildTalOriginalInitialStampValues(input);

  for (const [key, placement] of Object.entries(TAL_ORIGINAL_INITIAL_PLACEMENTS)) {
    await stampCenteredTextInBox(
      pdf,
      page,
      initialsByBox[key as keyof typeof TAL_ORIGINAL_INITIAL_PLACEMENTS],
      placement,
    );
  }
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
    "TAL agency authorization",
  );
}

async function flattenPdfForm(pdf: PDFDocument, context: string): Promise<PDFDocument> {
  const form = pdf.getForm();
  form.updateFieldAppearances();

  try {
    form.flatten();
    return pdf;
  } catch {
    const rendered = await PDFDocument.create();
    const pageIndexes = Array.from({ length: pdf.getPageCount() }, (_, index) => index);
    const pages = await rendered.copyPages(pdf, pageIndexes);
    for (const page of pages) {
      rendered.addPage(page);
    }

    const remainingFields = rendered.getForm().getFields();
    if (remainingFields.length > 0) {
      throw new PdfFormFieldError(
        `${context} could not be flattened and still contains ${remainingFields.length} AcroForm field(s).`,
      );
    }

    return rendered;
  }
}

export async function generateApprovedPacketBytes(
  input: ApprovedPacketGenerationInput,
): Promise<Uint8Array> {
  getApprovedPacketStampPlan(input);

  if (input.mtoSignaturePng.byteLength === 0) {
    warnApprovedPacketFieldUnavailable(input.request.id, "mtoSignature");
  }
  if (input.deputySignaturePng.byteLength === 0) {
    warnApprovedPacketFieldUnavailable(input.request.id, "deputySignature");
  }

  let trainingTemplateBytes: Uint8Array;
  let talTemplateBytes: Uint8Array;

  try {
    [trainingTemplateBytes, talTemplateBytes] = await Promise.all([
      readFile(TRAINING_REQUEST_FORM_TEMPLATE),
      readFile(TAL_TEMPLATE),
    ]);
  } catch {
    throw new PdfFormFieldError("Approved packet template file could not be read.");
  }

  let trainingPdf: PDFDocument;
  let talPdf: PDFDocument;

  try {
    trainingPdf = await PDFDocument.load(trainingTemplateBytes);
    talPdf = await PDFDocument.load(talTemplateBytes);
  } catch {
    throw new PdfFormFieldError("Approved packet template could not be parsed.");
  }

  if (trainingPdf.getPageCount() < 1 || talPdf.getPageCount() < 1) {
    throw new PdfFormFieldError("Approved packet template is missing a required page.");
  }

  populateTrainingRequestCheckboxes(trainingPdf);
  populateTalForm(talPdf, input);

  const [flattenedTrainingPdf, flattenedTalPdf] = await Promise.all([
    flattenPdfForm(trainingPdf, "Training Request Form"),
    flattenPdfForm(talPdf, "TAL"),
  ]);

  await stampTrainingRequestFormText(flattenedTrainingPdf, input);
  await stampTrainingRequestSignatures(flattenedTrainingPdf, input);
  await stampTalOriginalInitials(flattenedTalPdf, input);
  await stampTalAgencySignature(flattenedTalPdf, input.mtoSignaturePng);

  const auditPdf = await PDFDocument.create();
  await createAuditTrailPages(auditPdf, input.request, input.actions);

  const mergedPdf = await PDFDocument.create();
  const [trainingPage] = await mergedPdf.copyPages(flattenedTrainingPdf, [0]);
  const [talPage] = await mergedPdf.copyPages(flattenedTalPdf, [0]);
  mergedPdf.addPage(trainingPage);
  mergedPdf.addPage(talPage);

  const auditPageIndexes = Array.from(
    { length: auditPdf.getPageCount() },
    (_, index) => index,
  );
  if (auditPageIndexes.length > 0) {
    const auditPages = await mergedPdf.copyPages(auditPdf, auditPageIndexes);
    for (const auditPage of auditPages) {
      mergedPdf.addPage(auditPage);
    }
  }

  stripInteractivePdfArtifacts(mergedPdf);

  let mergedBytes: Uint8Array;
  try {
    mergedBytes = await mergedPdf.save();
  } catch {
    throw new PdfFormFieldError("Approved packet could not be saved.");
  }

  await validateFinalMergedPacketNonInteractive(mergedBytes);

  return mergedBytes;
}

export async function inspectTalPopulationForTest(
  input: ApprovedPacketGenerationInput,
): Promise<{
  studentPrintName: string;
  studentSignatureDate: string;
  studentAuthorizedChecked: boolean;
  scbaClearanceChecked: boolean;
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

  function safeIsChecked(fieldName: string): boolean {
    try {
      return form.getCheckBox(fieldName).isChecked();
    } catch {
      return false;
    }
  }

  return {
    studentPrintName: safeGetText(TAL_FORM_FIELDS.studentPrintName),
    studentSignatureDate: safeGetText(TAL_FORM_FIELDS.studentSignatureDate),
    studentAuthorizedChecked: safeIsChecked(TAL_FORM_FIELDS.studentAuthorized),
    scbaClearanceChecked: safeIsChecked(TAL_FORM_FIELDS.scbaClearance),
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
  buildTrainingRequestFormStampValues(input);
  buildTrainingRequestApprovalStampValues(input);
}
