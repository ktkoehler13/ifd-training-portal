import type { WorkflowActionKind } from "@/lib/training-request-workflow";
import type { TrainingRequestRecord } from "@/types/training-request";

export const SIGNATURE_WORKFLOW_AMBIGUOUS_MESSAGE =
  "The signed action may have completed, but its result could not be confirmed. Refresh the request before attempting the action again.";

export interface SignatureWorkflowReconciliationCommitted {
  status: "committed";
  request: TrainingRequestRecord;
}

export interface SignatureWorkflowReconciliationDefinitelyNotCommitted {
  status: "definitely_not_committed";
}

export interface SignatureWorkflowReconciliationAmbiguous {
  status: "ambiguous";
}

export type SignatureWorkflowReconciliationResult =
  | SignatureWorkflowReconciliationCommitted
  | SignatureWorkflowReconciliationDefinitelyNotCommitted
  | SignatureWorkflowReconciliationAmbiguous;

export interface SignatureWorkflowActionLookupRow {
  id: string;
}

export interface SignatureWorkflowReservationLookupRow {
  consumed_at: string | null;
}

export interface ReconcileSignatureWorkflowCompletionInput {
  requestId: string;
  reservationId: string;
  snapshotPath: string;
  findMatchingAction: () => Promise<SignatureWorkflowActionLookupRow | null>;
  findReservation: () => Promise<SignatureWorkflowReservationLookupRow | null>;
  loadRequest: () => Promise<TrainingRequestRecord | null>;
}

export async function reconcileSignatureWorkflowCompletion(
  input: ReconcileSignatureWorkflowCompletionInput,
): Promise<SignatureWorkflowReconciliationResult> {
  const matchingAction = await input.findMatchingAction();

  if (matchingAction) {
    const request = await input.loadRequest();
    if (!request) {
      return { status: "ambiguous" };
    }

    return {
      status: "committed",
      request,
    };
  }

  const reservation = await input.findReservation();
  if (reservation?.consumed_at) {
    return { status: "ambiguous" };
  }

  return { status: "definitely_not_committed" };
}

export interface HandleSignatureWorkflowCompletionFailureInput {
  requestId: string;
  reservationId: string;
  snapshotPath: string;
  action: WorkflowActionKind;
  originalError: unknown;
  findMatchingAction: () => Promise<SignatureWorkflowActionLookupRow | null>;
  findReservation: () => Promise<SignatureWorkflowReservationLookupRow | null>;
  loadRequest: () => Promise<TrainingRequestRecord | null>;
  deleteSnapshot: (storagePath: string) => Promise<void>;
  generateApprovedPacket?: (requestId: string) => Promise<void>;
  createAmbiguousError?: (message: string) => Error;
}

export async function handleSignatureWorkflowCompletionFailure(
  input: HandleSignatureWorkflowCompletionFailureInput,
): Promise<TrainingRequestRecord> {
  const reconciliation = await reconcileSignatureWorkflowCompletion({
    requestId: input.requestId,
    reservationId: input.reservationId,
    snapshotPath: input.snapshotPath,
    findMatchingAction: input.findMatchingAction,
    findReservation: input.findReservation,
    loadRequest: input.loadRequest,
  });

  if (reconciliation.status === "committed") {
    if (
      input.action === "deputy_approve" &&
      reconciliation.request.status === "approved" &&
      input.generateApprovedPacket
    ) {
      try {
        await input.generateApprovedPacket(input.requestId);
      } catch {
        // Approval remains successful even when packet generation fails.
      }
    }

    return reconciliation.request;
  }

  if (reconciliation.status === "ambiguous") {
    const createAmbiguousError =
      input.createAmbiguousError ??
      ((message: string) => new Error(message));

    throw createAmbiguousError(SIGNATURE_WORKFLOW_AMBIGUOUS_MESSAGE);
  }

  await input.deleteSnapshot(input.snapshotPath);

  if (input.originalError instanceof Error) {
    throw input.originalError;
  }

  throw new Error("Unable to complete this signed workflow action.");
}
