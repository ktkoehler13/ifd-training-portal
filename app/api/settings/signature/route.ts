import { NextResponse } from "next/server";
import {
  createOwnPersonnelSignaturePreviewUrl,
  deleteOwnPersonnelSignature,
  getOwnPersonnelSignatureServer,
  PersonnelSignatureAccessError,
  saveOwnPersonnelSignatureMetadata,
} from "@/lib/personnel-signature-server";
import {
  PERSONNEL_SIGNATURE_MAX_BYTES,
  PERSONNEL_SIGNATURE_MAX_HEIGHT,
  PERSONNEL_SIGNATURE_MAX_WIDTH,
  PERSONNEL_SIGNATURE_MIN_HEIGHT,
  PERSONNEL_SIGNATURE_MIN_WIDTH,
} from "@/types/personnel-signature";

function accessDeniedResponse() {
  return NextResponse.json({ error: "Access denied." }, { status: 403 });
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
      ? await createOwnPersonnelSignaturePreviewUrl(signature.storagePath)
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
    const body = (await request.json()) as {
      fileSizeBytes?: unknown;
      imageWidth?: unknown;
      imageHeight?: unknown;
      originalFilename?: unknown;
    };

    const fileSizeBytes =
      typeof body.fileSizeBytes === "number"
        ? body.fileSizeBytes
        : Number(body.fileSizeBytes);
    const imageWidth =
      typeof body.imageWidth === "number" ? body.imageWidth : null;
    const imageHeight =
      typeof body.imageHeight === "number" ? body.imageHeight : null;
    const originalFilename =
      typeof body.originalFilename === "string" ? body.originalFilename : null;

    if (!Number.isFinite(fileSizeBytes) || fileSizeBytes <= 0) {
      return NextResponse.json(
        { error: "A valid signature file size is required." },
        { status: 400 },
      );
    }

    if (fileSizeBytes > PERSONNEL_SIGNATURE_MAX_BYTES) {
      return NextResponse.json(
        { error: "Signature file must be 1 MB or smaller." },
        { status: 400 },
      );
    }

    if (
      imageWidth !== null &&
      (!Number.isFinite(imageWidth) ||
        imageWidth < PERSONNEL_SIGNATURE_MIN_WIDTH ||
        imageWidth > PERSONNEL_SIGNATURE_MAX_WIDTH)
    ) {
      return NextResponse.json(
        { error: "Signature width is outside the allowed limits." },
        { status: 400 },
      );
    }

    if (
      imageHeight !== null &&
      (!Number.isFinite(imageHeight) ||
        imageHeight < PERSONNEL_SIGNATURE_MIN_HEIGHT ||
        imageHeight > PERSONNEL_SIGNATURE_MAX_HEIGHT)
    ) {
      return NextResponse.json(
        { error: "Signature height is outside the allowed limits." },
        { status: 400 },
      );
    }

    const signature = await saveOwnPersonnelSignatureMetadata({
      fileSizeBytes,
      imageWidth,
      imageHeight,
      originalFilename,
    });

    const previewUrl = await createOwnPersonnelSignaturePreviewUrl(
      signature.storagePath,
    );

    return NextResponse.json({ signature, previewUrl });
  } catch (error) {
    if (error instanceof PersonnelSignatureAccessError) {
      return accessDeniedResponse();
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
