import { NextResponse, type NextRequest } from "next/server";
import { createPersonnelAuthAccount } from "@/lib/auth/admin-personnel-server";
import { getPersonnelErrorMessage } from "@/lib/personnel";
import type { PersonnelInsertInput } from "@/types/personnel";

function parsePersonnelInsertInput(body: unknown): PersonnelInsertInput | null {
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
    typeof value.active !== "boolean"
  ) {
    return null;
  }

  return {
    firstName: value.firstName,
    lastName: value.lastName,
    badgeNumber: value.badgeNumber,
    email: value.email,
    role: value.role as PersonnelInsertInput["role"],
    active: value.active,
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

  const input = parsePersonnelInsertInput(body);

  if (!input) {
    return NextResponse.json(
      { error: "Invalid personnel creation request." },
      { status: 400 },
    );
  }

  try {
    const created = await createPersonnelAuthAccount({ personnel: input });

    return NextResponse.json({
      ok: true,
      personnel: created.personnel,
      temporaryPassword: created.temporaryPassword,
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
