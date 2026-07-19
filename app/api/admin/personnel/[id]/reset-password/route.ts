import { NextResponse, type NextRequest } from "next/server";
import { resetPersonnelAuthPassword } from "@/lib/auth/admin-personnel-server";

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
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to reset password for this user.",
      },
      { status: 400 },
    );
  }
}
