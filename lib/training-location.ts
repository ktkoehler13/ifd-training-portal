import type { TrainingRequestDraft } from "@/types/training-request";

export const TRAINING_LOCATIONS = { nys_fire_academy: "NYS Fire Academy", sptc: "SPTC", other: "Other" } as const;
export type TrainingLocationType = keyof typeof TRAINING_LOCATIONS;
export const ACADEMY_REGISTRATION_FEE = 25;
export const ACADEMY_COMMUTER_DAILY_FEE = 8;
export const ACADEMY_FEES_SOURCE = "https://www.dhses.ny.gov/node/191";

export function inferTrainingLocationType(location: string): TrainingLocationType | "" {
  if (!location.trim()) return "";
  if (location.trim() === TRAINING_LOCATIONS.nys_fire_academy) return "nys_fire_academy";
  if (location.trim() === TRAINING_LOCATIONS.sptc) return "sptc";
  return "other";
}

export function normalizeTrainingLocation(type: unknown, location: string): { locationType: TrainingLocationType | ""; location: string } {
  const locationType = type === "" ? "" : typeof type === "string" && Object.hasOwn(TRAINING_LOCATIONS, type)
    ? type as TrainingLocationType : inferTrainingLocationType(location);
  return { locationType, location: locationType === "other" || !locationType ? location.trim() : TRAINING_LOCATIONS[locationType] };
}

export function suggestedAcademyMealDays(start: string, end: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return 1;
  const days = (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000 + 1;
  return Number.isInteger(days) && days >= 1 && days <= 366 ? days : 1;
}

export function parseAcademyMealDays(value: unknown): number | null {
  const text = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim() : "";
  if (!/^\d{1,3}$/.test(text)) return null;
  const days = Number(text);
  return days >= 0 && days <= 366 ? days : null;
}

export function applyAcademyExpenseDefaults<T extends TrainingRequestDraft>(draft: T, replace = false): T {
  if (normalizeTrainingLocation(draft.locationType, draft.location).locationType !== "nys_fire_academy") return draft;
  const days = parseAcademyMealDays(draft.academyMealDays) ?? suggestedAcademyMealDays(draft.courseStartDate, draft.courseEndDate);
  return { ...draft, academyMealDays: String(days),
    registrationFee: replace || !draft.registrationFee.trim() ? ACADEMY_REGISTRATION_FEE.toFixed(2) : draft.registrationFee,
    foodExpenses: replace || !draft.foodExpenses.trim() ? (days * ACADEMY_COMMUTER_DAILY_FEE).toFixed(2) : draft.foodExpenses,
  };
}

export function requestContactEmail(request: { requestContactEmail?: string | null; requesterEmail: string }): string {
  return request.requestContactEmail?.trim() || request.requesterEmail || "";
}

export function validateRequestContactEmail(value: string): string | null {
  return value.trim().length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) ? null : "Enter a valid contact email for this request.";
}

export function validateAcademySsnLast4(value: unknown, locationType: string | undefined, required = true): string | null {
  if (locationType !== "nys_fire_academy") return null;
  const text = typeof value === "string" ? value.trim() : "";
  if (!text && !required) return null;
  return /^[0-9]{4}$/.test(text) ? null : "Enter exactly the last four digits of your SSN for Academy registration.";
}
