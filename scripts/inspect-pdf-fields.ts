import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument } from "pdf-lib";

async function inspectTemplate(relativePath: string) {
  const absolutePath = path.join(process.cwd(), relativePath);
  const bytes = await readFile(absolutePath);
  const pdf = await PDFDocument.load(bytes);
  const form = pdf.getForm();
  const fields = form.getFields();

  console.log(`\n=== ${relativePath} ===`);
  console.log(`Pages: ${pdf.getPageCount()}`);

  for (const field of fields) {
    const name = field.getName();
    const constructorName = field.constructor.name;
    console.log(`${name}\t${constructorName}`);
  }
}

async function main() {
  await inspectTemplate("lib/pdf/templates/training-request-form-2026.pdf");
  await inspectTemplate("lib/pdf/templates/tal.pdf");
}

void main();
