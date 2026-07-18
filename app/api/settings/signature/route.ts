import { NextResponse } from "next/server";
import {
  CERTIFICATION_REQUIRED_MESSAGE,
  parseCertificationConfirmedFormValue,
  sanitizeOriginalFilename,
} from "@/lib/personnel-signature-png";
import {
  createOwnPersonnelSignaturePreviewUrl,
  deleteOwnPersonnelSignature,
  getOwnPersonnelSignatureServer,
  PersonnelSignatureAccessError,
  PersonnelSignatureCertificationError,
  PersonnelSignatureValidationError,
  saveOwnPersonnelSignature,
} from "@/lib/personnel-signature-server";

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

export async function GET() {
  try {
    const signature = await getOwnPersonnelSignatureServer();
    const previewUrl = signature
      ? await createOwnPersonnelSignaturePreviewUrl()
      : null;

    return NextResponse.json({ signature, previewUrl });
  } catch (error) {
    if (error instanceof PersonnelSignatureAccessError) {
      return accessDeniedResponse();
    }

    return serverErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const certificationConfirmed = parseCertificationConfirmedFormValue(
      formData.get("certificationConfirmed"),
    );

    if (certificationConfirmed !== true) {
      return badRequestResponse(CERTIFICATION_REQUIRED_MESSAGE);
    }

    const fileEntry = formData.get("file");
    if (!(fileEntry instanceof File) || fileEntry.size === 0) {
      return badRequestResponse("A signature PNG file is required.");
    }

    const pngBytes = new Uint8Array(await fileEntry.arrayBuffer());
    const originalFilename = sanitizeOriginalFilename(
      formData.get("originalFilename") ?? fileEntry.name,
    );

    const signature = await saveOwnPersonnelSignature({
      pngBytes,
      originalFilename,
      certificationConfirmed: true,
    });
    const previewUrl = await createOwnPersonnelSignaturePreviewUrl();

    return NextResponse.json({ signature, previewUrl });
  } catch (error) {
    if (error instanceof PersonnelSignatureAccessError) {
      return accessDeniedResponse();
    }

    if (error instanceof PersonnelSignatureCertificationError) {
      return badRequestResponse(error.message);
    }

    if (error instanceof PersonnelSignatureValidationError) {
      return badRequestResponse(error.message);
    }

    return serverErrorResponse(error);
  }
}

export async function DELETE() {
  try {
    await deleteOwnPersonnelSignature();
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof PersonnelSignatureAccessError) {
      return accessDeniedResponse();
    }

    return serverErrorResponse(error);
  }
}
