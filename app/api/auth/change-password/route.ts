import { NextResponse, type NextRequest } from "next/server";
import { changeAuthenticatedUserPassword } from "@/lib/auth/password-change-server";

export async function POST(request: NextRequest) {
  let body: {
    currentPassword?: unknown;
    newPassword?: unknown;
    confirmPassword?: unknown;
    requiredPasswordChange?: unknown;
  };

  try {
    body = (await request.json()) as {
      currentPassword?: unknown;
      newPassword?: unknown;
      confirmPassword?: unknown;
      requiredPasswordChange?: unknown;
    };
  } catch {
    return NextResponse.json(
      { error: "Invalid password change request." },
      { status: 400 },
    );
  }

  const currentPassword =
    typeof body.currentPassword === "string" ? body.currentPassword : "";
  const newPassword =
    typeof body.newPassword === "string" ? body.newPassword : "";
  const confirmPassword =
    typeof body.confirmPassword === "string" ? body.confirmPassword : "";
  const requiredPasswordChange = body.requiredPasswordChange === true;

  const result = await changeAuthenticatedUserPassword({
    currentPassword,
    newPassword,
    confirmPassword,
    requiredPasswordChange,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, message: result.message });
}
