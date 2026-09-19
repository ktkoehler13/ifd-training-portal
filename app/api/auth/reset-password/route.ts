import { NextResponse, type NextRequest } from "next/server";
import { completePasswordRecovery } from "@/lib/auth/password-recovery-server";
import { PASSWORD_RECOVERY_FAILED_MESSAGE } from "@/lib/auth/password-recovery-messages";

export async function POST(request: NextRequest) {
  let body: { newPassword?: unknown; confirmPassword?: unknown };

  try {
    body = (await request.json()) as {
      newPassword?: unknown;
      confirmPassword?: unknown;
    };
  } catch {
    return NextResponse.json(
      { error: PASSWORD_RECOVERY_FAILED_MESSAGE },
      { status: 400 },
    );
  }

  if (
    typeof body.newPassword !== "string" ||
    typeof body.confirmPassword !== "string"
  ) {
    return NextResponse.json(
      { error: PASSWORD_RECOVERY_FAILED_MESSAGE },
      { status: 400 },
    );
  }

  const result = await completePasswordRecovery({
    newPassword: body.newPassword,
    confirmPassword: body.confirmPassword,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ message: result.message });
}
