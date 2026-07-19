import { NextResponse, type NextRequest } from "next/server";
import { createPersonnelAuthAccount } from "@/lib/auth/admin-personnel-server";
import { INITIAL_PASSWORD_INVALID_SERVER_MESSAGE, validateInitialPassword } from "@/lib/auth/password";
import { getPersonnelErrorMessage, isPersonnelRole } from "@/lib/personnel";
import type { CreatePersonnelAccountInput } from "@/types/personnel";

function parseCreatePersonnelAccountInput(
  body: unknown,
): CreatePersonnelAccountInput | null {
  if (!body || typeof body !== "object") {
    return null;
  }

  const value = body as Record<string, unknown>;

  if (
    typeof value.firstName !== "string" ||
    typeof value.lastName !== "string" ||
    typeof value.badgeNumber !== "string" ||
    typeof value.email !== "string" ||
    typeof value.role !== "string" ||
    typeof value.active !== "boolean" ||
    typeof value.initialPassword !== "string"
  ) {
    return null;
  }

  if (!isPersonnelRole(value.role)) {
    return null;
  }

  return {
    firstName: value.firstName,
    lastName: value.lastName,
    badgeNumber: value.badgeNumber,
    email: value.email,
    role: value.role,
    active: value.active,
    initialPassword: value.initialPassword,
  };
}

export async function POST(request: NextRequest) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid personnel creation request." },
      { status: 400 },
    );
  }

  const input = parseCreatePersonnelAccountInput(body);

  if (!input) {
    return NextResponse.json(
      { error: "Invalid personnel creation request." },
      { status: 400 },
    );
  }

  const initialPasswordError = validateInitialPassword(input.initialPassword);

  if (initialPasswordError) {
    return NextResponse.json(
      { error: INITIAL_PASSWORD_INVALID_SERVER_MESSAGE },
      { status: 400 },
    );
  }

  try {
    const { initialPassword, ...personnel } = input;
    const created = await createPersonnelAuthAccount({
      personnel,
      initialPassword,
    });

    return NextResponse.json({
      ok: true,
      personnel: created.personnel,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? getPersonnelErrorMessage(error)
            : "Unable to create personnel account.",
      },
      { status: 400 },
    );
  }
}
