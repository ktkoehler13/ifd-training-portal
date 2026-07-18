import { NextResponse } from "next/server";
import {
  downloadApprovedTrainingRequestPacket,
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

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const { bytes, filename } = await downloadApprovedTrainingRequestPacket({
      requestId: id,
    });

    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename.replace(/"/g, "")}"`,
        "Cache-Control": "private, no-store",
      },
    });
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
