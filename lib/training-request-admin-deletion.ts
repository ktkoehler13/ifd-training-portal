import { createClient } from "@/lib/supabase/client";
import { isAdministrativeRole } from "@/lib/auth/roles";
import { getTrainingRequestErrorMessage } from "@/lib/training-requests";
import type { PersonnelRole } from "@/types/personnel";
import type { TrainingRequestRecord } from "@/types/training-request";

export function canManageDeletedRequests(role: PersonnelRole): boolean {
  return isAdministrativeRole(role);
}

export async function setTrainingRequestDeleted(request: TrainingRequestRecord, deleted: boolean, reason: string): Promise<void> {
  if (!reason.trim() || reason.trim().length > 1000) throw new Error("Enter a reason (up to 1000 characters).");
  const { error } = await createClient().rpc("admin_set_training_request_deleted", {
    p_request_id: request.id,
    p_expected_updated_at: request.updatedAt,
    p_deleted: deleted,
    p_reason: reason.trim(),
  });
  if (error) throw new Error(getTrainingRequestErrorMessage(error));
}
