const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 5;

interface RateLimitEntry {
  count: number;
  windowStartedAt: number;
}

const attemptsByKey = new Map<string, RateLimitEntry>();

function getRateLimitKey(ipAddress: string, badgeNumber: string): string {
  return `${ipAddress}:${badgeNumber.trim().toLowerCase()}`;
}

export function isPasswordSetupRateLimited(
  ipAddress: string,
  badgeNumber: string,
): boolean {
  const key = getRateLimitKey(ipAddress, badgeNumber);
  const entry = attemptsByKey.get(key);
  const now = Date.now();

  if (!entry || now - entry.windowStartedAt >= WINDOW_MS) {
    return false;
  }

  return entry.count >= MAX_ATTEMPTS;
}

export function recordPasswordSetupAttempt(
  ipAddress: string,
  badgeNumber: string,
): void {
  const key = getRateLimitKey(ipAddress, badgeNumber);
  const now = Date.now();
  const entry = attemptsByKey.get(key);

  if (!entry || now - entry.windowStartedAt >= WINDOW_MS) {
    attemptsByKey.set(key, { count: 1, windowStartedAt: now });
    return;
  }

  entry.count += 1;
}
