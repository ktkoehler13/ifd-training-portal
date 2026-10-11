import { NextResponse } from "next/server";
import {
  establishPasswordRecoverySessionFromAuthUser,
  hasPasswordRecoverySession,
  verifyPasswordRecoveryToken,
  exchangePasswordRecoveryCode,
} from "@/lib/auth/password-recovery-server";

export async function GET() {
  const hasRecoverySession = await hasPasswordRecoverySession();

  return NextResponse.json({
    hasRecoverySession,
  });
}

export async function POST(request: Request) {
  // Links are consumed only after the user presses Continue, never on a GET.
  let body: { tokenHash?: unknown; code?: unknown } = {};
  if (request.headers.get("content-type")?.includes("application/json")) {
    try { body = await request.json(); } catch {
      return NextResponse.json({ hasRecoverySession: false }, { status: 400 });
    }
    if (!body || typeof body !== "object") {
      return NextResponse.json({ hasRecoverySession: false }, { status: 400 });
    }
  }
  const established = typeof body.tokenHash === "string"
    ? await verifyPasswordRecoveryToken(body.tokenHash)
    : typeof body.code === "string"
      ? (await exchangePasswordRecoveryCode(body.code)).ok
      : await establishPasswordRecoverySessionFromAuthUser();

  if (!established) {
    return NextResponse.json({ hasRecoverySession: false }, { status: 403 });
  }

  return NextResponse.json({ hasRecoverySession: true });
}
