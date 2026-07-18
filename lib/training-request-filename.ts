import type { TrainingRequestRecord } from "@/types/training-request";
import { formatTrainingRequestIdentifier } from "@/lib/training-requests";

function sanitizeOperatingSystemFilename(value: string): string {
  return value.replace(/[/\\:*?"<>|]/g, "").trim();
}

export function buildTrainingRequestFilename(
  request: Pick<TrainingRequestRecord, "status" | "requestNumber">,
): string {
  const identifier = formatTrainingRequestIdentifier(request);

  if (identifier === "Draft") {
    return "Draft.pdf";
  }

  const baseName = sanitizeOperatingSystemFilename(identifier);

  return `${baseName || "Draft"}.pdf`;
}
