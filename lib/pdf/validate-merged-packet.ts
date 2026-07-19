import { PDFDocument, PDFName, PDFArray, PDFDict } from "pdf-lib";

export class PdfPacketValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PdfPacketValidationError";
  }
}

function isWidgetAnnotation(annotation: PDFDict): boolean {
  const subtype = annotation.lookup(PDFName.of("Subtype"));
  return subtype === PDFName.of("Widget");
}

export function stripInteractivePdfArtifacts(pdf: PDFDocument): void {
  for (let pageIndex = 0; pageIndex < pdf.getPageCount(); pageIndex += 1) {
    pdf.getPage(pageIndex).node.delete(PDFName.of("Annots"));
  }

  pdf.catalog.delete(PDFName.of("AcroForm"));
}

export function countWidgetAnnotations(pdf: PDFDocument): number {
  let widgetCount = 0;

  for (let pageIndex = 0; pageIndex < pdf.getPageCount(); pageIndex += 1) {
    const page = pdf.getPage(pageIndex);
    const annotsRef = page.node.lookup(PDFName.of("Annots"));

    if (!annotsRef || !(annotsRef instanceof PDFArray)) {
      continue;
    }

    for (let index = 0; index < annotsRef.size(); index += 1) {
      const annotationRef = annotsRef.lookup(index);
      const annotation = pdf.context.lookup(annotationRef);

      if (annotation instanceof PDFDict && isWidgetAnnotation(annotation)) {
        widgetCount += 1;
      }
    }
  }

  return widgetCount;
}

export async function validateFinalMergedPacketNonInteractive(
  pdfBytes: Uint8Array,
  options?: { minimumPageCount?: number },
): Promise<void> {
  const pdf = await PDFDocument.load(pdfBytes);
  const minimumPageCount = options?.minimumPageCount ?? 3;

  if (pdf.getPageCount() < minimumPageCount) {
    throw new PdfPacketValidationError(
      `Approved packet must contain at least ${minimumPageCount} pages, found ${pdf.getPageCount()}.`,
    );
  }

  const remainingFields = pdf.getForm().getFields();
  if (remainingFields.length > 0) {
    throw new PdfPacketValidationError(
      `Approved packet must be noninteractive but still contains ${remainingFields.length} AcroForm field(s).`,
    );
  }

  const widgetAnnotations = countWidgetAnnotations(pdf);
  if (widgetAnnotations > 0) {
    throw new PdfPacketValidationError(
      `Approved packet must be noninteractive but still contains ${widgetAnnotations} widget annotation(s).`,
    );
  }
}
