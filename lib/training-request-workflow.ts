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
  | "deputy_deny";

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
): Promise<TrainingRequestRecord> {
  return callSignatureWorkflowApi(
    requestId,
    "mto_approve",
    comments?.trim() || null,
    electronicSignatureConfirmed,
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
): Promise<TrainingRequestRecord> {
  return callSignatureWorkflowApi(
    requestId,
    "mto_deny",
    comments.trim(),
    electronicSignatureConfirmed,
  );
}

export async function deputyApproveTrainingRequest(
  requestId: string,
  comments: string | null | undefined,
  electronicSignatureConfirmed: boolean,
): Promise<TrainingRequestRecord> {
  return callSignatureWorkflowApi(
    requestId,
    "deputy_approve",
    comments?.trim() || null,
    electronicSignatureConfirmed,
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
): Promise<TrainingRequestRecord> {
  return callSignatureWorkflowApi(
    requestId,
    "deputy_deny",
    comments.trim(),
    electronicSignatureConfirmed,
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
    .order("submitted_at", { ascending: true, nullsFirst: false });

  if (error) {
    throw new Error(getTrainingRequestErrorMessage(error));
  }

  return (data as TrainingRequestRow[]).map(mapTrainingRequestRow);
}

export async function listAllTrainingRequestsForAdmin(): Promise<
  TrainingRequestRecord[]
> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("training_requests")
    .select("*")
    .order("submitted_at", { ascending: false, nullsFirst: false });

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
