import "server-only";

export function getApplicationOrigin(requestOrigin?: string): string {
  const configured = process.env.APP_BASE_URL?.trim();

  if (configured) {
    return configured.replace(/\/$/, "");
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  if (requestOrigin) {
    return requestOrigin.replace(/\/$/, "");
  }

  return "http://localhost:3000";
}
