import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument } from "pdf-lib";

async function inspectFieldRects(relativePath: string) {
  const absolutePath = path.join(process.cwd(), relativePath);
  const bytes = await readFile(absolutePath);
  const pdf = await PDFDocument.load(bytes);
  const form = pdf.getForm();

  console.log(`\n=== ${relativePath} ===`);

  for (const field of form.getFields()) {
    for (const widget of field.acroField.getWidgets()) {
      const rect = widget.getRectangle();
      console.log(
        `${field.getName()}\tx=${rect.x.toFixed(1)} y=${rect.y.toFixed(1)} w=${rect.width.toFixed(1)} h=${rect.height.toFixed(1)}`,
      );
    }
  }

  for (let pageIndex = 0; pageIndex < pdf.getPageCount(); pageIndex += 1) {
    const page = pdf.getPage(pageIndex);
    const { width, height } = page.getSize();
    console.log(`Page ${pageIndex + 1} size: ${width} x ${height}`);
  }
}

void inspectFieldRects("lib/pdf/templates/training-request-form-2026.pdf");
void inspectFieldRects("lib/pdf/templates/tal.pdf");
