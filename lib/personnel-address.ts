import { normalizeStateCourseText, STATE_COURSE_FIELDS, type StateCourseDetails } from "@/lib/state-course-details";

export const ADDRESS_KEYS = ["requesterAddress", "requesterCity", "requesterState", "requesterZip"] as const;
export type AddressField = (typeof ADDRESS_KEYS)[number];
export type PersonnelAddress = Record<AddressField, string>;
export type AddressErrors = Partial<Record<AddressField, string>>;
export const ADDRESS_FIELDS = STATE_COURSE_FIELDS.filter((field) =>
  ADDRESS_KEYS.includes(field.key as AddressField),
) as ReadonlyArray<(typeof STATE_COURSE_FIELDS)[number] & { key: AddressField }>;

export function normalizePersonnelAddress(value: StateCourseDetails): PersonnelAddress {
  return Object.fromEntries(ADDRESS_KEYS.map((key) => {
    const text = normalizeStateCourseText(value[key]);
    return [key, key === "requesterState" ? text.toUpperCase() : text];
  })) as PersonnelAddress;
}

export function validatePersonnelAddress(value: StateCourseDetails): AddressErrors {
  const address = normalizePersonnelAddress(value);
  const errors: AddressErrors = {};
  for (const { key, label, maxLength } of ADDRESS_FIELDS) {
    if (!address[key]) errors[key] = `${label} is required to save your address.`;
    else if (address[key].length > maxLength) errors[key] = `${label} must be ${maxLength} characters or fewer.`;
  }
  if (!errors.requesterState && !/^[A-Z]{2}$/.test(address.requesterState)) errors.requesterState = "Enter a two-letter state abbreviation, such as NY.";
  if (!errors.requesterZip && !/^\d{5}(-\d{4})?$/.test(address.requesterZip)) errors.requesterZip = "Enter a ZIP code such as 14850 or 14850-1234.";
  return errors;
}

/** Never merge parts of different addresses or replace an existing request's snapshot. */
export function prefillNewRequestAddress<T extends StateCourseDetails>(draft: T, saved: PersonnelAddress | null, existingRequest: boolean, addressEdited: boolean): T {
  if (!saved || existingRequest || addressEdited || ADDRESS_KEYS.some((key) => normalizeStateCourseText(draft[key]))) return draft;
  return { ...draft, ...saved };
}

export function samePersonnelAddress(a: StateCourseDetails, b: StateCourseDetails): boolean {
  const left = normalizePersonnelAddress(a), right = normalizePersonnelAddress(b);
  return ADDRESS_KEYS.every((key) => left[key] === right[key]);
}
