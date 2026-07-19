import { formatPdfDate } from "@/lib/pdf/format-pdf-values";

export const TRAINING_DAY_DETAILS_MESSAGES = {
  totalDaysRequired: "Enter the total number of training and travel days.",
  totalDaysInvalid: "Enter a whole number greater than zero.",
  daysOnDutyRequired:
    "Enter how many training or travel dates fall on your regularly scheduled duty days.",
  daysOnDutyInvalid: "Enter a whole number of zero or greater.",
  daysOnDutyExceedsTotal:
    "Days on duty cannot exceed total days including travel.",
  enterAllOnDutyDates: (count: number) => `Enter all ${count} on-duty dates.`,
  duplicateOnDutyDates: "On-duty dates cannot be duplicated.",
  outsideCourseRange:
    "On-duty dates must fall within the training or travel period.",
  decreaseOnDutyDatesConfirm:
    "Reducing the number of on-duty days will remove entered dates. Continue?",
  noOnDutyDatesRequired: "No on-duty dates required.",
} as const;

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function parseIsoDateOnly(value: string): Date {
  const match = ISO_DATE_PATTERN.exec(value.trim());
  if (!match) {
    return new Date(Number.NaN);
  }

  const year = Number.parseInt(value.slice(0, 4), 10);
  const month = Number.parseInt(value.slice(5, 7), 10);
  const day = Number.parseInt(value.slice(8, 10), 10);
  return new Date(Date.UTC(year, month - 1, day));
}

export function suggestTotalDaysIncludingTravel(
  courseStartDate: string,
  courseEndDate: string,
): number | null {
  const start = courseStartDate.trim();
  const end = (courseEndDate.trim() || start).trim();
  if (!start) {
    return null;
  }

  const startDate = parseIsoDateOnly(start);
  const endDate = parseIsoDateOnly(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return null;
  }

  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  const difference = Math.floor(
    (endDate.getTime() - startDate.getTime()) / millisecondsPerDay,
  );

  return Math.max(1, difference + 1);
}

export function sortOnDutyDates(dates: string[]): string[] {
  return [...dates]
    .map((value) => value.trim())
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));
}

export function normalizeOnDutyDatesForCount(
  dates: string[],
  count: number,
): string[] {
  const normalized = dates.map((value) => value.trim());
  if (count <= 0) {
    return [];
  }

  const next = normalized.slice(0, count);
  while (next.length < count) {
    next.push("");
  }

  return next;
}

export function resizeOnDutyDates(
  currentDates: string[],
  nextCount: number,
  previousCount: number,
): { dates: string[]; confirmed: boolean } {
  if (nextCount < 0 || !Number.isFinite(nextCount)) {
    return { dates: currentDates, confirmed: false };
  }

  if (nextCount >= previousCount) {
    return {
      dates: normalizeOnDutyDatesForCount(currentDates, nextCount),
      confirmed: true,
    };
  }

  const removedDates = currentDates.slice(nextCount);
  if (removedDates.some((value) => value.trim())) {
    const confirmed =
      typeof globalThis.confirm === "function"
        ? globalThis.confirm(TRAINING_DAY_DETAILS_MESSAGES.decreaseOnDutyDatesConfirm)
        : true;

    if (!confirmed) {
      return { dates: currentDates, confirmed: false };
    }
  }

  return {
    dates: normalizeOnDutyDatesForCount(currentDates, nextCount),
    confirmed: true,
  };
}

export function parsePositiveInteger(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed || !/^\d+$/.test(trimmed)) {
    return null;
  }

  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseNonNegativeInteger(value: string): number | null {
  const parsed = parsePositiveInteger(value);
  if (parsed === null && value.trim() === "0") {
    return 0;
  }

  if (parsed === null) {
    if (/^\d+$/.test(value.trim())) {
      return Number.parseInt(value.trim(), 10);
    }
    return null;
  }

  return parsed;
}

function isDateWithinCourseRange(
  date: string,
  courseStartDate: string,
  courseEndDate: string,
): boolean {
  const start = courseStartDate.trim();
  const end = (courseEndDate.trim() || start).trim();
  if (!start || !ISO_DATE_PATTERN.test(date)) {
    return true;
  }

  return date >= start && date <= end;
}

export interface TrainingDayDetailsValidationInput {
  totalDaysIncludingTravel: string;
  numberOfDaysOnDuty: string;
  onDutyDates: string[];
  courseStartDate: string;
  courseEndDate: string;
  requireComplete: boolean;
}

export function validateTrainingDayDetails(
  input: TrainingDayDetailsValidationInput,
): Partial<
  Record<
    "totalDaysIncludingTravel" | "numberOfDaysOnDuty" | "onDutyDates",
    string
  >
