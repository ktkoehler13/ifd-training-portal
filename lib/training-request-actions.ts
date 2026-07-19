import { createClient } from "@/lib/supabase/client";
import type {
  TrainingRequestActionRecord,
  TrainingRequestActionRow,
  TrainingRequestActionType,
} from "@/types/training-request-action";
import type { PersonnelRole } from "@/types/personnel";
import { TRAINING_REQUEST_ACTIONS } from "@/types/training-request-action";

function parseAction(value: unknown): TrainingRequestActionType {
  const action = typeof value === "string" ? value : "";

  if (TRAINING_REQUEST_ACTIONS.includes(action as TrainingRequestActionType)) {
    return action as TrainingRequestActionType;
  }

  return "submitted";
}

export function mapTrainingRequestActionRow(
  row: TrainingRequestActionRow,
): TrainingRequestActionRecord {
  return {
    id: row.id,
    trainingRequestId: row.training_request_id,
    actorPersonnelId: row.actor_personnel_id,
    actorName: row.actor_name,
    actorBadgeNumber: row.actor_badge_number,
    actorRole: row.actor_role,
    action: parseAction(row.action),
    comments: row.comments,
    signatureName: row.signature_name,
    signedAt: row.signed_at,
    electronicSignatureConfirmed: row.electronic_signature_confirmed,
    signatureStorageBucket: row.signature_storage_bucket,
    signatureStoragePath: row.signature_storage_path,
    signatureSha256: row.signature_sha256,
    signatureMimeType: row.signature_mime_type,
    signatureFileSizeBytes: row.signature_file_size_bytes,
    createdAt: row.created_at,
  };
}

export async function listTrainingRequestActions(
  requestId: string,
): Promise<TrainingRequestActionRecord[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("training_request_actions")
    .select("*")
    .eq("training_request_id", requestId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data as TrainingRequestActionRow[]).map(mapTrainingRequestActionRow);
}

export const MISSING_CORRECTION_COMMENTS_MESSAGE =
  "Reviewers did not provide correction details. Contact the reviewer before resubmitting.";

function isCorrectionReturnAction(action: TrainingRequestActionRecord) {
  return (
    action.action === "mto_returned" ||
    action.action === "deputy_chief_returned"
  );
}

export function getLatestCorrectionAction(
  actions: TrainingRequestActionRecord[],
): TrainingRequestActionRecord | null {
  for (let index = actions.length - 1; index >= 0; index -= 1) {
    const action = actions[index];
    if (isCorrectionReturnAction(action)) {
      return action;
    }
  }

  return null;
}

export function getCorrectionCommentsDisplay(
  action: TrainingRequestActionRecord | null,
): string {
  const comments = action?.comments?.trim();
  if (comments) {
    return comments;
  }

  return MISSING_CORRECTION_COMMENTS_MESSAGE;
}

export function formatCorrectionReviewerLabel(
  action: TrainingRequestActionRecord,
): string {
  const role = formatCurrentActionRole(action.actorRole);
  if (role) {
    return `${action.actorName} (${role})`;
  }

  return action.actorName;
}

export function getCorrectionReturnedAt(
  action: TrainingRequestActionRecord,
): string {
  return formatActionTimestamp(action.signedAt ?? action.createdAt);
}

export function truncateCorrectionPreview(
  text: string,
  maxLength = 120,
): string {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength).trimEnd()}…`;
}

export function getLatestCorrectionComments(
  actions: TrainingRequestActionRecord[],
): string | null {
  const action = getLatestCorrectionAction(actions);
  const comments = action?.comments?.trim();

  if (!comments) {
    return null;
  }

  return comments;
}

export function formatCurrentActionRole(
  role: PersonnelRole | null,
): string | null {
  if (!role) {
    return null;
  }

  switch (role) {
    case "firefighter":
      return "Requester";
    case "mto":
      return "MTO";
    case "deputy_chief":
      return "Deputy Chief";
    case "admin":
      return "Admin";
    default:
      return role;
  }
}

export function formatActionTimestamp(value: string | null) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
