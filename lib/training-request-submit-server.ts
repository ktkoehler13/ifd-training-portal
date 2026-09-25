import "server-only";

import { getAuthenticatedPersonnel } from "@/lib/auth/personnel";
import { calculateExpenseSummaryFromDraft } from "@/lib/expenses";
import { createClient } from "@/lib/supabase/server";
import { getCurrentGsaMileageRate } from "@/lib/system-settings-server";
import {
  resolveSubmissionGsaMileageRate,
  type TrainingRequestSubmissionMode,
} from "@/lib/training-request-gsa-mileage";
import {
  buildTrainingRequestDatabasePayload,
  buildTrainingRequestInput,
  getTrainingRequestErrorMessage,
  mapTrainingRequestRow,
} from "@/lib/training-requests";
import type {
  TrainingRequestDraft,
  TrainingRequestRecord,
  TrainingRequestRow,
} from "@/types/training-request";

export class TrainingRequestSubmitAccessError extends Error {
  constructor(message = "Access denied.") {
    super(message);
    this.name = "TrainingRequestSubmitAccessError";
  }
}

export class TrainingRequestSubmitValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TrainingRequestSubmitValidationError";
  }
}

function isSubmissionMode(value: unknown): value is TrainingRequestSubmissionMode {
  return value === "create" || value === "draft" || value === "returned";
}

function isTrainingRequestDraft(value: unknown): value is TrainingRequestDraft {
  if (!value || typeof value !== "object") {
    return false;
  }

  const draft = value as Record<string, unknown>;
  return (
    typeof draft.badgeNumber === "string" &&
    typeof draft.departmentEmail === "string" &&
    typeof draft.courseName === "string" &&
    typeof draft.requestDepartmentVehicle === "boolean"
  );
}

async function loadOwnedEditableRequest(
  requestId: string,
  personnelId: string,
  expectedStatus: "draft" | "returned_for_correction",
): Promise<TrainingRequestRecord> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("training_requests")
    .select("*")
    .eq("id", requestId)
    .eq("requester_personnel_id", personnelId)
    .eq("status", expectedStatus)
    .maybeSingle();

  if (error) {
    throw new Error(getTrainingRequestErrorMessage(error));
  }

  if (!data) {
    throw new TrainingRequestSubmitValidationError(
      "Draft request not found or no longer editable.",
    );
  }

  return mapTrainingRequestRow(data as TrainingRequestRow);
}

async function callSubmitWorkflowRpc(
  requestId: string,
  rpcName: "submit_training_request" | "resubmit_training_request",
): Promise<TrainingRequestRecord> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(rpcName, {
    p_request_id: requestId,
  });

  if (error) {
    throw new Error(getTrainingRequestErrorMessage(error));
  }

  if (!data) {
    throw new Error("Workflow action did not return an updated request.");
  }

  return mapTrainingRequestRow(data as TrainingRequestRow);
}

export async function submitTrainingRequestWithAuthoritativeGsaRate(input: {
  draft: TrainingRequestDraft;
  requestId: string | null;
  submissionMode: TrainingRequestSubmissionMode;
}): Promise<TrainingRequestRecord> {
  const personnel = await getAuthenticatedPersonnel();
  if (!personnel) {
    throw new TrainingRequestSubmitAccessError();
  }

  if (!isTrainingRequestDraft(input.draft)) {
    throw new TrainingRequestSubmitValidationError(
      "Invalid training request submission.",
    );
  }

  if (!isSubmissionMode(input.submissionMode)) {
    throw new TrainingRequestSubmitValidationError(
      "Invalid training request submission.",
    );
  }

  let storedRequestGsaMileageRate: number | null = null;

  if (input.submissionMode === "draft" || input.submissionMode === "returned") {
    if (!input.requestId) {
      throw new TrainingRequestSubmitValidationError(
        "Invalid training request submission.",
      );
    }

    const existing = await loadOwnedEditableRequest(
      input.requestId,
      personnel.id,
      input.submissionMode === "returned"
        ? "returned_for_correction"
        : "draft",
    );
    storedRequestGsaMileageRate = existing.gsaMileageRate;
  } else if (input.requestId) {
    throw new TrainingRequestSubmitValidationError(
      "Invalid training request submission.",
    );
  }

  const currentServerRate = await getCurrentGsaMileageRate();
  const authoritativeGsaRate = resolveSubmissionGsaMileageRate({
    mode: input.submissionMode,
    storedRequestGsaMileageRate,
    currentServerRate,
  });

  if (authoritativeGsaRate === null || authoritativeGsaRate <= 0) {
    throw new TrainingRequestSubmitValidationError(
      "GSA mileage rate is not configured. Contact the Training Bureau.",
    );
  }

  const expenseSummary = calculateExpenseSummaryFromDraft(
    input.draft,
    authoritativeGsaRate,
  );

  const insertInput = buildTrainingRequestInput({
    personnel,
    draft: input.draft,
    expenseSummary,
    requireComplete: true,
  });

  const supabase = await createClient();

  if (input.submissionMode === "create") {
    const { data, error } = await supabase
      .from("training_requests")
      .insert({
        ...buildTrainingRequestDatabasePayload(insertInput),
        request_number: null,
        requester_name: "",
        status: "draft",
        current_action_role: null,
        submitted_at: null,
      })
      .select("*")
      .single();

    if (error) {
      throw new Error(getTrainingRequestErrorMessage(error));
    }

    return callSubmitWorkflowRpc(
      (data as TrainingRequestRow).id,
      "submit_training_request",
    );
  }

  const requestId = input.requestId!;
  const expectedStatus =
    input.submissionMode === "returned" ? "returned_for_correction" : "draft";

  const { error: updateError } = await supabase
    .from("training_requests")
    .update(buildTrainingRequestDatabasePayload(insertInput))
    .eq("id", requestId)
    .eq("requester_personnel_id", personnel.id)
    .eq("status", expectedStatus);

  if (updateError) {
    throw new Error(getTrainingRequestErrorMessage(updateError));
  }

  return callSubmitWorkflowRpc(
    requestId,
    input.submissionMode === "returned"
      ? "resubmit_training_request"
      : "submit_training_request",
  );
}
