import { roundCurrency } from "@/lib/currency";
import { calculateExpenseSummary } from "@/lib/expenses";
import {
  buildRequestNumberBase,
  getNextSequenceNumber,
  matchesRequestNumberSequence,
  type RequestNumberInput,
} from "@/lib/requestNumber";
import {
  SUPPORTED_TRAINING_REQUEST_STATUSES,
  type TrainingRequest,
  type TrainingRequestStatus,
} from "@/types";

export const PROTOTYPE_REQUESTS_KEY = "ifd_prototype_requests";
export const PROTOTYPE_REQUESTS_EVENT = "ifd-prototype-requests-changed";

function notifyRequestsChanged() {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new Event(PROTOTYPE_REQUESTS_EVENT));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function asString(value: unknown, fallback = ""): string {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function asWholeNumber(value: unknown, fallback = 0): number {
  return Math.max(0, Math.trunc(asNumber(value, fallback)));
}

function asBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  return fallback;
}

function parseStatus(value: unknown): TrainingRequestStatus {
  const status = asString(value);

  if (
    SUPPORTED_TRAINING_REQUEST_STATUSES.includes(
      status as TrainingRequestStatus,
    )
  ) {
    return status as TrainingRequestStatus;
  }

  return "Submitted — Awaiting MTO Review";
}

export function generateUniqueId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export function normalizePrototypeRequest(
  raw: unknown,
): TrainingRequest | null {
  const record = asRecord(raw);
  if (!record) {
    return null;
  }

  const requestNumber = asString(record.requestNumber).trim();
  if (!requestNumber) {
    return null;
  }

  const requester = asRecord(record.requester);
  const course = asRecord(record.course);
  const expenses = asRecord(record.expenses);

  const requesterName = asString(
    record.requesterName ?? requester?.fullName,
  ).trim();
  const badgeNumber = asString(
    record.badgeNumber ?? requester?.badgeNumber,
  ).trim();
  const departmentEmail = asString(
    record.departmentEmail ?? requester?.departmentEmail,
  ).trim();

  const courseName = asString(record.courseName ?? course?.name).trim();
  const courseNumber = asString(record.courseNumber ?? course?.number).trim();
  const trainingProvider = asString(
    record.trainingProvider ?? course?.provider,
  ).trim();
  const location = asString(record.location ?? course?.location).trim();
  const courseStartDate = asString(
    record.courseStartDate ?? course?.startDate,
  ).trim();
  const courseEndDate = asString(
    record.courseEndDate ?? course?.endDate,
  ).trim();
  const courseDescription = asString(
    record.courseDescription ?? course?.description,
  ).trim();

  const numberOfDaysOnDuty = asWholeNumber(record.numberOfDaysOnDuty, 0);
  const requestDepartmentVehicle = asBoolean(record.requestDepartmentVehicle);

  const registrationFee = roundCurrency(
    asNumber(record.registrationFee ?? expenses?.registrationFee),
  );
  const storedMiles = Math.max(
    0,
    asNumber(
      record.totalReimbursableMiles ??
        record.mileage ??
        expenses?.mileage,
    ),
  );
  const totalReimbursableMiles = requestDepartmentVehicle ? 0 : storedMiles;
  const gsaMileageRate = Math.max(0, asNumber(record.gsaMileageRate));

  const lodging = roundCurrency(asNumber(record.lodging ?? expenses?.lodging));
  const airfare = roundCurrency(asNumber(record.airfare ?? expenses?.airfare));
  const rentalVehicle = roundCurrency(
    asNumber(record.rentalVehicle ?? expenses?.rentalVehicle),
  );
  const foodExpenses = roundCurrency(
    asNumber(record.foodExpenses ?? expenses?.foodExpenses),
  );
  const otherExpenses = roundCurrency(
    asNumber(record.otherExpenses ?? expenses?.otherExpenses),
  );
  const transportationNotes = asString(
    record.transportationNotes ?? expenses?.transportationNotes,
  ).trim();

  const expenseSummary = calculateExpenseSummary({
    requestDepartmentVehicle,
    totalReimbursableMiles,
    gsaMileageRate,
    registrationFee,
    lodging,
    airfare,
    rentalVehicle,
    foodExpenses,
    otherExpenses,
  });

  const storedTotal = record.totalEstimatedExpenses;
  const totalEstimatedExpenses =
    storedTotal === undefined
      ? expenseSummary.totalEstimatedExpenses
      : roundCurrency(asNumber(storedTotal));

  const id = asString(record.id).trim() || generateUniqueId();

  return {
    id,
    requestNumber,
    requesterName,
    badgeNumber,
    departmentEmail,
    courseName,
    courseNumber,
    trainingProvider,
    location,
    courseStartDate,
    courseEndDate,
    numberOfDaysOnDuty,
    courseDescription,
    requestDepartmentVehicle,
    registrationFee,
    totalReimbursableMiles: expenseSummary.totalReimbursableMiles,
    gsaMileageRate,
    mileageReimbursement: expenseSummary.mileageReimbursement,
    lodging,
    airfare,
    rentalVehicle,
    foodExpenses,
    otherExpenses,
    transportationNotes,
    totalEstimatedExpenses,
    status: parseStatus(record.status),
    submittedAt: asString(record.submittedAt, new Date(0).toISOString()),
  };
}

export function getPrototypeRequests(): TrainingRequest[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = localStorage.getItem(PROTOTYPE_REQUESTS_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((item) => normalizePrototypeRequest(item))
      .filter((item): item is TrainingRequest => item !== null);
  } catch {
    return [];
  }
}

export function getPrototypeRequest(
  requestNumber: string,
): TrainingRequest | null {
  return (
    getPrototypeRequests().find(
      (request) => request.requestNumber === requestNumber,
    ) ?? null
  );
}

export function savePrototypeRequest(request: TrainingRequest): void {
  const existing = getPrototypeRequests();
  const next = [
    request,
    ...existing.filter((item) => item.id !== request.id),
  ];
  localStorage.setItem(PROTOTYPE_REQUESTS_KEY, JSON.stringify(next));
  notifyRequestsChanged();
}

export function generateRequestNumber(input: RequestNumberInput): string {
  const existing = getPrototypeRequests();
  const matchingCount = existing.filter((request) =>
    matchesRequestNumberSequence(request, input),
  ).length;

  const base = buildRequestNumberBase(input);
  const sequence = getNextSequenceNumber(matchingCount);

  return `${base}-${sequence}`;
}
