import { NextResponse, type NextRequest } from "next/server";
import { getRequestApplicationOrigin } from "@/lib/auth/app-url";
import { requestPasswordRecovery } from "@/lib/auth/password-recovery-server";
import { PASSWORD_RECOVERY_REQUEST_SUCCESS_MESSAGE } from "@/lib/auth/password-recovery-messages";
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
      message: PASSWORD_RECOVERY_REQUEST_SUCCESS_MESSAGE,
    });
  }

  const badgeNumber =
    typeof body.badgeNumber === "string"
      ? normalizeBadgeNumberForLookup(body.badgeNumber)
      : "";
  const ipAddress = getClientIpAddress(request);
  const requestOrigin = getRequestApplicationOrigin(request);

  const result = await requestPasswordRecovery({
    badgeNumber,
    ipAddress,
    requestOrigin,
  });

  return NextResponse.json(result);
}
