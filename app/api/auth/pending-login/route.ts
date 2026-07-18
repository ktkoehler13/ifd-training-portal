import { NextResponse } from "next/server";
import {
  getPendingLoginCookieOptions,
  PENDING_LOGIN_COOKIE,
} from "@/lib/auth/pending-login";

export async function POST(request: Request) {
  let badgeNumber = "";

  try {
    const body = (await request.json()) as { badgeNumber?: unknown };
    badgeNumber =
      typeof body.badgeNumber === "string" ? body.badgeNumber.trim() : "";
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!badgeNumber) {
    return NextResponse.json(
      { error: "Badge number is required." },
      { status: 400 },
    );
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(
    PENDING_LOGIN_COOKIE,
    badgeNumber,
    getPendingLoginCookieOptions(),
  );

  return response;
}
