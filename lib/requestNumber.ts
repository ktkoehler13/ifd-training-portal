export function sanitizeRequestNumberPart(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function parseRequesterName(fullName: string): {
  lastName: string;
  firstInitial: string;
} {
  const trimmed = fullName.trim();
  if (!trimmed) {
    return { lastName: "Unknown", firstInitial: "X" };
  }

  const parts = trimmed.split(/\s+/).filter(Boolean);
  const lastName = parts[parts.length - 1] ?? trimmed;
  const firstInitial = parts[0]?.charAt(0).toUpperCase() || "X";

  return { lastName, firstInitial };
}

export function getCourseYear(
  courseStartDate: string,
  fallbackDate = new Date(),
): number {
  if (courseStartDate) {
    const parsed = new Date(`${courseStartDate}T00:00:00`);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.getFullYear();
    }
  }

  return fallbackDate.getFullYear();
}

export interface RequestNumberInput {
  requesterName: string;
  courseName: string;
  courseStartDate: string;
}

export function buildRequestNumberBase(input: RequestNumberInput): string {
  const { lastName, firstInitial } = parseRequesterName(input.requesterName);
  const sanitizedLastName =
    sanitizeRequestNumberPart(lastName) || "Unknown";
  const sanitizedCourse =
    sanitizeRequestNumberPart(input.courseName) || "Course";
  const year = getCourseYear(input.courseStartDate);

  return `${sanitizedLastName}-${firstInitial}-${sanitizedCourse}-${year}`;
}

export function buildRequestNumberPreview(input: RequestNumberInput): string {
  return `${buildRequestNumberBase(input)}-01`;
}

export function matchesRequestNumberSequence(
  request: {
    requesterName: string;
    courseName: string;
    courseStartDate: string;
  },
  input: RequestNumberInput,
): boolean {
  const requestBase = buildRequestNumberBase({
    requesterName: request.requesterName,
    courseName: request.courseName,
    courseStartDate: request.courseStartDate,
  });
  const inputBase = buildRequestNumberBase(input);

  return requestBase.toLowerCase() === inputBase.toLowerCase();
}

export function getNextSequenceNumber(
  existingCount: number,
): string {
  return String(existingCount + 1).padStart(2, "0");
}
