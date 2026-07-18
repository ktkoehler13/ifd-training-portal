import { NextResponse } from "next/server";
import {
  executeSignatureWorkflowAction,
  TrainingRequestWorkflowAccessError,
  TrainingRequestWorkflowAmbiguousError,
  TrainingRequestWorkflowValidationError,
} from "@/lib/training-request-workflow-server";
import { SIGNATURE_WORKFLOW_AMBIGUOUS_MESSAGE } from "@/lib/training-request-workflow-reconciliation";
import type { WorkflowActionKind } from "@/lib/training-request-workflow";
import { isSignatureRequiredWorkflowKind } from "@/lib/training-request-signature-snapshot";

function accessDeniedResponse() {
  return NextResponse.json({ error: "Access denied." }, { status: 403 });
}

function badRequestResponse(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function serverErrorResponse(error: unknown) {
  const message =
    error instanceof Error ? error.message : "Unexpected server error.";
  return NextResponse.json({ error: message }, { status: 500 });
}

function isWorkflowActionKind(value: unknown): value is WorkflowActionKind {
  return (
    value === "mto_approve" ||
    value === "mto_deny" ||
    value === "deputy_approve" ||
    value === "deputy_deny"
  );
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as {
      action?: unknown;
      comments?: unknown;
      electronicSignatureConfirmed?: unknown;
    };

    if (!isWorkflowActionKind(body.action)) {
      return badRequestResponse("A supported signature workflow action is required.");
    }

    if (!isSignatureRequiredWorkflowKind(body.action)) {
      return badRequestResponse("This workflow action must use the signature route.");
    }

    const updatedRequest = await executeSignatureWorkflowAction({
      requestId: id,
      action: body.action,
      comments: typeof body.comments === "string" ? body.comments : null,
      electronicSignatureConfirmed: body.electronicSignatureConfirmed === true,
    });

    return NextResponse.json({ request: updatedRequest });
  } catch (error) {
    if (error instanceof TrainingRequestWorkflowAccessError) {
      return accessDeniedResponse();
    }

    if (error instanceof TrainingRequestWorkflowValidationError) {
      return badRequestResponse(error.message);
    }

    if (error instanceof TrainingRequestWorkflowAmbiguousError) {
      return NextResponse.json({ error: SIGNATURE_WORKFLOW_AMBIGUOUS_MESSAGE }, { status: 409 });
    }

    return serverErrorResponse(error);
  }
}
