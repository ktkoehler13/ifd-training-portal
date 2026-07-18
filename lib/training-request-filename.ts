import type { TrainingRequestRecord } from "@/types/training-request";

function sanitizeFilenameSegment(value: string, fallback: string): string {
  const cleaned = value
    .trim()
    .replace(/[/\\?%*:|"<>]/g, "")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");

  return cleaned || fallback;
}

function parseRequesterNameParts(requesterName: string): {
  firstName: string;
  lastName: string;
} {
  const parts = requesterName.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return { firstName: "", lastName: "" };
  }

  if (parts.length === 1) {
    return { firstName: parts[0] ?? "", lastName: "" };
  }

  return {
    firstName: parts[0] ?? "",
    lastName: parts[parts.length - 1] ?? "",
  };
}

export function buildTrainingRequestFilename(
  request: Pick<
    TrainingRequestRecord,
    "requesterName" | "courseName" | "requestNumber"
  >,
): string {
  const { firstName, lastName } = parseRequesterNameParts(request.requesterName);
  const firstInitial = (firstName.charAt(0) || "U").toUpperCase();
  const lastNamePart = sanitizeFilenameSegment(lastName, "Unknown");
  const trainingTitlePart = sanitizeFilenameSegment(
    request.courseName,
    "Training_Name",
  );
  const requestNumberPart = sanitizeFilenameSegment(
    request.requestNumber,
    "Request",
  );

  return `${lastNamePart}_${firstInitial}_${trainingTitlePart}_${requestNumberPart}.pdf`;
}
