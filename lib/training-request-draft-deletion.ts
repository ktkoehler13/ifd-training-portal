import type { TrainingRequestRecord, TrainingRequestStatus } from "@/types/training-request";

export const DRAFT_NO_LONGER_EXISTS_MESSAGE = "This draft no longer exists.";

export const DRAFT_DELETED_SUCCESS_MESSAGE = "Draft deleted.";

export const DELETE_DRAFT_DIALOG_TITLE = "Delete this draft?";

export function buildDeleteDraftDialogBody(courseName: string): string {
  const displayName = courseName.trim() || "Untitled course";

  return `This permanently deletes the draft training request for “${displayName}”. This action cannot be undone.`;
}

export function canDeleteTrainingRequestDraft(
  request: Pick<TrainingRequestRecord, "status" | "requesterPersonnelId">,
  ownerPersonnelId: string,
): boolean {
  return (
    request.status === "draft" &&
    request.requesterPersonnelId === ownerPersonnelId
  );
}

export function shouldShowDeleteDraftButton(
  status: TrainingRequestStatus,
): boolean {
  return status === "draft";
}

export function removeDeletedDraftFromList(
  requests: TrainingRequestRecord[],
  requestId: string,
): TrainingRequestRecord[] {
  return requests.filter((request) => request.id !== requestId);
}

export function isDraftDeletionConfirmed(userConfirmed: boolean): boolean {
  return userConfirmed;
}
