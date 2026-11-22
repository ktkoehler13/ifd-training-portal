import type { MtoExpenseValues } from "@/lib/mto-expense-review";
import { createClient } from "@/lib/supabase/client";
import {
  mapTrainingRequestRow,
  getTrainingRequestErrorMessage,
} from "@/lib/training-requests";
import { isSignatureRequiredWorkflowKind } from "@/lib/training-request-signature-snapshot";
import type { TrainingRequestRecord, TrainingRequestRow } from "@/types/training-request";

export type WorkflowActionKind =
  | "submit"
  | "resubmit"
  | "mto_approve"
  | "mto_return"
  | "mto_deny"
  | "deputy_approve"
  | "deputy_return"
  | "deputy_deny"
  | "change_to_denied"
  | "change_to_approved"
  | "resign_expenses";

function mapWorkflowRow(data: unknown): TrainingRequestRecord {
  return mapTrainingRequestRow(data as TrainingRequestRow);
}

async function callWorkflowRpc(
  functionName: string,
  args: Record<string, string | null | boolean>,
): Promise<TrainingRequestRecord> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc(functionName, args);

  if (error) {
    throw new Error(getTrainingRequestErrorMessage(error));
  }

  if (!data) {
    throw new Error("Workflow action did not return an updated request.");
  }

  return mapWorkflowRow(data);
}

async function callSignatureWorkflowApi(
  requestId: string,
  action: WorkflowActionKind,
  comments: string | null,
  electronicSignatureConfirmed: boolean,
  expectedUpdatedAt: string,
  expenses?: MtoExpenseValues,
): Promise<TrainingRequestRecord> {
  const response = await fetch(
    `/api/training-requests/${encodeURIComponent(requestId)}/workflow`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action,
        comments,
        electronicSignatureConfirmed,
        expectedUpdatedAt,
        ...(expenses ? { expenses } : {}),
      }),
    },
  );

  const payload = (await response.json()) as {
    error?: string;
    request?: TrainingRequestRow;
  };

  if (!response.ok) {
    throw new Error(payload.error ?? "Unable to complete this workflow action.");
  }

  if (!payload.request) {
    throw new Error("Workflow action did not return an updated request.");
  }

  return mapWorkflowRow(payload.request);
}

export async function submitTrainingRequestWorkflow(
  requestId: string,
): Promise<TrainingRequestRecord> {
  return callWorkflowRpc("submit_training_request", {
    p_request_id: requestId,
  });
}

export async function resubmitTrainingRequestWorkflow(
  requestId: string,
): Promise<TrainingRequestRecord> {
  return callWorkflowRpc("resubmit_training_request", {
    p_request_id: requestId,
  });
}

export async function mtoApproveTrainingRequest(
  requestId: string,
  comments: string | null | undefined,
  electronicSignatureConfirmed: boolean,
  expectedUpdatedAt: string,
): Promise<TrainingRequestRecord> {
  return callSignatureWorkflowApi(
    requestId,
    "mto_approve",
    comments?.trim() || null,
    electronicSignatureConfirmed,
    expectedUpdatedAt,
  );
}

export async function mtoReturnTrainingRequest(
  requestId: string,
  comments: string,
): Promise<TrainingRequestRecord> {
  return callWorkflowRpc("mto_return_training_request", {
    p_request_id: requestId,
    p_comments: comments.trim(),
  });
}

export async function mtoDenyTrainingRequest(
  requestId: string,
  comments: string,
  electronicSignatureConfirmed: boolean,
  expectedUpdatedAt: string,
): Promise<TrainingRequestRecord> {
  return callSignatureWorkflowApi(
    requestId,
    "mto_deny",
    comments.trim(),
    electronicSignatureConfirmed,
    expectedUpdatedAt,
  );
}

export async function deputyApproveTrainingRequest(
  requestId: string,
  comments: string | null | undefined,
  electronicSignatureConfirmed: boolean,
  expectedUpdatedAt: string,
): Promise<TrainingRequestRecord> {
  return callSignatureWorkflowApi(
    requestId,
    "deputy_approve",
    comments?.trim() || null,
    electronicSignatureConfirmed,
    expectedUpdatedAt,
  );
}

export async function deputyReturnTrainingRequest(
  requestId: string,
  comments: string,
): Promise<TrainingRequestRecord> {
  return callWorkflowRpc("deputy_return_training_request", {
    p_request_id: requestId,
    p_comments: comments.trim(),
  });
}

export async function deputyDenyTrainingRequest(
  requestId: string,
  comments: string,
  electronicSignatureConfirmed: boolean,
  expectedUpdatedAt: string,
): Promise<TrainingRequestRecord> {
  return callSignatureWorkflowApi(
    requestId,
    "deputy_deny",
    comments.trim(),
    electronicSignatureConfirmed,
    expectedUpdatedAt,
  );
}

