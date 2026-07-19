import { NextResponse, type NextRequest } from "next/server";
import { INVALID_CREDENTIALS_MESSAGE } from "@/lib/auth/password";
import {
  isLoginRateLimited,
  recordLoginAttempt,
  resetLoginAttempts,
} from "@/lib/auth/login-rate-limit";
import { performPasswordLogin } from "@/lib/auth/login-server";
import { normalizeBadgeNumberForLookup } from "@/lib/auth/personnel-lookup-server";

function getClientIpAddress(request: NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for");

  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || "unknown";
  }

  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

export async function POST(request: NextRequest) {
  let body: { badgeNumber?: unknown; password?: unknown };

  try {
    body = (await request.json()) as {
      badgeNumber?: unknown;
      password?: unknown;
    };
  } catch {
    return NextResponse.json(
      { error: INVALID_CREDENTIALS_MESSAGE },
      { status: 400 },
    );
  }

  const badgeNumber =
    typeof body.badgeNumber === "string"
      ? normalizeBadgeNumberForLookup(body.badgeNumber)
      : "";
  const password = typeof body.password === "string" ? body.password : "";
  const ipAddress = getClientIpAddress(request);

  if (!badgeNumber || !password) {
    return NextResponse.json(
      { error: INVALID_CREDENTIALS_MESSAGE },
      { status: 400 },
    );
  }

  if (isLoginRateLimited(ipAddress, badgeNumber)) {
    return NextResponse.json(
      {
        error:
          "Too many sign-in attempts. Wait a moment before trying again.",
      },
      { status: 429 },
    );
  }

  recordLoginAttempt(ipAddress, badgeNumber);

  const result = await performPasswordLogin({ badgeNumber, password });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 401 });
  }

  resetLoginAttempts(ipAddress, badgeNumber);

  return NextResponse.json({ ok: true, redirectTo: "/dashboard" });
}
