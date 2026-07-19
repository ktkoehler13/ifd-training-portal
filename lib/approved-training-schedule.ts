import { isPersonnelTitle } from "@/lib/personnel";
import type { PersonnelTitle } from "@/types/personnel";
import { PERSONNEL_TITLE_LABELS } from "@/types/personnel";
import type { TrainingRequestStatus } from "@/types/training-request";

export const APPROVED_TRAINING_SCHEDULE_TIME_ZONE = "America/New_York";

export const FINAL_APPROVED_TRAINING_REQUEST_STATUS = "approved" as const satisfies TrainingRequestStatus;

export type ApprovedTrainingTimeFilter = "upcoming" | "past" | "all";

export interface ApprovedTrainingScheduleRecord {
  id: string;
  requestNumber: string;
  requesterPersonnelId: string;
  requesterName: string;
  requesterBadgeNumber: string;
  requesterTitleSnapshot: PersonnelTitle | null;
  requesterCurrentTitle: PersonnelTitle | null;
  courseName: string;
  courseNumber: string;
  location: string;
  courseStartDate: string;
  courseEndDate: string;
  totalEstimatedExpenses: number;
  approvedAt: string | null;
}

export interface ApprovedTrainingScheduleFilters {
  timeFilter: ApprovedTrainingTimeFilter;
  year: number | "all";
  search: string;
}

export interface ApprovedTrainingScheduleSummary {
  upcomingTrainingCount: number;
  personnelAttendingCount: number;
  trainingDaysCount: number;
}

export interface ApprovedTrainingMonthGroup {
  monthKey: string;
  monthLabel: string;
  records: ApprovedTrainingScheduleRecord[];
}

export interface ApprovedTrainingScheduleViewModel {
  records: ApprovedTrainingScheduleRecord[];
  monthGroups: ApprovedTrainingMonthGroup[];
  summary: ApprovedTrainingScheduleSummary;
  availableYears: number[];
  emptyStateMessage: string;
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const ISO_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: APPROVED_TRAINING_SCHEDULE_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function getTodayInAmericaNewYork(referenceDate = new Date()): string {
  return ISO_DATE_FORMATTER.format(referenceDate);
}

export function parseIsoDateOnly(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) {
    return new Date(Number.NaN);
  }

  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);
  return new Date(Date.UTC(year, month - 1, day));
}

