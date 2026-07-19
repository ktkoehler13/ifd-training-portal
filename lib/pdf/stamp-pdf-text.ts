import { PDFDocument, type PDFPage, rgb, StandardFonts } from "pdf-lib";
import type { PdfTextBoxPlacement } from "@/lib/pdf/field-mapping";

export async function stampTextInBox(
  pdf: PDFDocument,
  page: PDFPage,
  text: string,
  placement: PdfTextBoxPlacement,
): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) {
    return;
  }

  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontSize = placement.fontSize ?? Math.min(10, placement.height - 2);
  const textWidth = font.widthOfTextAtSize(trimmed, fontSize);
  const x =
    textWidth <= placement.width - 4
      ? placement.x + 2
      : placement.x + Math.max(0, (placement.width - textWidth) / 2);
  const y = placement.y + (placement.height - fontSize) / 2;

  page.drawText(trimmed, {
    x,
    y,
    size: fontSize,
    font,
    color: rgb(0, 0, 0),
  });
}

export async function stampCenteredTextInBox(
  pdf: PDFDocument,
  page: PDFPage,
  text: string,
  placement: PdfTextBoxPlacement,
): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) {
    return;
  }

  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontSize = placement.fontSize ?? Math.min(10, placement.height - 2);
  const textWidth = font.widthOfTextAtSize(trimmed, fontSize);
  const x = placement.x + Math.max(0, (placement.width - textWidth) / 2);
  const y = placement.y + (placement.height - fontSize) / 2;

  page.drawText(trimmed, {
    x,
    y,
    size: fontSize,
    font,
    color: rgb(0, 0, 0),
  });
}
