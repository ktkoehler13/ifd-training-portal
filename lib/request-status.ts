import type { TrainingRequestStatus } from "@/types/training-request";

export type StatusTone = "neutral" | "waiting" | "attention" | "success" | "danger";

/** Color meaning for request statuses: gray drafts, amber waiting, orange needs you, green approved, red denied. */
export function requestStatusTone(status: TrainingRequestStatus): StatusTone {
  switch (status) {
    case "submitted":
    case "pending_mto":
    case "pending_deputy_chief":
      return "waiting";
    case "returned_for_correction":
      return "attention";
    case "approved":
      return "success";
    case "denied":
      return "danger";
    default:
      return "neutral";
  }
}

/** Where a requester should go to work on their own request. */
export function ownRequestHref(request: { id: string; status: TrainingRequestStatus }): string {
  const id = encodeURIComponent(request.id);
  return request.status === "draft" ? `/requests/new?draft=${id}` : `/requests/${id}/confirmation`;
}

export function timeOfDayGreeting(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}
