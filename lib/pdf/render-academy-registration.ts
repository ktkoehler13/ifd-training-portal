import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, type PDFPage } from "pdf-lib";
import { requestContactEmail } from "@/lib/training-location";
import { TAL_CONSTANTS } from "@/lib/pdf/field-mapping";
import { drawSignatureInBox } from "@/lib/pdf/draw-signature";
import { stripInteractivePdfArtifacts } from "@/lib/pdf/validate-merged-packet";
import { encodePdfText, wrapPdfText } from "@/lib/pdf/wrap-pdf-text";
import { formatPdfDate, formatTrainingDatesIncludingTravel, splitRequesterNameForTal } from "@/lib/pdf/format-pdf-values";
import type { ApprovedPacketGenerationInput } from "@/lib/pdf/generate-approved-packet";

// Printed cell edges measured from the official form's artwork, rather than its
// slightly offset interactive rectangles. NY already occupies the first two cells.
const ACADEMY_DIGIT_CELLS = {
  "Training ID": { left: 162.2644, right: 280.2301, count: 7, baseline: 642.4 },
  "last 4 of SSN": { left: 212.8211, right: 280.2301, count: 4, baseline: 619.5 },
} as const;

export function academyDigitPlacements(field: keyof typeof ACADEMY_DIGIT_CELLS, value: string) {
  const cells = ACADEMY_DIGIT_CELLS[field];
  if (!/^[0-9]+$/.test(value) || value.length > cells.count || (field === "last 4 of SSN" && value.length !== 4)) return null;
  const width = (cells.right - cells.left) / cells.count;
  return [...value].map((digit, index) => ({ digit, centerX: cells.left + width * (index + 0.5), y: cells.baseline }));
}

// Official EOSB-1220 (10/22), downloaded 2026-11-14:
// https://www.dhses.ny.gov/academy-registration-form
// Department contact details verified against:
// https://www.cityofithacany.gov/204/Ithaca-Fire-Department
export function academyRegistrationValues({ request, mtoAction }: ApprovedPacketGenerationInput): Record<string, string> {
  const name = splitRequesterNameForTal(request.requesterName);
  return {
    Name: name.lastName ? `${name.lastName}, ${name.firstName}` : name.firstName,
    "Training ID": (request.nyTrainingId ?? "").trim().replace(/^NY[ -]?/i, ""),
    "last 4 of SSN": /^[0-9]{4}$/.test(request.academySsnLast4 ?? "") ? request.academySsnLast4! : "",
    "Home Address": request.requesterAddress ?? "", City: request.requesterCity ?? "", State: request.requesterState ?? "", Zip: request.requesterZip ?? "",
    "Daytime Phone": request.requesterPhone ?? "", Email: requestContactEmail(request),
    FDID: TAL_CONSTANTS.fdid, County: "Tompkins", "Sponsoring Organization": TAL_CONSTANTS.agencyName,
    "Sponsor Address": "310 W. Green St.", "Sponsor City": "Ithaca", "Sponsor State": "NY", "Sponsor Zip": "14850",
    "Sponsor Phone": "607-272-1234", "Sponsor Email": "ithacafire@cityofithaca.org",
    "Sponsor Name / Title": `${mtoAction.signatureName ?? mtoAction.actorName} / MTO`,
    "Signature Date": formatPdfDate(mtoAction.signedAt ?? mtoAction.createdAt),
    "Course Title": request.courseName, "Course Code": request.courseNumber,
    "Date 1st Choice": formatTrainingDatesIncludingTravel(request.courseStartDate, request.courseEndDate),
    FeeRegistration: request.registrationFee.toFixed(2), Feemealsandlodging: request.foodExpenses.toFixed(2),
  };
}

export async function createAcademyRegistrationPdf(input: ApprovedPacketGenerationInput): Promise<PDFDocument> {
  const pdf = await PDFDocument.load(await readFile(path.join(process.cwd(), "lib/pdf/templates/academy-registration.pdf")));
  const form = pdf.getForm();
  const placements = new Map(form.getFields().map((field) => [field.getName(), field.acroField.getWidgets()[0]?.getRectangle()]));
  // The approved packet is immutable. Stamp captured values on the untouched
  // official artwork; all uncollected personal/payment fields remain blank.
  // The official signature widgets have no appearance stream; PDFForm.removeField
  // expects one. Remove their field entries directly before stripping annotations.
  for (const field of [...form.getFields()]) form.acroForm.removeField(field.acroField);
  stripInteractivePdfArtifacts(pdf);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.getPage(0);
  const overflow: Array<[string, string]> = [];
  for (const [name, raw] of Object.entries(academyRegistrationValues(input))) {
    const box = placements.get(name);
    if (!raw.trim() || !box) continue;
    const value = encodePdfText(raw, font).replace(/\s+/g, " ");
    const width = box.width - 4;
    if (name === "Training ID" || name === "last 4 of SSN") {
      const digits = academyDigitPlacements(name, value);
      if (digits) {
        for (const { digit, centerX, y } of digits) page.drawText(digit, { x: centerX - font.widthOfTextAtSize(digit, 12) / 2, y, size: 12, font });
      } else {
        overflow.push([name, value]);
        page.drawText("See details page", { x: box.x + 2, y: box.y + 6, size: 7, font });
      }
      continue;
    }
    const size = Math.min(10, width / Math.max(1, font.widthOfTextAtSize(value, 1)));
    const minimum = name === "Signature Date" ? 6 : 7;
    let text = value, fontSize = Math.max(minimum, size);
    if (size < minimum) {
      const lines = wrapPdfText(value, font, width, minimum);
      if (lines.length * (minimum + 1) <= box.height - 2) {
        lines.forEach((line, index) => page.drawText(line, { x: box.x + 2, y: box.y + box.height - minimum - 1 - index * (minimum + 1), size: minimum, font }));
        continue;
      }
      overflow.push([name, value]); text = "See details page"; fontSize = Math.min(7, width / font.widthOfTextAtSize(text, 1));
    }
    page.drawText(text, { x: box.x + 2, y: box.y + (box.height - fontSize) / 2 + 1, size: fontSize, font });
  }
  for (const name of ["Commuter", ...(input.request.requesterState?.toUpperCase() === "NY" ? ["NYS Resident"] : [])]) {
    const box = placements.get(name);
    if (box) page.drawText("X", { x: box.x + 1, y: box.y + 1, size: 9, font: bold });
  }
  const signatureBox = placements.get("Signature - head of agency");
  if (signatureBox && input.mtoSignaturePng.byteLength) await drawSignatureInBox(page, pdf, input.mtoSignaturePng,
    { pageIndex: 0, ...signatureBox }, "Academy sponsoring agency signature");

  if (overflow.length) {
    let detailsPage: PDFPage = pdf.addPage([612, 792]); let y = 740;
    const heading = () => { detailsPage.drawText("Fire Academy Registration - Continued Details", { x: 40, y, size: 13, font: bold }); y -= 28; };
    heading();
    for (const [name, value] of overflow) {
      for (const line of wrapPdfText(`${name}: ${value}`, font, 532, 10)) {
        if (y < 50) { detailsPage = pdf.addPage([612, 792]); y = 740; heading(); }
        detailsPage.drawText(line, { x: 40, y, size: 10, font }); y -= 14;
      }
      y -= 10;
    }
  }
  return pdf;
}
