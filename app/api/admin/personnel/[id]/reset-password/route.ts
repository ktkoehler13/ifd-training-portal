import { NextResponse, type NextRequest } from "next/server";
import {
  PasswordResetError,
  resetPersonnelAuthPassword,
} from "@/lib/auth/admin-personnel-server";
import { PASSWORD_RESET_FAILED_MESSAGE } from "@/lib/auth/password-reset-messages";

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  if (!id) {
    return NextResponse.json(
      { error: "Personnel record not found." },
      { status: 400 },
    );
  }

  try {
    const result = await resetPersonnelAuthPassword({ personnelId: id });

    return NextResponse.json({
      ok: true,
      temporaryPassword: result.temporaryPassword,
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
