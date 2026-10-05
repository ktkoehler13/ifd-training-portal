import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { ApprovedPacketGenerationInput } from "@/lib/pdf/generate-approved-packet";
import type { TrainingRequestRecord } from "@/types/training-request";
import { encodePdfText, wrapPdfText as wrapTrainingRequestText } from "@/lib/pdf/wrap-pdf-text";
import { drawSignatureInBox } from "@/lib/pdf/draw-signature";
import { formatPdfDate, formatTrainingDatesIncludingTravel } from "@/lib/pdf/format-pdf-values";
import { formatCurrency, formatMileageRate } from "@/lib/currency";
import { otherExpenseLabel } from "@/lib/other-expense-description";

// Inspected against training-request-form-2026.pdf (612 x 792). Preserve the
// original vector artwork/wording, including the entire office-use approval box.
export const TRAINING_REQUEST_TEMPLATE_REGIONS = {
  header: { left: 0, bottom: 678, right: 612, top: 792 },
  travelAuthorization: { left: 0, bottom: 48, right: 612, top: 202 },
} as const;

const LEFT = 42;
const RIGHT = 570;
const TOP = 668;
const BOTTOM = 48;
const SIZE = 9;
const LINE = 12;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
function amount(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function trainingRequestExpenseRows(request: TrainingRequestRecord) {
  return [
    { label: "Registration Fee", amount: amount(request.registrationFee) },
    { label: "Mileage Reimbursement", amount: request.requestDepartmentVehicle ? 0 : amount(request.mileageReimbursement) },
    { label: "Lodging", amount: amount(request.lodging) },
    { label: "Airfare", amount: amount(request.airfare) },
    { label: "Rental Vehicle", amount: amount(request.rentalVehicle) },
    { label: "Food / Meals", amount: amount(request.foodExpenses) },
    { label: otherExpenseLabel(request.otherExpenseDescription), amount: amount(request.otherExpenses) },
  ];
}

export interface TrainingRequestDrawnItem {
  kind: "text" | "signature" | "header" | "travel";
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  bold?: boolean;
}

export async function createTrainingRequestPdf(
  template: PDFDocument,
  input: ApprovedPacketGenerationInput,
): Promise<{ pdf: PDFDocument; items: TrainingRequestDrawnItem[] }> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const source = template.getPage(0);
  const header = await pdf.embedPage(source, TRAINING_REQUEST_TEMPLATE_REGIONS.header);
  const travel = await pdf.embedPage(source, TRAINING_REQUEST_TEMPLATE_REGIONS.travelAuthorization);
  const items: TrainingRequestDrawnItem[] = [];
  let page = pdf.addPage([612, 792]);
  let pageIndex = 0;
  let y = TOP;
  let currentSection = "";

  function draw(value: string, x: number, baseline: number, weight = font, size = SIZE) {
    const safe = encodePdfText(value, weight);
    if (!safe) return;
    page.drawText(safe, { x, y: baseline, font: weight, size, color: rgb(0.08, 0.08, 0.08) });
    items.push({ kind: "text", pageIndex, x, y: baseline, width: weight.widthOfTextAtSize(safe, size), height: size, text: safe, bold: weight === bold });
  }
  function drawHeader() {
    page.drawPage(header, { x: 0, y: 678 });
    items.push({ kind: "header", pageIndex, x: 0, y: 678, width: 612, height: 114 });
  }
  function nextPage() {
    draw("Training Request continues on the next page", LEFT, 31, font, 8);
    page = pdf.addPage([612, 792]);
    pageIndex++;
    y = TOP;
    drawHeader();
  }
  function heading(label: string) {
    page.drawRectangle({ x: LEFT, y: y - 16, width: RIGHT - LEFT, height: 18, color: rgb(0.94, 0.95, 0.96) });
    draw(label, LEFT + 5, y - 10, bold, 9);
    y -= 26;
  }
  function ensure(height: number) {
    if (y - height < BOTTOM) {
      nextPage();
      if (currentSection) heading(`${currentSection} (continued)`);
    }
  }
  function section(label: string, firstRowHeight = LINE) {
    if (y - 26 - firstRowHeight < BOTTOM) nextPage();
    currentSection = label;
    heading(label);
  }
  function paragraph(value: string, x = LEFT, width = RIGHT - LEFT, weight = font) {
    for (const line of wrapTrainingRequestText(value, weight, width)) {
      ensure(LINE);
      draw(line, x, y, weight);
      y -= LINE;
    }
    y -= 3;
  }
  function field(label: string, value: string) {
    const labelWidth = 139;
    const lines = wrapTrainingRequestText(value, font, RIGHT - LEFT - labelWidth);
    for (let index = 0; index < lines.length; index++) {
      ensure(LINE);
      if (index === 0) draw(label, LEFT, y, bold);
      draw(lines[index], LEFT + labelWidth, y);
      y -= LINE;
    }
  }

  const { request, mtoAction, deputyAction } = input;
  drawHeader();
  section("GENERAL INFORMATION");
  field("Requester / Badge", [text(request.requesterName), text(request.requesterBadgeNumber)].filter(Boolean).join(" / "));
  field("Email / Application Date", [text(request.requesterEmail), formatPdfDate(request.submittedAt ?? request.createdAt)].filter(Boolean).join(" / "));
  field("Course", text(request.courseName));
  field("Provider", text(request.trainingProvider));
  field("OFPC Course / Course #", [request.isOfpcCourse == null ? "" : request.isOfpcCourse ? "Yes" : "No", request.isOfpcCourse ? text(request.courseNumber) : ""].filter(Boolean).join(" / "));
  field("Location", text(request.location));
  field("Course Dates (incl. travel)", formatTrainingDatesIncludingTravel(request.courseStartDate, request.courseEndDate));
  field("Training / On-Duty Days", `${request.totalDaysIncludingTravel ?? ""} / ${request.numberOfDaysOnDuty ?? ""}`);
  field("On-Duty Dates", (request.onDutyDates ?? []).map(formatPdfDate).filter(Boolean).join(", "));
  field("Description / Purpose", text(request.courseDescription));
  field("Dept. Vehicle / Miles / Rate", [request.requestDepartmentVehicle == null ? "" : request.requestDepartmentVehicle ? "Yes" : "No", String(request.requestDepartmentVehicle ? 0 : amount(request.totalReimbursableMiles)), `${formatMileageRate(amount(request.gsaMileageRate))} / mile`].join(" / "));
  if (text(request.transportationNotes)) field("Transportation Notes", text(request.transportationNotes));
  paragraph("A completed registration form and other pertinent information must be attached (ie. TAL).");

  section("ESTIMATED EXPENSES");
  for (const row of trainingRequestExpenseRows(request)) {
    const money = formatCurrency(row.amount);
    const moneyWidth = font.widthOfTextAtSize(money, SIZE);
    const lines = wrapTrainingRequestText(row.label, font, RIGHT - LEFT - Math.max(110, moneyWidth + 20));
    if (lines.length * LINE + 3 <= TOP - BOTTOM - 24) ensure(lines.length * LINE + 3);
    for (let index = 0; index < lines.length; index++) {
      ensure(LINE);
      draw(lines[index], LEFT, y);
      if (index === 0) draw(money, RIGHT - moneyWidth, y);
      y -= LINE;
    }
    y -= 1;
  }
  ensure(27);
  page.drawLine({ start: { x: LEFT, y: y + 2 }, end: { x: RIGHT, y: y + 2 }, thickness: 0.7, color: rgb(0.45, 0.45, 0.45) });
  y -= 12;
  draw("TOTAL ESTIMATED EXPENSES", LEFT, y, bold, 10);
  // Preserve the stored approved estimate; never substitute today's global rate.
  const total = formatCurrency(amount(request.totalEstimatedExpenses));
  draw(total, RIGHT - bold.widthOfTextAtSize(total, 10), y, bold, 10);
  y -= 16;

  // Keep both signatures together with the intact Travel Authorization box below.
  const approvals = [
    { role: "MTO", action: mtoAction, png: input.mtoSignaturePng },
    { role: "Deputy Chief", action: deputyAction, png: input.deputySignaturePng },
  ].map((approval) => ({
    ...approval,
    names: wrapTrainingRequestText(text(approval.action.signatureName) || text(approval.action.actorName), font, 165),
  }));
  const approvalHeight = 26 + 12 + approvals.reduce((sum, approval) => sum + Math.max(36, approval.names.length * LINE + 12), 0) + 10;
  // Exceptionally long snapshot names flow before the signature block instead of
  // forcing a box off the page. The complete committed names are retained.
  const oversized = approvalHeight > TOP - 214;
  if (oversized) {
    section("APPROVALS");
    for (const approval of approvals) field(`${approval.role} approval name`, text(approval.action.signatureName) || text(approval.action.actorName));
  }
  const blockHeight = oversized ? 138 : approvalHeight;
  if (y < 214 + blockHeight) nextPage();
  section(oversized ? "APPROVALS (continued)" : "APPROVALS");
  draw("TRAINING APPROVAL or DENIAL", LEFT, y, bold);
  draw("APPROVED: Yes    DENIED: No", 350, y);
  y -= 12;
  for (const approval of approvals) {
    const signature = { pageIndex, x: 305, y: y - 22, width: 125, height: 22 };
    draw(`${approval.role}:`, LEFT, y - 14, bold);
    await drawSignatureInBox(page, pdf, approval.png, signature, approval.role);
    items.push({ kind: "signature", ...signature });
    draw(`DATE: ${formatPdfDate(approval.action.signedAt ?? approval.action.createdAt)}`, 448, y - 14);
    page.drawLine({ start: { x: 300, y: y - 24 }, end: { x: 435, y: y - 24 }, thickness: 0.4 });
    if (!oversized) {
      approval.names.forEach((name, index) => draw(name, 125, y - 14 - index * LINE));
    }
    y -= oversized ? 36 : Math.max(36, approval.names.length * LINE + 12);
  }
  draw("Reason for Denial:", LEFT, y, bold);
  page.drawLine({ start: { x: 140, y: y - 2 }, end: { x: RIGHT, y: y - 2 }, thickness: 0.4 });

  page.drawPage(travel, { x: 0, y: 48 });
  items.push({ kind: "travel", pageIndex, x: 0, y: 48, width: 612, height: 154 });
  for (const [index, trainingPage] of pdf.getPages().entries()) {
    trainingPage.drawText(`Training Request | ${index + 1} of ${pdf.getPageCount()}`, { x: 448, y: 31, font, size: 8 });
  }
  return { pdf, items };
}
