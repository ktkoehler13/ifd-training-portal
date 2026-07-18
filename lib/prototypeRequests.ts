import { addCurrency, roundCurrency } from "@/lib/currency";
import { calculateMileageReimbursement } from "@/lib/mileage";
import type { TrainingRequest, TrainingRequestStatus } from "@/types";

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

  const numberOfDaysOnDuty = asWholeNumber(
    record.numberOfDaysOnDuty,
    0,
  );

  const registrationFee = roundCurrency(
    asNumber(record.registrationFee ?? expenses?.registrationFee),
  );
  const totalReimbursableMiles = Math.max(
    0,
    asNumber(
      record.totalReimbursableMiles ??
        record.mileage ??
        expenses?.mileage,
    ),
  );
  const gsaMileageRate = Math.max(0, asNumber(record.gsaMileageRate));
  const storedMileageReimbursement = record.mileageReimbursement;
  const mileageReimbursement =
    storedMileageReimbursement === undefined
      ? calculateMileageReimbursement(totalReimbursableMiles, gsaMileageRate)
      : roundCurrency(asNumber(storedMileageReimbursement));

  const lodging = roundCurrency(asNumber(record.lodging ?? expenses?.lodging));
  const airfare = roundCurrency(asNumber(record.airfare ?? expenses?.airfare));
  const rentalVehicle = roundCurrency(
    asNumber(record.rentalVehicle ?? expenses?.rentalVehicle),
  );
  const otherExpenses = roundCurrency(
    asNumber(record.otherExpenses ?? expenses?.otherExpenses),
  );
  const transportationNotes = asString(
    record.transportationNotes ?? expenses?.transportationNotes,
  ).trim();

  const storedTotal = record.totalEstimatedExpenses;
  const totalEstimatedExpenses =
    storedTotal === undefined
      ? addCurrency(
          registrationFee,
          mileageReimbursement,
          lodging,
          airfare,
          rentalVehicle,
          otherExpenses,
        )
      : roundCurrency(asNumber(storedTotal));

  const status =
    asString(record.status, "Submitted — Awaiting MTO Review") ||
    "Submitted — Awaiting MTO Review";

  return {
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
    registrationFee,
    totalReimbursableMiles,
    gsaMileageRate,
    mileageReimbursement,
    lodging,
    airfare,
    rentalVehicle,
    otherExpenses,
    transportationNotes,
    totalEstimatedExpenses,
    status: status as TrainingRequestStatus,
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
    ...existing.filter((item) => item.requestNumber !== request.requestNumber),
  ];
  localStorage.setItem(PROTOTYPE_REQUESTS_KEY, JSON.stringify(next));
  notifyRequestsChanged();
}

export function generateRequestNumber(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const dateStamp = `${year}${month}${day}`;
  const prefix = `IFD-TR-${dateStamp}-`;

  const sameDayCount = getPrototypeRequests().filter((request) =>
    request.requestNumber.startsWith(prefix),
  ).length;

  const sequence = String(sameDayCount + 1).padStart(3, "0");
  return `${prefix}${sequence}`;
}
