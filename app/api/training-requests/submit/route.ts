import { NextResponse, type NextRequest } from "next/server";
import type { TrainingRequestDraft } from "@/types/training-request";
import type { TrainingRequestSubmissionMode } from "@/lib/training-request-gsa-mileage";
import {
  submitTrainingRequestWithAuthoritativeGsaRate,
  TrainingRequestSubmitAccessError,
  TrainingRequestSubmitValidationError,
} from "@/lib/training-request-submit-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function accessDeniedResponse() {
  return NextResponse.json({ error: "Access denied." }, { status: 403 });
}

function badRequestResponse(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function isSubmissionMode(value: unknown): value is TrainingRequestSubmissionMode {
  return value === "create" || value === "draft" || value === "returned";
}

export async function POST(request: NextRequest) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return badRequestResponse("Invalid training request submission.");
  }

  if (!body || typeof body !== "object") {
    return badRequestResponse("Invalid training request submission.");
  }

  const value = body as {
    draft?: unknown;
    requestId?: unknown;
    submissionMode?: unknown;
  };

  if (
    !value.draft ||
    typeof value.draft !== "object" ||
    !isSubmissionMode(value.submissionMode)
  ) {
    return badRequestResponse("Invalid training request submission.");
  }

  const requestId =
    value.requestId === null || value.requestId === undefined
      ? null
      : typeof value.requestId === "string"
        ? value.requestId
        : null;

  if (
    (value.submissionMode === "draft" || value.submissionMode === "returned") &&
    !requestId
  ) {
    return badRequestResponse("Invalid training request submission.");
  }

  try {
    const submitted = await submitTrainingRequestWithAuthoritativeGsaRate({
      draft: value.draft as TrainingRequestDraft,
      requestId,
      submissionMode: value.submissionMode,
    });

    return NextResponse.json({ request: submitted });
  } catch (error) {
    if (error instanceof TrainingRequestSubmitAccessError) {
      return accessDeniedResponse();
    }

    if (error instanceof TrainingRequestSubmitValidationError) {
      return badRequestResponse(error.message);
    }

    const message =
      error instanceof Error
        ? error.message
        : "Unable to submit request. Try again later.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
