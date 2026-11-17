import { OFFICE_CODES, type CompensationInput, type OfficeCode } from "./model";

const text = (v: unknown, max: number, label: string) => {
  if (typeof v !== "string" || v.length > max) throw new Error(`${label} is too long or invalid.`);
  return v.trim();
};
function object(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("Invalid compensation packet.");
  return v as Record<string, unknown>;
}
export function parseCompensationInput(value: unknown): CompensationInput {
  const v = object(value);
  const rows = <T>(key: string, parse: (row: Record<string, unknown>) => T): T[] => {
    if (!Array.isArray(v[key]) || v[key].length > 100) throw new Error(`Use no more than 100 ${key} rows per packet.`);
    return v[key].map((row) => parse(object(row)));
  };
  if (typeof v.emtTravel !== "string" || typeof v.compensationType !== "string" || !["", "yes", "no"].includes(v.emtTravel) || !["", "time", "pay"].includes(v.compensationType)) throw new Error("Select valid EMT travel and compensation choices.");
  return {
    emtTravel: v.emtTravel as CompensationInput["emtTravel"], compensationType: v.compensationType as CompensationInput["compensationType"],
    instructor: text(v.instructor, 200, "Instructor"), street: text(v.street, 160, "Address"), cityStateZip: text(v.cityStateZip, 160, "City, state and ZIP"), title: text(v.title, 80, "Title"),
    time: rows("time", (r) => ({ date: text(r.date, 10, "Date"), start: text(r.start, 5, "Start time"), end: text(r.end, 5, "End time"), secondStart: text(r.secondStart, 5, "Second start time"), secondEnd: text(r.secondEnd, 5, "Second end time") })),
    mileage: rows("mileage", (r) => ({ date: text(r.date, 10, "Date"), destination: text(r.destination, 300, "Destination"), miles: text(r.miles, 12, "Miles") })),
    voucher: rows("voucher", (r) => ({ date: text(r.date, 10, "Date"), quantity: text(r.quantity, 12, "Quantity"), description: text(r.description, 1000, "Description"), unitPrice: text(r.unitPrice, 12, "Unit price") })),
  };
}
export function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
const validTime = (v: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const validDecimal = (v: string, min: number, max: number) => /^\d+(\.\d{1,2})?$/.test(v) && Number(v) >= min && Number(v) <= max;
export function validateCompensationSubmission(data: CompensationInput, today: string): string[] {
  const errors: string[] = [];
  if (!data.emtTravel) errors.push("Select Yes or No for EMT travel time.");
  if (!data.compensationType) errors.push("Select Time or Pay.");
  if (!data.instructor) errors.push("Enter the instructor or facilitator's name and title.");
  if (!data.time.length) errors.push("Add at least one training time row.");
  const dates = new Set<string>();
  data.time.forEach((r, i) => {
    const label = `Time row ${i + 1}`;
    if (!validDate(r.date) || r.date > today) errors.push(`${label}: enter a valid date on or before today.`);
    if (dates.has(r.date)) errors.push(`${label}: combine sessions for the same date into one row.`);
    dates.add(r.date);
    if (!validTime(r.start) || !validTime(r.end) || r.end <= r.start) errors.push(`${label}: end time must be after start time.`);
    if ((r.secondStart || r.secondEnd) && (!validTime(r.secondStart) || !validTime(r.secondEnd) || r.secondEnd <= r.secondStart || r.secondStart < r.end)) errors.push(`${label}: the second session must start after the first ends and finish later.`);
  });
  data.mileage.forEach((r, i) => {
    if (!validDate(r.date) || r.date > today || !r.destination || !validDecimal(r.miles, 0.01, 10000)) errors.push(`Mileage row ${i + 1}: enter a date on or before today, destination, and miles greater than zero (up to 10,000).`);
  });
  data.voucher.forEach((r, i) => {
    if (!validDate(r.date) || r.date > today || !r.description || !validDecimal(r.quantity, 0.01, 10000) || !validDecimal(r.unitPrice, 0.01, 100000)) errors.push(`Voucher row ${i + 1}: enter a date on or before today, description, positive quantity and unit price.`);
  });
  if ((data.mileage.length || data.voucher.length) && (!data.street || !data.cityStateZip || !data.title)) errors.push("Enter your mailing address and title for the city voucher.");
  return errors;
}
export function parseOfficeCodes(value: unknown): OfficeCode[] {
  if (!Array.isArray(value) || !value.length || value.some((c) => typeof c !== "string" || !Object.hasOwn(OFFICE_CODES, c)) || new Set(value).size !== value.length) throw new Error("Select at least one office compensation code.");
  return value as OfficeCode[];
}
