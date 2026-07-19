import { NextResponse, type NextRequest } from "next/server";
import { requestPasswordSetup } from "@/lib/auth/password-setup-server";
import { PASSWORD_SETUP_REQUEST_SUCCESS_MESSAGE } from "@/lib/auth/password-setup-messages";
import { normalizeBadgeNumberForLookup } from "@/lib/auth/personnel-lookup-server";

function getClientIpAddress(request: NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for");

  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || "unknown";
  }

  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

export async function POST(request: NextRequest) {
  let body: { badgeNumber?: unknown };

  try {
    body = (await request.json()) as { badgeNumber?: unknown };
  } catch {
    return NextResponse.json({
      ok: true,
      message: PASSWORD_SETUP_REQUEST_SUCCESS_MESSAGE,
    });
  }

  const badgeNumber =
    typeof body.badgeNumber === "string"
      ? normalizeBadgeNumberForLookup(body.badgeNumber)
      : "";
  const ipAddress = getClientIpAddress(request);
  const requestOrigin = new URL(request.url).origin;

  const result = await requestPasswordSetup({
    badgeNumber,
    ipAddress,
    requestOrigin,
  });

  return NextResponse.json(result);
}