export function formatIsoDateOnly(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatCalendarDateFromIso(value: string): string {
  const date = parseIsoDateOnly(value);
  if (Number.isNaN(date.getTime())) {
    return value.trim();
  }

  return `${MONTH_NAMES[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
}

function formatCalendarMonthHeaderFromIso(value: string): string {
  const date = parseIsoDateOnly(value);
  if (Number.isNaN(date.getTime())) {
    return value.trim().toUpperCase();
  }

  return `${MONTH_NAMES[date.getUTCMonth()]} ${date.getUTCFullYear()}`.toUpperCase();
}

function getEffectiveEndDate(record: ApprovedTrainingScheduleRecord): string {
  return record.courseEndDate.trim() || record.courseStartDate.trim();
}

function compareIsoDates(left: string, right: string): number {
  return left.localeCompare(right);
}

function splitRequesterNameForSort(name: string): {
  firstName: string;
  lastName: string;
} {
  const trimmed = name.trim();
  if (!trimmed) {
    return { firstName: "", lastName: "" };
  }

  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) {
    return { firstName: "", lastName: parts[0] };
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

function compareRequesterNames(left: string, right: string): number {
  const leftParts = splitRequesterNameForSort(left);
  const rightParts = splitRequesterNameForSort(right);
  const lastNameComparison = leftParts.lastName.localeCompare(
    rightParts.lastName,
    undefined,
    { sensitivity: "base" },
  );

  if (lastNameComparison !== 0) {
    return lastNameComparison;
  }

  return leftParts.firstName.localeCompare(rightParts.firstName, undefined, {
    sensitivity: "base",
  });
}

export function isFinallyApprovedTrainingRequest(
  status: TrainingRequestStatus,
): boolean {
  return status === FINAL_APPROVED_TRAINING_REQUEST_STATUS;
}

export function formatApprovedTrainingRequesterRank(
  record: Pick<
    ApprovedTrainingScheduleRecord,
    "requesterTitleSnapshot" | "requesterCurrentTitle"
  >,
): string {
  const snapshot = record.requesterTitleSnapshot;
  if (snapshot && isPersonnelTitle(snapshot)) {
    return PERSONNEL_TITLE_LABELS[snapshot];
  }

  const currentTitle = record.requesterCurrentTitle;
  if (currentTitle && isPersonnelTitle(currentTitle)) {
    return PERSONNEL_TITLE_LABELS[currentTitle];
  }

  return "Not recorded";
}

export function formatApprovedTrainingDateRange(
  startDate: string,
  endDate: string,
): string {
  const normalizedStart = startDate.trim();
  const normalizedEnd = (endDate.trim() || normalizedStart).trim();

  if (!normalizedStart) {
    return "Date not recorded";
  }

  if (!normalizedEnd || normalizedStart === normalizedEnd) {
    return formatCalendarDateFromIso(normalizedStart);
  }

  const start = parseIsoDateOnly(normalizedStart);
  const end = parseIsoDateOnly(normalizedEnd);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return `${normalizedStart} – ${normalizedEnd}`;
  }

  const sameMonth =
    start.getUTCFullYear() === end.getUTCFullYear() &&
    start.getUTCMonth() === end.getUTCMonth();

  if (sameMonth) {
    const monthName = MONTH_NAMES[start.getUTCMonth()];
    return `${monthName} ${start.getUTCDate()}–${end.getUTCDate()}, ${start.getUTCFullYear()}`;
  }

  return `${formatCalendarDateFromIso(normalizedStart)} – ${formatCalendarDateFromIso(normalizedEnd)}`;
}

export function calculateInclusiveTrainingDays(
  startDate: string,
  endDate: string,
): number {
  const normalizedStart = startDate.trim();
  const normalizedEnd = (endDate.trim() || normalizedStart).trim();

  if (!normalizedStart) {
    return 0;
  }

  const start = parseIsoDateOnly(normalizedStart);
  const end = parseIsoDateOnly(normalizedEnd);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 0;
  }

  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  const dayDifference = Math.floor(
    (end.getTime() - start.getTime()) / millisecondsPerDay,
  );

  return Math.max(1, dayDifference + 1);
}

export function getAvailableApprovedTrainingYears(
  records: ApprovedTrainingScheduleRecord[],
): number[] {
  const years = new Set<number>();

  for (const record of records) {
    const start = parseIsoDateOnly(record.courseStartDate);
    if (!Number.isNaN(start.getTime())) {
      years.add(start.getUTCFullYear());
    }

    const end = parseIsoDateOnly(getEffectiveEndDate(record));
    if (!Number.isNaN(end.getTime())) {
      years.add(end.getUTCFullYear());
    }
  }

  return [...years].sort((left, right) => right - left);
}

function recordMatchesYearFilter(
  record: ApprovedTrainingScheduleRecord,
  year: number,
): boolean {
  const start = parseIsoDateOnly(record.courseStartDate);
  const end = parseIsoDateOnly(getEffectiveEndDate(record));

  if (!Number.isNaN(start.getTime()) && start.getUTCFullYear() === year) {
    return true;
  }

  if (!Number.isNaN(end.getTime()) && end.getUTCFullYear() === year) {
    return true;
  }

  return false;
}

export function recordMatchesApprovedTrainingSearch(
  record: ApprovedTrainingScheduleRecord,
  search: string,
): boolean {
  const normalizedSearch = search.trim().toLowerCase();
  if (!normalizedSearch) {
    return true;
  }

  const haystacks = [
    record.requesterName,
    record.requesterBadgeNumber,
    record.courseName,
    record.location,
    record.requestNumber,
  ];

  return haystacks.some((value) =>
    value.toLowerCase().includes(normalizedSearch),
  );
}

function recordMatchesTimeFilter(
  record: ApprovedTrainingScheduleRecord,
  timeFilter: ApprovedTrainingTimeFilter,
  today: string,
): boolean {
  if (timeFilter === "all") {
    return true;
  }

  const effectiveEndDate = getEffectiveEndDate(record);
  if (!effectiveEndDate) {
    return false;
  }

  if (timeFilter === "upcoming") {
    return compareIsoDates(effectiveEndDate, today) >= 0;
  }

  return compareIsoDates(effectiveEndDate, today) < 0;
}

export function sortApprovedTrainingRecords(
  records: ApprovedTrainingScheduleRecord[],
  timeFilter: ApprovedTrainingTimeFilter,
): ApprovedTrainingScheduleRecord[] {
  const sorted = [...records];

  sorted.sort((left, right) => {
    const startComparison = compareIsoDates(
      left.courseStartDate,
      right.courseStartDate,
    );

    if (timeFilter === "past") {
      if (startComparison !== 0) {
        return -startComparison;
      }
    } else if (startComparison !== 0) {
      return startComparison;
    }

    const endComparison = compareIsoDates(
      getEffectiveEndDate(left),
      getEffectiveEndDate(right),
    );

    if (timeFilter !== "past" && endComparison !== 0) {
      return endComparison;
    }

    if (timeFilter === "past" && endComparison !== 0) {
      return -endComparison;
    }

    return compareRequesterNames(left.requesterName, right.requesterName);
  });

  return sorted;
}

export function filterApprovedTrainingRecords(
  records: ApprovedTrainingScheduleRecord[],
  filters: ApprovedTrainingScheduleFilters,
  today = getTodayInAmericaNewYork(),
): ApprovedTrainingScheduleRecord[] {
  let filtered = records.filter((record) =>
    recordMatchesTimeFilter(record, filters.timeFilter, today),
  );

  if (filters.year !== "all") {
    const year = filters.year;
    filtered = filtered.filter((record) =>
      recordMatchesYearFilter(record, year),
    );
  }

  if (filters.search.trim()) {
    filtered = filtered.filter((record) =>
      recordMatchesApprovedTrainingSearch(record, filters.search),
    );
  }

  return sortApprovedTrainingRecords(filtered, filters.timeFilter);
}

export function buildApprovedTrainingSummary(
  records: ApprovedTrainingScheduleRecord[],
): ApprovedTrainingScheduleSummary {
  const personnelIds = new Set<string>();
  let trainingDaysCount = 0;

  for (const record of records) {
    personnelIds.add(record.requesterPersonnelId);
    trainingDaysCount += calculateInclusiveTrainingDays(
      record.courseStartDate,
      record.courseEndDate,
    );
  }

  return {
    upcomingTrainingCount: records.length,
    personnelAttendingCount: personnelIds.size,
    trainingDaysCount,
  };
}

export function groupApprovedTrainingRecordsByMonth(
  records: ApprovedTrainingScheduleRecord[],
): ApprovedTrainingMonthGroup[] {
  const groups = new Map<string, ApprovedTrainingMonthGroup>();

  for (const record of records) {
    const start = parseIsoDateOnly(record.courseStartDate);
    if (Number.isNaN(start.getTime())) {
      continue;
    }

    const monthKey = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}`;
    const monthLabel = formatCalendarMonthHeaderFromIso(record.courseStartDate);

    const existing = groups.get(monthKey);
    if (existing) {
      existing.records.push(record);
      continue;
    }

    groups.set(monthKey, {
      monthKey,
      monthLabel,
      records: [record],
    });
  }

  return [...groups.values()].sort((left, right) =>
    left.monthKey.localeCompare(right.monthKey),
  );
}

