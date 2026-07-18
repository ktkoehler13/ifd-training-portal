import { isAdministrativeRole } from "@/lib/auth/roles";
import type { AuthenticatedPersonnel } from "@/lib/auth/personnel";
import type { TrainingRequestRecord } from "@/types/training-request";
import type {
  TrainingRequestPacketRecord,
  TrainingRequestPacketStatus,
} from "@/types/training-request-packet";

export function canRetryApprovedPacketGeneration(role: AuthenticatedPersonnel["role"]): boolean {
  return isAdministrativeRole(role);
}

export function canDownloadApprovedPacket(input: {
  personnel: AuthenticatedPersonnel;
  request: TrainingRequestRecord;
  packet: TrainingRequestPacketRecord | null;
}): boolean {
  if (input.request.status !== "approved") {
    return false;
  }

  if (input.packet?.status !== "ready") {
    return false;
  }

  if (input.request.requesterPersonnelId === input.personnel.id) {
    return true;
  }

  return isAdministrativeRole(input.personnel.role);
}

export function formatTrainingRequestPacketStatus(
  status: TrainingRequestPacketStatus,
): string {
  switch (status) {
    case "pending":
      return "Pending";
    case "processing":
      return "Processing";
    case "ready":
      return "Ready";
    case "failed":
      return "Failed";
    default:
      return status;
  }
}