/**
 * Signed change to a final decision, or a re-signed edit of an approved
 * request's expenses (D27). The database derives MTO/DC from the signer.
 */
export async function changeTrainingRequestDecision(
  request: TrainingRequestRecord,
  action: "change_to_denied" | "change_to_approved" | "resign_expenses",
  reason: string,
  electronicSignatureConfirmed: boolean,
  expenses?: MtoExpenseValues,
): Promise<TrainingRequestRecord> {
  return callSignatureWorkflowApi(
    request.id,
    action,
    reason.trim(),
    electronicSignatureConfirmed,
    request.updatedAt,
    expenses,
  );
}

export { isSignatureRequiredWorkflowKind };

export async function countPendingApprovalsForRole(
  role: "mto" | "deputy_chief",
): Promise<number> {
  const supabase = createClient();
  const { count, error } = await supabase
    .from("training_requests")
    .select("id", { count: "exact", head: true })
    .is("deleted_at", null)
    .eq("current_action_role", role);

  if (error) {
    throw new Error(getTrainingRequestErrorMessage(error));
  }

  return count ?? 0;
}

export async function listPendingApprovalsForRole(
  role: "mto" | "deputy_chief",
): Promise<TrainingRequestRecord[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("training_requests")
    .select("*")
    .eq("current_action_role", role)
    .is("deleted_at", null)
    .order("submitted_at", { ascending: true, nullsFirst: false });

  if (error) {
    throw new Error(getTrainingRequestErrorMessage(error));
  }

  return (data as TrainingRequestRow[]).map(mapTrainingRequestRow);
}

export async function listAllTrainingRequestsForAdmin(deleted = false): Promise<
  TrainingRequestRecord[]
> {
  const supabase = createClient();
  const query = supabase
    .from("training_requests")
    .select("*")
    .order("submitted_at", { ascending: false, nullsFirst: false });
  const { data, error } = await (deleted ? query.not("deleted_at", "is", null) : query.is("deleted_at", null));

  if (error) {
    throw new Error(getTrainingRequestErrorMessage(error));
  }

  return (data as TrainingRequestRow[]).map(mapTrainingRequestRow);
}

export function canPerformMtoReview(
  role: string,
  status: TrainingRequestRecord["status"],
): boolean {
  return role === "mto" && status === "pending_mto";
}

export function canPerformDeputyChiefReview(
  role: string,
  status: TrainingRequestRecord["status"],
): boolean {
  return role === "deputy_chief" && status === "pending_deputy_chief";
}

/** True while today's date in Ithaca is before the course start date. */
export function isBeforeCourseStart(startDate: string | null | undefined, now = new Date()): boolean {
  if (!startDate) return false;
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return startDate > today;
}

/** MTO or Deputy Chief may change a final decision before the course starts (D27). */
export function canChangeDecision(
  role: string,
  request: Pick<TrainingRequestRecord, "status" | "courseStartDate" | "deletedAt">,
  now = new Date(),
): boolean {
  return (
    (role === "mto" || role === "deputy_chief") &&
    (request.status === "approved" || request.status === "denied") &&
    !request.deletedAt &&
    isBeforeCourseStart(request.courseStartDate, now)
  );
}

export async function deputyUpdateTrainingRequestExpenses(
  request: TrainingRequestRecord,
  expenses: MtoExpenseValues,
  reason: string,
): Promise<TrainingRequestRecord> {
  const { data, error } = await createClient().rpc("deputy_update_training_request_expenses", {
    p_request_id: request.id,
    p_expected_updated_at: request.updatedAt,
    p_expenses: expenses,
    p_reason: reason,
  });
  if (error) throw new Error(getTrainingRequestErrorMessage(error));
  if (!data) throw new Error("Unable to confirm expense changes. Reload the request to check whether they were saved.");
  return mapWorkflowRow(data);
}

export async function mtoUpdateTrainingRequestExpenses(
  request: TrainingRequestRecord,
  expenses: MtoExpenseValues,
  reason: string,
): Promise<TrainingRequestRecord> {
  const { data, error } = await createClient().rpc("mto_update_training_request_expenses", {
    p_request_id: request.id,
    p_expected_updated_at: request.updatedAt,
    p_expenses: expenses,
    p_reason: reason,
  });
  if (error) throw new Error(getTrainingRequestErrorMessage(error));
  if (!data) throw new Error("Unable to confirm expense changes. Reload the request to check whether they were saved.");
  return mapWorkflowRow(data);
}