export function getApprovedTrainingEmptyStateMessage(
  filters: ApprovedTrainingScheduleFilters,
): string {
  const isDefaultUpcomingView =
    filters.timeFilter === "upcoming" &&
    filters.year === "all" &&
    !filters.search.trim();

  if (isDefaultUpcomingView) {
    return "No upcoming approved training is scheduled.";
  }

  return "No approved training matches the selected filters.";
}

export function buildApprovedTrainingScheduleViewModel(
  allApprovedRecords: ApprovedTrainingScheduleRecord[],
  filters: ApprovedTrainingScheduleFilters,
  today = getTodayInAmericaNewYork(),
): ApprovedTrainingScheduleViewModel {
  const records = filterApprovedTrainingRecords(
    allApprovedRecords,
    filters,
    today,
  );
  const monthGroups =
    filters.timeFilter === "upcoming"
      ? groupApprovedTrainingRecordsByMonth(records)
      : [];

  return {
    records,
    monthGroups,
    summary: buildApprovedTrainingSummary(records),
    availableYears: getAvailableApprovedTrainingYears(allApprovedRecords),
    emptyStateMessage: getApprovedTrainingEmptyStateMessage(filters),
  };
}

export function parseApprovedTrainingTimeFilter(
  value: string | null | undefined,
): ApprovedTrainingTimeFilter {
  if (value === "past" || value === "all") {
    return value;
  }

  return "upcoming";
}

export function parseApprovedTrainingYearFilter(
  value: string | null | undefined,
  availableYears: number[],
  today = getTodayInAmericaNewYork(),
): number | "all" {
  if (!value || value === "all") {
    return "all";
  }

  if (value === "current") {
    const currentYear = parseIsoDateOnly(today).getUTCFullYear();
    return Number.isFinite(currentYear) ? currentYear : "all";
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return "all";
  }

  if (availableYears.includes(parsed)) {
    return parsed;
  }

  return "all";
}

export function formatApprovedDateForCsv(
  approvedAt: string | null,
): string {
  if (!approvedAt?.trim()) {
    return "";
  }

  const parsed = new Date(approvedAt);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return ISO_DATE_FORMATTER.format(parsed);
}

export function buildApprovedTrainingCsv(
  records: ApprovedTrainingScheduleRecord[],
): string {
  const headers = [
    "Training Start Date",
    "Training End Date",
    "Requester Name",
    "Rank",
    "Badge Number",
    "Course Name",
    "Course Number",
    "Location",
    "Request Number",
    "Approved Date",
    "Total Estimated Expenses",
  ];

  const rows = records.map((record) => [
    record.courseStartDate,
    getEffectiveEndDate(record),
    record.requesterName,
    formatApprovedTrainingRequesterRank(record),
    record.requesterBadgeNumber,
    record.courseName,
    record.courseNumber,
    record.location,
    record.requestNumber,
    formatApprovedDateForCsv(record.approvedAt),
    record.totalEstimatedExpenses.toFixed(2),
  ]);

  const escapeCsvValue = (value: string) => {
    if (/[",\n]/.test(value)) {
      return `"${value.replace(/"/g, '""')}"`;
    }

    return value;
  };

  return [headers, ...rows]
    .map((row) => row.map((value) => escapeCsvValue(String(value))).join(","))
    .join("\n");
}

export const APPROVED_TRAINING_SCHEDULE_LOAD_ERROR_MESSAGE =
  "Unable to load the approved training schedule. Please try again later.";

export const APPROVED_TRAINING_SCHEDULE_EXPORT_ERROR_MESSAGE =
  "Unable to export approved training. Please try again later.";
