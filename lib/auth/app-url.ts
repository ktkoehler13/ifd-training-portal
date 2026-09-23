import "server-only";

import type { NextRequest } from "next/server";

function normalizeOrigin(value: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    return trimmed;
  }

  try {
    return new URL(trimmed).origin;
  } catch {
    return trimmed.replace(/\/$/, "");
  }
}

export function getApplicationOrigin(requestOrigin?: string): string {
  const configured = process.env.APP_BASE_URL?.trim();

  if (configured) {
    return normalizeOrigin(configured);
  }

  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) {
    return normalizeOrigin(
      vercelUrl.startsWith("http") ? vercelUrl : `https://${vercelUrl}`,
    );
  }

  if (requestOrigin) {
    return normalizeOrigin(requestOrigin);
  }

  return "http://localhost:3000";
}

export function getRequestApplicationOrigin(request: NextRequest): string {
  const host =
    request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    request.headers.get("host")?.trim();

  if (host) {
    const protocol =
      request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
      (host.includes("localhost") ? "http" : "https");
    return getApplicationOrigin(`${protocol}://${host}`);
  }

  return getApplicationOrigin(new URL(request.url).origin);
}

export function buildApplicationPathUrl(
  pathname: string,
  requestOrigin?: string,
): string {
  const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return new URL(normalizedPath, `${getApplicationOrigin(requestOrigin)}/`).href;
}
