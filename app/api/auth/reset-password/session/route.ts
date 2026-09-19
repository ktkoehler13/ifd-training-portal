import { NextResponse } from "next/server";
import {
  establishPasswordRecoverySessionFromAuthUser,
  hasPasswordRecoverySession,
} from "@/lib/auth/password-recovery-server";

export async function GET() {
  const hasRecoverySession = await hasPasswordRecoverySession();

  return NextResponse.json({
    hasRecoverySession,
  });
}

export async function POST() {
  const established = await establishPasswordRecoverySessionFromAuthUser();

  if (!established) {
    return NextResponse.json({ hasRecoverySession: false }, { status: 403 });
  }

  return NextResponse.json({ hasRecoverySession: true });
}
