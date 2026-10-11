export const RECOVERY_SESSION_SECONDS = 30 * 60;

// Only call this with claims verified by Supabase Auth. A historical
// recovery_sent_at value on a user is not proof that this session used a link.
export function hasRecentRecoveryAuthentication(
  claims: { sub?: unknown; amr?: unknown } | null | undefined,
  userId: string,
  nowSeconds = Date.now() / 1000,
): boolean {
  return claims?.sub === userId && Array.isArray(claims.amr) &&
    claims.amr.some((entry: unknown) => {
      if (!entry || typeof entry !== "object") return false;
      const { method, timestamp } = entry as { method?: unknown; timestamp?: unknown };
      return method === "recovery" && typeof timestamp === "number" &&
        Number.isFinite(timestamp) && timestamp <= nowSeconds &&
        nowSeconds - timestamp < RECOVERY_SESSION_SECONDS;
    });
}
