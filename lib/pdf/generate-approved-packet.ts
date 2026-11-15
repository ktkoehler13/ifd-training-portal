import { requestContactEmail } from "@/lib/training-location";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { encodePdfText, wrapPdfText } from "@/lib/pdf/wrap-pdf-text";
import { PDFDocument, StandardFonts } from "pdf-lib";
import {
  buildTalOriginalInitialStampValues,
  buildTrainingRequestApprovalStampValues,
  buildTrainingRequestFormStampValues,
  getApprovedPacketStampPlan,
} from "@/lib/pdf/build-stamp-values";
import { createAuditTrailPages } from "@/lib/pdf/build-audit-trail";
import { warnApprovedPacketFieldUnavailable } from "@/lib/pdf/warn-approved-packet-fields";
import { drawSignatureInBox } from "@/lib/pdf/draw-signature";
import { createTrainingRequestPdf } from "@/lib/pdf/render-training-request";
import { createAcademyRegistrationPdf } from "@/lib/pdf/render-academy-registration";
import {
  TAL_CONSTANTS,
  TAL_FORM_FIELDS,
  TAL_ORIGINAL_INITIAL_PLACEMENTS,
  TAL_SIGNATURE_PLACEMENTS,
} from "@/lib/pdf/field-mapping";
import {
  formatPdfDate,
  splitRequesterNameForTal,
} from "@/lib/pdf/format-pdf-values";
import {
  checkOptionalCheckbox,
  PdfFormFieldError,
  setOptionalTextField,
} from "@/lib/pdf/pdf-form-fields";
import {
  stampCenteredTextInBox,
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
  requesterSignaturePng?: Uint8Array;
}

export { PdfFormFieldError, getApprovedPacketStampPlan };

async function populateTalForm(pdf: PDFDocument, input: ApprovedPacketGenerationInput): Promise<void> {
  const form = pdf.getForm();
  const { request, mtoAction } = input;
  const fields = TAL_FORM_FIELDS;
  const student = splitRequesterNameForTal(request.requesterName);

  setOptionalTextField(form, fields.courseName, request.courseName);
  setOptionalTextField(
    form,
    fields.courseNumber,
    request.isOfpcCourse === true ? request.courseNumber : "",
  );
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
  setOptionalTextField(form, fields.email, requestContactEmail(request));
  setOptionalTextField(form, fields.studentPrintName, request.requesterName);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  // Keep the TAL's original boxes and normal typography. Only constrain values
  // too long for those boxes; their full text remains in the packet.
  for (const [name, raw, reference] of [
    [fields.courseName, request.courseName, "See Training Request for course"],
    [fields.courseNumber, request.isOfpcCourse ? request.courseNumber : "", "See Training Request for course number"],
    [fields.courseLocation, request.location, "See Training Request for location"],
    [fields.email, requestContactEmail(request), "See request contact email in audit trail"],
  ]) {
    if (!raw?.trim()) continue;
    let field;
    try { field = form.getTextField(name); } catch { continue; }
    const text = encodePdfText(raw, font).replace(/\s+/g, " ");
    const width = Math.min(...field.acroField.getWidgets().map(widget => widget.getRectangle().width)) - 6;
    const size = width / Math.max(1, font.widthOfTextAtSize(text, 1));
    if (size >= 12 && text === raw) continue;
    field.removeMaxLength();
    field.updateAppearances(font);
    field.setText(size < 7 ? reference : text);
    field.setFontSize(size < 7 ? 7 : Math.min(12, size));
    field.updateAppearances(font);
  }
  const studentFields = request.isOfpcCourse === true ? [
    [fields.address, request.requesterAddress], [fields.city, request.requesterCity],
    [fields.state, request.requesterState], [fields.zip, request.requesterZip],
    [fields.phone, request.requesterPhone], [fields.nyTrainingId, request.nyTrainingId],
  ] : [];
  for (const [name, value] of studentFields) {
    if (!name || !value?.trim()) continue;
    let field;
    try { field = form.getTextField(name); } catch { continue; }
    // Existing boxes remain in place. Use the full ZIP+4 and fit long values
    // within each original widget rather than overflowing adjacent fields.
    field.removeMaxLength();
    field.updateAppearances(font);
    const safeValue = encodePdfText(value, font).replace(/\s+/g, " ");
    const width = Math.min(...field.acroField.getWidgets().map(widget => widget.getRectangle().width)) - 6;
    const naturalWidth = font.widthOfTextAtSize(safeValue, 10);
    const size = Math.min(10, 10 * width / Math.max(naturalWidth, 1));
    if (size >= 7) {
      field.setText(safeValue);
      field.setFontSize(size);
    } else {
      const lines = wrapPdfText(safeValue, font, width, 7);
      const height = Math.min(...field.acroField.getWidgets().map(widget => widget.getRectangle().height)) - 3;
      if (lines.length * 8 <= height) {
        field.enableMultiline(); field.setText(lines.join("\n")); field.setFontSize(7);
      } else {
        field.setText("See student details in audit trail"); field.setFontSize(7);
      }
    }
    field.updateAppearances(font);
  }
  if (input.requesterSignaturePng?.byteLength) {
    setOptionalTextField(form, fields.studentSignatureDate,
      formatPdfDate(input.deputyAction.signedAt ?? input.deputyAction.createdAt));
  }
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

  await populateTalForm(talPdf, input);

  const [{ pdf: renderedTrainingPdf }, flattenedTalPdf] = await Promise.all([
    createTrainingRequestPdf(trainingPdf, input),
    flattenPdfForm(talPdf, "TAL"),
  ]);

  await stampTalOriginalInitials(flattenedTalPdf, input);
  await stampTalAgencySignature(flattenedTalPdf, input.mtoSignaturePng);
  if (input.requesterSignaturePng?.byteLength) {
    await drawSignatureInBox(flattenedTalPdf.getPage(0), flattenedTalPdf, input.requesterSignaturePng,
      TAL_SIGNATURE_PLACEMENTS.student, "TAL requester signature");
  }

  const auditPdf = await PDFDocument.create();
  await createAuditTrailPages(auditPdf, input.request, input.actions);

  const mergedPdf = await PDFDocument.create();
  const trainingPages = await mergedPdf.copyPages(renderedTrainingPdf, renderedTrainingPdf.getPageIndices());
  const [talPage] = await mergedPdf.copyPages(flattenedTalPdf, [0]);
  for (const trainingPage of trainingPages) mergedPdf.addPage(trainingPage);
  mergedPdf.addPage(talPage);
  if (input.request.locationType === "nys_fire_academy") {
    const academyPdf = await createAcademyRegistrationPdf(input);
    for (const page of await mergedPdf.copyPages(academyPdf, academyPdf.getPageIndices())) mergedPdf.addPage(page);
  }

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
  studentDetails: Record<string, string>;
  studentPrintName: string;
  studentSignatureDate: string;
  studentAuthorizedChecked: boolean;
  scbaClearanceChecked: boolean;
  courseName: string;
  contactEmail: string;
}> {
  const talPdf = await PDFDocument.load(await readFile(TAL_TEMPLATE));
  await populateTalForm(talPdf, input);
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
    courseName: safeGetText(TAL_FORM_FIELDS.courseName),
    contactEmail: safeGetText(TAL_FORM_FIELDS.email),
    studentDetails: Object.fromEntries(["firstName", "lastName", "address", "city", "state", "zip", "phone", "nyTrainingId"].map(key => [key, safeGetText(TAL_FORM_FIELDS[key as keyof typeof TAL_FORM_FIELDS])])),
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
