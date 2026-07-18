import type { WorkflowActionKind } from "@/lib/training-request-workflow";
import {
  isSignatureRequiredWorkflowKind,
  mapWorkflowKindToExpectedAction,
  SIGNATURE_REQUIRED_MESSAGE,
} from "@/lib/training-request-signature-snapshot";

export const RETURN_WORKFLOW_KINDS = ["mto_return", "deputy_return"] as const satisfies readonly WorkflowActionKind[];

export function isReturnWorkflowKind(action: WorkflowActionKind): boolean {
  return RETURN_WORKFLOW_KINDS.includes(action as (typeof RETURN_WORKFLOW_KINDS)[number]);
}

export function isDenialWorkflowKind(action: WorkflowActionKind): boolean {
  return action === "mto_deny" || action === "deputy_deny";
}

export function validateSignatureWorkflowActionInput(input: {
  action: WorkflowActionKind;
  comments: string | null;
  electronicSignatureConfirmed: boolean;
}): void {
  if (!isSignatureRequiredWorkflowKind(input.action)) {
    throw new Error("Unsupported signature workflow action.");
  }

  if (input.electronicSignatureConfirmed !== true) {
    throw new Error("Electronic signature acknowledgment is required to complete this action.");
  }

  if (isDenialWorkflowKind(input.action) && !input.comments?.trim()) {
    throw new Error("Comments are required when denying a training request.");
  }
}

export function getExpectedActionForWorkflowKind(action: WorkflowActionKind): string {
  const expectedAction = mapWorkflowKindToExpectedAction(action);
  if (!expectedAction) {
    throw new Error("Unsupported signature workflow action.");
  }

  return expectedAction;
}

export { SIGNATURE_REQUIRED_MESSAGE, isSignatureRequiredWorkflowKind };
