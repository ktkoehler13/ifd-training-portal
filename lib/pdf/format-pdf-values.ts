import { formatCurrency } from "@/lib/currency";

export function formatPdfDate(value: string | null | undefined): string {
  if (!value?.trim()) {
    return "";
  }

  const trimmed = value.trim();
  const isoDateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (isoDateMatch) {
    return `${isoDateMatch[2]}/${isoDateMatch[3]}/${isoDateMatch[1]}`;
  }

  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    return trimmed;
  }

  return date.toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });
}

export function formatPdfCurrency(value: number): string {
  if (!Number.isFinite(value)) {
    return "";
  }

  return formatCurrency(value);
}

export function formatPdfNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return "";
  }

  return String(value);
}

export function formatTrainingDatesIncludingTravel(
  startDate: string,
  endDate: string,
): string {
  const start = formatPdfDate(startDate);
  const end = formatPdfDate(endDate);

  if (start && end && start !== end) {
    return `${start} - ${end}`;
  }

  return start || end;
}

export function formatOptionalPdfCurrency(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value === 0) {
    return "";
  }

  return formatCurrency(value);
}

export function formatOptionalPdfNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value === 0) {
    return "";
  }

  return String(value);
}

export function formatTransportationSelection(input: {
  requestDepartmentVehicle: boolean;
  transportationNotes: string;
}): string {
  if (input.requestDepartmentVehicle) {
    return "Department Vehicle";
  }

  return input.transportationNotes.trim();
}

export function splitRequesterNameForTal(requesterName: string): {
  firstName: string;
  lastName: string;
} {
  const trimmed = requesterName.trim();
  if (!trimmed) {
    return { firstName: "", lastName: "" };
  }

  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: "" };
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}
