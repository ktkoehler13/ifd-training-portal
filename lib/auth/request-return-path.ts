// Email links may resume only known request pages, never arbitrary URLs.
export function getRequestReturnPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
  return new RegExp(`^/(?:approvals/${uuid}|requests/${uuid}/confirmation)$`, "i").test(value)
    ? value : null;
}

export function passwordSetupReturnPath(value: unknown): string {
  const next = getRequestReturnPath(value);
  return `/settings/password?required=1${next ? `&next=${encodeURIComponent(next)}` : ""}`;
}
