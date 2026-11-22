// Keyboard-friendly date and time entry for compensation packets. Typed text is
// converted to the stored formats (YYYY-MM-DD and 24-hour HH:MM); stored values
// never change shape, so validation, totals and PDFs are unaffected.

const pad = (n: number) => String(n).padStart(2, "0");

function isoDate(year: number, month: number, day: number): string | null {
  if (year < 1900 || year > 2999 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year}-${pad(month)}-${pad(day)}`;
}

/**
 * Accepts 11/7/26, 11/07/2026, 11-7-26, 11.7.2026, 110726, 11072026, 2026-11-07,
 * and 11/7 (current year, from `today` as YYYY-MM-DD). Two-digit years are 20xx.
 */
export function parseEntryDate(text: string, today: string): string | null {
  const value = text.trim();
  if (!value) return null;
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value);
  if (match) return isoDate(Number(match[1]), Number(match[2]), Number(match[3]));
  match = /^(\d{1,2})\s*[/.-]\s*(\d{1,2})(?:\s*[/.-]\s*(\d{2}|\d{4}))?$/.exec(value)
    ?? /^(\d{2})(\d{2})(\d{2}|\d{4})$/.exec(value);
  if (!match) return null;
  const year = match[3] === undefined ? Number(today.slice(0, 4))
    : match[3].length === 2 ? 2000 + Number(match[3]) : Number(match[3]);
  return isoDate(year, Number(match[1]), Number(match[2]));
}

/** Stored YYYY-MM-DD → MM/DD/YYYY for display; other text is returned unchanged. */
export function formatEntryDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[2]}/${match[3]}/${match[1]}` : value;
}

/**
 * Accepts military time (1300, 13:00, 0830, 830, 13) and AM/PM time
 * (1:00 PM, 1pm, 1:00p, 8:30 a.m.). Without AM/PM the hour is read as 24-hour.
 */
export function parseEntryTime(text: string): string | null {
  const value = text.trim().toLowerCase().replace(/\./g, "").replace(/\s+/g, " ");
  const match = /^(\d{1,2})(?::?(\d{2}))?\s?(am|pm|a|p)?$/.exec(value);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = match[2] === undefined ? 0 : Number(match[2]);
  if (minute > 59) return null;
  const meridiem = match[3]?.[0];
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    hour = (hour % 12) + (meridiem === "p" ? 12 : 0);
  } else if (hour > 23) return null;
  return `${pad(hour)}:${pad(minute)}`;
}

/** Stored 24-hour HH:MM → "1:00 PM" for display; other text is returned unchanged. */
export function formatEntryTime(value: string): string {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) return value;
  const hour = Number(match[1]);
  return `${hour % 12 || 12}:${match[2]} ${hour < 12 ? "AM" : "PM"}`;
}
