import { NextResponse, type NextRequest } from "next/server";
import {
  INITIAL_PASSWORD_INVALID_SERVER_MESSAGE,
  validateInitialPassword,
} from "@/lib/auth/password";
import {
  PasswordResetError,
  resetPersonnelAuthPassword,
} from "@/lib/auth/admin-personnel-server";
import {
  PASSWORD_RESET_FAILED_MESSAGE,
  PASSWORD_RESET_SUCCESS_MESSAGE,
} from "@/lib/auth/password-reset-messages";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  if (!id) {
    return NextResponse.json(
      { error: "Personnel record not found." },
      { status: 400 },
    );
  }

  let body: { temporaryPassword?: unknown };

  try {
    body = (await request.json()) as { temporaryPassword?: unknown };
  } catch {
    return NextResponse.json(
      { error: PASSWORD_RESET_FAILED_MESSAGE },
      { status: 400 },
    );
  }

  const temporaryPassword =
    typeof body.temporaryPassword === "string" ? body.temporaryPassword : "";

  const temporaryPasswordError = validateInitialPassword(temporaryPassword);
  if (!temporaryPassword || temporaryPasswordError) {
    return NextResponse.json(
      { error: INITIAL_PASSWORD_INVALID_SERVER_MESSAGE },
      { status: 400 },
    );
  }

  try {
    await resetPersonnelAuthPassword({
      personnelId: id,
      temporaryPassword,
    });

    return NextResponse.json({
      ok: true,
      message: PASSWORD_RESET_SUCCESS_MESSAGE,
    });
  } catch (error) {
    if (error instanceof PasswordResetError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: PASSWORD_RESET_FAILED_MESSAGE },
      { status: 400 },
    );
  }
}
