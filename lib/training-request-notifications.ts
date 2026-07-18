import { createClient } from "@/lib/supabase/client";
import type {
  TrainingRequestNotificationRecord,
  TrainingRequestNotificationRow,
  TrainingRequestNotificationStatus,
} from "@/types/training-request-action";
import { TRAINING_REQUEST_NOTIFICATION_STATUSES } from "@/types/training-request-action";

function parseNotificationStatus(
  value: unknown,
): TrainingRequestNotificationStatus {
  const status = typeof value === "string" ? value : "";

  if (
    TRAINING_REQUEST_NOTIFICATION_STATUSES.includes(
      status as TrainingRequestNotificationStatus,
    )
  ) {
    return status as TrainingRequestNotificationStatus;
  }

  return "pending";
}

export function mapTrainingRequestNotificationRow(
  row: TrainingRequestNotificationRow,
): TrainingRequestNotificationRecord {
  return {
    id: row.id,
    trainingRequestId: row.training_request_id,
    sourceActionId: row.source_action_id,
    eventType: row.event_type,
    recipientEmail: row.recipient_email,
    recipientPersonnelId: row.recipient_personnel_id,
    subject: row.subject,
    messageText: row.message_text,
    status: parseNotificationStatus(row.status),
    attempts: row.attempts,
    lastError: row.last_error,
    sentAt: row.sent_at,
    createdAt: row.created_at,
  };
}

export function formatNotificationStatus(
  status: TrainingRequestNotificationStatus,
): string {
  switch (status) {
    case "pending":
      return "Pending";
    case "processing":
      return "Processing";
    case "sent":
      return "Sent";
    case "failed":
      return "Failed";
    default:
      return status;
  }
}

export async function listTrainingRequestNotifications(
  requestId: string,
): Promise<TrainingRequestNotificationRecord[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("training_request_notifications")
    .select("*")
    .eq("training_request_id", requestId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data as TrainingRequestNotificationRow[]).map(
    mapTrainingRequestNotificationRow,
  );
}
