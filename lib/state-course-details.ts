import { isValidNyTrainingId, normalizeNyTrainingId } from "@/lib/ny-training-id";

/** Request-specific details for the existing OFPC Training Authorization Letter. */
export const STATE_COURSE_FIELDS = [
  { key: "requesterAddress", column: "requester_address", label: "Street Address", maxLength: 160, autoComplete: "street-address", type: "text" },
  { key: "requesterCity", column: "requester_city", label: "City", maxLength: 80, autoComplete: "address-level2", type: "text" },
  { key: "requesterState", column: "requester_state", label: "State", maxLength: 2, autoComplete: "address-level1", type: "text" },
  { key: "requesterZip", column: "requester_zip", label: "ZIP Code", maxLength: 10, autoComplete: "postal-code", type: "text" },
  { key: "requesterPhone", column: "requester_phone", label: "Phone Number", maxLength: 40, autoComplete: "tel", type: "tel" },
  { key: "nyTrainingId", column: "ny_training_id", label: "New York Training ID", maxLength: 64, autoComplete: "off", type: "text" },
] as const;

export type StateCourseField = (typeof STATE_COURSE_FIELDS)[number]["key"];
export type StateCourseDetails = Partial<Record<StateCourseField, string | null>>;
export type StateCourseErrors = Partial<Record<StateCourseField, string>>;

export function normalizeStateCourseText(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

export function normalizeStateCourseDetails(value: StateCourseDetails, isOfpcCourse: boolean | null): Record<StateCourseField, string> {
  return Object.fromEntries(STATE_COURSE_FIELDS.map(({ key }) => {
    const text = isOfpcCourse === true ? normalizeStateCourseText(value[key]) : "";
    return [key, key === "requesterState" ? text.toUpperCase() : key === "nyTrainingId" ? normalizeNyTrainingId(text) : text];
  })) as Record<StateCourseField, string>;
}

export function validateStateCourseDetails(value: StateCourseDetails, isOfpcCourse: boolean | null): StateCourseErrors {
  if (isOfpcCourse !== true) return {};
  const details = normalizeStateCourseDetails(value, true);
  const errors: StateCourseErrors = {};
  for (const { key, label, maxLength } of STATE_COURSE_FIELDS) {
    if (!details[key]) errors[key] = `${label} is required for OFPC courses.`;
    else if (details[key].length > maxLength) errors[key] = `${label} must be ${maxLength} characters or fewer.`;
  }
  if (!errors.requesterState && !/^[A-Z]{2}$/.test(details.requesterState)) {
    errors.requesterState = "Enter a two-letter state abbreviation, such as NY.";
  }
  if (!errors.requesterZip && !/^\d{5}(-\d{4})?$/.test(details.requesterZip)) {
    errors.requesterZip = "Enter a ZIP code such as 14850 or 14850-1234.";
  }
  const digits = details.requesterPhone.replace(/\D/g, "");
  if (!errors.requesterPhone && (digits.length < 10 || digits.length > 15 || !/^[+\d().\s-]+$/.test(details.requesterPhone))) {
    errors.requesterPhone = "Enter a phone number with area code (10–15 digits).";
  }
  if (!errors.nyTrainingId && !isValidNyTrainingId(details.nyTrainingId)) {
    errors.nyTrainingId = "Enter one to seven numbers after NY for your New York Training ID.";
  }
  return errors;
}
