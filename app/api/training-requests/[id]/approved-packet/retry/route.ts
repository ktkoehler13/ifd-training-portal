import { NextResponse } from "next/server";
import { isAdministrativeRole } from "@/lib/auth/roles";
import { getAuthenticatedPersonnel } from "@/lib/auth/personnel";
import {
  retryApprovedTrainingRequestPacket,
  TrainingRequestWorkflowAccessError,
  TrainingRequestWorkflowValidationError,
} from "@/lib/training-request-workflow-server";

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

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const personnel = await getAuthenticatedPersonnel();
    if (!personnel || !isAdministrativeRole(personnel.role)) {
      return accessDeniedResponse();
    }

    const { id } = await context.params;
    await retryApprovedTrainingRequestPacket(id);

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof TrainingRequestWorkflowAccessError) {
      return accessDeniedResponse();
    }

    if (error instanceof TrainingRequestWorkflowValidationError) {
      return badRequestResponse(error.message);
    }

    return serverErrorResponse(error);
  }
}
