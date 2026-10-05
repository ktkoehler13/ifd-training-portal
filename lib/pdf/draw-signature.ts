import { type PDFDocument, type PDFPage } from "pdf-lib";
import { cropSignaturePngTransparentMargins } from "@/lib/pdf/crop-signature-png";
import { PdfFormFieldError } from "@/lib/pdf/pdf-form-fields";
import type { PdfImageBoxPlacement } from "@/lib/pdf/field-mapping";

export async function drawSignatureInBox(
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