> {
  const errors: Partial<
    Record<
      "totalDaysIncludingTravel" | "numberOfDaysOnDuty" | "onDutyDates",
      string
    >
  > = {};

  const totalDays = parsePositiveInteger(input.totalDaysIncludingTravel);
  const daysOnDuty = parseNonNegativeInteger(input.numberOfDaysOnDuty);

  if (input.requireComplete) {
    if (totalDays === null) {
      errors.totalDaysIncludingTravel =
        input.totalDaysIncludingTravel.trim() === ""
          ? TRAINING_DAY_DETAILS_MESSAGES.totalDaysRequired
          : TRAINING_DAY_DETAILS_MESSAGES.totalDaysInvalid;
    }

    if (daysOnDuty === null) {
      errors.numberOfDaysOnDuty =
        input.numberOfDaysOnDuty.trim() === ""
          ? TRAINING_DAY_DETAILS_MESSAGES.daysOnDutyRequired
          : TRAINING_DAY_DETAILS_MESSAGES.daysOnDutyInvalid;
    }
  } else if (
    input.totalDaysIncludingTravel.trim() &&
    totalDays === null
  ) {
    errors.totalDaysIncludingTravel = TRAINING_DAY_DETAILS_MESSAGES.totalDaysInvalid;
  } else if (input.numberOfDaysOnDuty.trim() && daysOnDuty === null) {
    errors.numberOfDaysOnDuty = TRAINING_DAY_DETAILS_MESSAGES.daysOnDutyInvalid;
  }

  if (
    totalDays !== null &&
    daysOnDuty !== null &&
    daysOnDuty > totalDays
  ) {
    errors.numberOfDaysOnDuty =
      TRAINING_DAY_DETAILS_MESSAGES.daysOnDutyExceedsTotal;
  }

  if (daysOnDuty === null) {
    return errors;
  }

  const normalizedDates = normalizeOnDutyDatesForCount(
    input.onDutyDates,
    daysOnDuty,
  );

  if (daysOnDuty === 0) {
    if (normalizedDates.some((value) => value.trim())) {
      errors.onDutyDates = TRAINING_DAY_DETAILS_MESSAGES.noOnDutyDatesRequired;
    }
    return errors;
  }

  if (!input.requireComplete && normalizedDates.every((value) => !value.trim())) {
    return errors;
  }

  const filledDates = normalizedDates.map((value) => value.trim());
  if (filledDates.some((value) => !value)) {
    errors.onDutyDates =
      TRAINING_DAY_DETAILS_MESSAGES.enterAllOnDutyDates(daysOnDuty);
    return errors;
  }

  if (filledDates.some((value) => !ISO_DATE_PATTERN.test(value))) {
    errors.onDutyDates =
      TRAINING_DAY_DETAILS_MESSAGES.enterAllOnDutyDates(daysOnDuty);
    return errors;
  }

  const sortedUnique = new Set(filledDates);
  if (sortedUnique.size !== filledDates.length) {
    errors.onDutyDates = TRAINING_DAY_DETAILS_MESSAGES.duplicateOnDutyDates;
    return errors;
  }

  if (
    input.courseStartDate.trim() &&
    filledDates.some(
      (value) =>
        !isDateWithinCourseRange(
          value,
          input.courseStartDate,
          input.courseEndDate,
        ),
    )
  ) {
    errors.onDutyDates = TRAINING_DAY_DETAILS_MESSAGES.outsideCourseRange;
  }

  return errors;
}

export function buildTrainingDayDetailsFromDraft(
  draft: {
    totalDaysIncludingTravel: string;
    numberOfDaysOnDuty: string;
    onDutyDates: string[];
    courseStartDate: string;
    courseEndDate: string;
  },
  options: { requireComplete: boolean },
): {
  totalDaysIncludingTravel: number | null;
  numberOfDaysOnDuty: number;
  onDutyDates: string[];
} {
  const validation = validateTrainingDayDetails({
    totalDaysIncludingTravel: draft.totalDaysIncludingTravel,
    numberOfDaysOnDuty: draft.numberOfDaysOnDuty,
    onDutyDates: draft.onDutyDates,
    courseStartDate: draft.courseStartDate,
    courseEndDate: draft.courseEndDate,
    requireComplete: options.requireComplete,
  });

  if (options.requireComplete && Object.keys(validation).length > 0) {
    throw new Error(Object.values(validation)[0] ?? "Training day details are invalid.");
  }

  const totalDays = parsePositiveInteger(draft.totalDaysIncludingTravel);
  const daysOnDuty =
    parseNonNegativeInteger(draft.numberOfDaysOnDuty) ??
    Math.max(0, Number.parseInt(draft.numberOfDaysOnDuty, 10) || 0);

  const normalizedDates = normalizeOnDutyDatesForCount(
    draft.onDutyDates,
    daysOnDuty,
  );
  const filledDates = sortOnDutyDates(
    normalizedDates.filter((value) => value.trim()),
  );
  const onDutyDates =
    daysOnDuty === 0 ? [] : filledDates.slice(0, daysOnDuty);

  const hasCompleteOnDutyDates =
    daysOnDuty === 0 ? onDutyDates.length === 0 : onDutyDates.length === daysOnDuty;

  const canPersistTotal =
    totalDays !== null &&
    hasCompleteOnDutyDates &&
    daysOnDuty <= totalDays &&
    Object.keys(validation).length === 0;

  return {
    totalDaysIncludingTravel: canPersistTotal ? totalDays : null,
    numberOfDaysOnDuty: daysOnDuty,
    onDutyDates,
  };
}

export function formatTotalDaysIncludingTravelDisplay(
  value: number | null | undefined,
): string {
  if (value == null || value <= 0) {
    return "Not recorded";
  }

  return String(value);
}

export function formatDaysOnDutyDisplay(value: number | null | undefined): string {
  if (value == null || value < 0) {
    return "Not recorded";
  }

  return String(value);
}

export function formatOnDutyDatesForDisplay(dates: string[]): string {
  if (!dates.length) {
    return "Not recorded";
  }

  return sortOnDutyDates(dates)
    .map((value) => formatPdfDate(value))
    .join(", ");
}

export function formatOnDutyDatesForCsv(dates: string[]): string {
  return sortOnDutyDates(dates).join("; ");
}

export function partitionOnDutyDatesForPdf(onDutyDates: string[]): {
  primary: string;
  secondary: string;
  overflow: string[];
} {
  const sorted = sortOnDutyDates(onDutyDates);
  return {
    primary: sorted[0] ? formatPdfDate(sorted[0]) : "",
    secondary: sorted[1] ? formatPdfDate(sorted[1]) : "",
    overflow: sorted.slice(2).map((value) => formatPdfDate(value)),
  };
}
