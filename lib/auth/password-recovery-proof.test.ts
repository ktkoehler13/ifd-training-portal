import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createPasswordRecoveryProof, verifyPasswordRecoveryProof } from "./password-recovery-proof";
import { RECOVERY_SESSION_SECONDS } from "./password-recovery-session";

describe("session-bound recovery proof", () => {
  const identity = { userId: "sample-user", sessionId: "recovery-session" };
  const secret = "test-only-server-secret";
  const now = 1_800_000_000;
  const proof = createPasswordRecoveryProof(identity, secret, now);

  it("accepts proof from the verified token exchange for the same user and session", () => {
    assert.equal(verifyPasswordRecoveryProof(proof, identity, secret, now + 60), true);
    // Refreshing the access token keeps the session ID, so the form still works.
    assert.equal(verifyPasswordRecoveryProof(proof, { ...identity }, secret, now + 120), true);
  });
  it("rejects forged legacy markers, malformed cookies and tampered proofs", () => {
    const [payload, signature] = proof.split(".");
    const alteredPayload = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, "base64url").toString()), sessionId: "other" })).toString("base64url");
    for (const value of [undefined, "1", "", `${payload}.fake`, `${alteredPayload}.${signature}`, `${proof}.extra`, "x".repeat(2049)]) {
      assert.equal(verifyPasswordRecoveryProof(value, identity, secret, now), false);
    }
  });
  it("cannot be reused by a different account or later ordinary sign-in", () => {
    assert.equal(verifyPasswordRecoveryProof(proof, { ...identity, userId: "other" }, secret, now), false);
    assert.equal(verifyPasswordRecoveryProof(proof, { ...identity, sessionId: "password-session" }, secret, now), false);
    assert.equal(verifyPasswordRecoveryProof(proof, identity, "other-key", now), false);
    assert.equal(verifyPasswordRecoveryProof(proof, identity, "", now), false);
  });
  it("expires after thirty minutes and rejects future proof", () => {
    assert.equal(verifyPasswordRecoveryProof(proof, identity, secret, now + RECOVERY_SESSION_SECONDS - 1), true);
    assert.equal(verifyPasswordRecoveryProof(proof, identity, secret, now + RECOVERY_SESSION_SECONDS), false);
    assert.equal(verifyPasswordRecoveryProof(proof, identity, secret, now - 1), false);
  });
  it("contains only account/session binding and expiry, never tokens or extra user data", () => {
    const value = createPasswordRecoveryProof({ ...identity, claims: { email: "private@example.test" } } as typeof identity, secret, now);
    assert.deepEqual(JSON.parse(Buffer.from(value.split(".")[0], "base64url").toString()), {
      ...identity, issuedAt: now, expiresAt: now + RECOVERY_SESSION_SECONDS,
    });
    assert.throws(() => createPasswordRecoveryProof({ ...identity, sessionId: "" }, secret, now));
  });
});
