import type { PersonnelRole } from "@/types/personnel";

export const TRAINING_REQUEST_ACTIONS = [
  "submitted",
  "mto_approved",
  "mto_returned",
  "mto_denied",
  "deputy_chief_approved",
  "deputy_chief_returned",
  "deputy_chief_denied",
  "resubmitted",
  "cancelled",
] as const;

export type TrainingRequestActionType =
  (typeof TRAINING_REQUEST_ACTIONS)[number];

export const TRAINING_REQUEST_ACTION_LABELS: Record<
  TrainingRequestActionType,
  string
> = {
  submitted: "Submitted",
  mto_approved: "MTO Approved",
  mto_returned: "Returned by MTO",
  mto_denied: "Denied by MTO",
  deputy_chief_approved: "Deputy Chief Approved",
  deputy_chief_returned: "Returned by Deputy Chief",
  deputy_chief_denied: "Denied by Deputy Chief",
  resubmitted: "Resubmitted",
  cancelled: "Cancelled",
};

export interface TrainingRequestActionRow {
  id: string;
  training_request_id: string;
  actor_personnel_id: string;
  actor_name: string;
  actor_badge_number: string;
  actor_role: PersonnelRole;
  action: TrainingRequestActionType;
  comments: string | null;
  signature_name: string | null;
  signed_at: string | null;
  electronic_signature_confirmed: boolean;
  signature_storage_bucket: string | null;
  signature_storage_path: string | null;
  signature_sha256: string | null;
  signature_mime_type: string | null;
  signature_file_size_bytes: number | null;
  created_at: string;
}

export interface TrainingRequestActionRecord {
  id: string;
  trainingRequestId: string;
  actorPersonnelId: string;
  actorName: string;
  actorBadgeNumber: string;
  actorRole: PersonnelRole;
  action: TrainingRequestActionType;
  comments: string | null;
  signatureName: string | null;
  signedAt: string | null;
  electronicSignatureConfirmed: boolean;
  signatureStorageBucket: string | null;
  signatureStoragePath: string | null;
  signatureSha256: string | null;
  signatureMimeType: string | null;
  signatureFileSizeBytes: number | null;
  createdAt: string;
}

export const TRAINING_REQUEST_NOTIFICATION_STATUSES = [
  "pending",
  "processing",
  "sent",
  "failed",
] as const;

export type TrainingRequestNotificationStatus =
  (typeof TRAINING_REQUEST_NOTIFICATION_STATUSES)[number];

export const TRAINING_REQUEST_NOTIFICATION_EVENTS = [
  "pending_mto",
  "pending_deputy_chief",
  "returned_for_correction",
  "denied",
  "approved",
] as const;

export type TrainingRequestNotificationEvent =
  (typeof TRAINING_REQUEST_NOTIFICATION_EVENTS)[number];

export interface TrainingRequestNotificationRow {
  id: string;
  training_request_id: string;
  source_action_id: string;
  event_type: TrainingRequestNotificationEvent;
  recipient_email: string;
  recipient_personnel_id: string | null;
  subject: string;
  message_text: string;
  status: TrainingRequestNotificationStatus;
  attempts: number;
  last_error: string | null;
  sent_at: string | null;
  created_at: string;
}

export interface TrainingRequestNotificationRecord {
  id: string;
  trainingRequestId: string;
  sourceActionId: string;
  eventType: TrainingRequestNotificationEvent;
  recipientEmail: string;
  recipientPersonnelId: string | null;
  subject: string;
  messageText: string;
  status: TrainingRequestNotificationStatus;
  attempts: number;
  lastError: string | null;
  sentAt: string | null;
  createdAt: string;
}
