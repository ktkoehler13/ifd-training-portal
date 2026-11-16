import { createHmac, timingSafeEqual } from "node:crypto";
import { RECOVERY_SESSION_SECONDS } from "./password-recovery-session";

export interface RecoveryIdentity { userId: string; sessionId: string }

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(`ifd-password-recovery:v1:${payload}`).digest("base64url");
}

// Issue only after verifying a recovery token, or verified PKCE recovery claims.
// OTP claims alone cannot distinguish recovery from other email sign-ins.
export function createPasswordRecoveryProof(identity: RecoveryIdentity, secret: string, nowSeconds = Date.now() / 1000): string {
  if (!identity.userId || !identity.sessionId || !secret) throw new Error("Recovery identity is required.");
  const issuedAt = Math.floor(nowSeconds);
  const payload = Buffer.from(JSON.stringify({ userId: identity.userId, sessionId: identity.sessionId, issuedAt, expiresAt: issuedAt + RECOVERY_SESSION_SECONDS })).toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

export function verifyPasswordRecoveryProof(value: string | undefined, identity: RecoveryIdentity, secret: string, nowSeconds = Date.now() / 1000): boolean {
  if (!value || value.length > 2048 || !secret || !identity.userId || !identity.sessionId) return false;
  const parts = value.split(".");
  if (parts.length !== 2) return false;
  const [payload, signature] = parts;
  const expected = Buffer.from(sign(payload, secret));
  const supplied = Buffer.from(signature);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return false;
  try {
    const proof = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return proof?.userId === identity.userId && proof?.sessionId === identity.sessionId &&
      Number.isSafeInteger(proof.issuedAt) && proof.issuedAt <= nowSeconds &&
      proof.expiresAt === proof.issuedAt + RECOVERY_SESSION_SECONDS && nowSeconds < proof.expiresAt;
  } catch { return false; }
}
