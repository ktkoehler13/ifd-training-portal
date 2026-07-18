import type { PDFForm } from "pdf-lib";

export class PdfFormFieldError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PdfFormFieldError";
  }
}

function formatFieldError(fieldName: string, context: string, detail: string): string {
  return `PDF field "${fieldName}" ${detail} (${context}).`;
}

export function setRequiredTextField(
  form: PDFForm,
  fieldName: string,
  value: string,
  context: string,
): void {
  if (!value.trim()) {
    throw new PdfFormFieldError(
      formatFieldError(fieldName, context, "is required but no value was available"),
    );
  }

  try {
    form.getTextField(fieldName).setText(value);
  } catch {
    throw new PdfFormFieldError(
      formatFieldError(fieldName, context, "is required but missing or has the wrong field type"),
    );
  }
}

export function setOptionalTextField(
  form: PDFForm,
  fieldName: string,
  value: string,
): void {
  if (!value.trim()) {
    return;
  }

  try {
    form.getTextField(fieldName).setText(value);
  } catch {
    // Optional fields may be absent from a template revision.
  }
}

export function checkRequiredCheckbox(
  form: PDFForm,
  fieldName: string,
  context: string,
): void {
  try {
    form.getCheckBox(fieldName).check();
  } catch {
    throw new PdfFormFieldError(
      formatFieldError(fieldName, context, "is required but missing or has the wrong field type"),
    );
  }
}

export function checkOptionalCheckbox(form: PDFForm, fieldName: string): void {
  try {
    form.getCheckBox(fieldName).check();
  } catch {
    // Optional checkbox fields may be absent from a template revision.
  }
}

export function uncheckOptionalCheckbox(form: PDFForm, fieldName: string): void {
  try {
    form.getCheckBox(fieldName).uncheck();
  } catch {
    // Optional checkbox fields may be absent from a template revision.
  }
}
