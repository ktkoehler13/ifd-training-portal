import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

// Exercise the real recovery service with isolated Auth and cookie adapters.
// No email, account or password is changed outside this test process.
const cookieValues = new Map<string, string>();
const state = {
  user: { id: "test-user", email: "test@example.test" },
  personnel: { email: "test@example.test" } as { email: string } | null,
  claims: { sub: "test-user", session_id: "test-session", amr: [{ method: "otp", timestamp: Date.now() / 1000 }] },
  tokenValid: true, used: false, updates: 0, signOuts: 0, claimsError: false,
  cookies: {
    get: (name: string) => cookieValues.has(name) ? { value: cookieValues.get(name) } : undefined,
    set: (name: string, value: string) => cookieValues.set(name, value),
    delete: (name: string) => cookieValues.delete(name),
  },
  client: { auth: {} },
};
state.client.auth = {
  getUser: async () => ({ data: { user: state.user }, error: null }),
  getClaims: async () => ({ data: { claims: state.claims }, error: state.claimsError ? new Error("invalid") : null }),
  verifyOtp: async (input: { token_hash: string; type: string }) => {
    assert.equal(input.type, "recovery");
    if (!state.tokenValid || state.used) return { data: { user: null }, error: new Error("expired") };
    state.used = true;
    return { data: { user: state.user }, error: null };
  },
  updateUser: async () => { state.updates++; return { error: null }; },
  signOut: async () => { state.signOuts++; return { error: null }; },
};
const testGlobal = globalThis as typeof globalThis & { __ifdRecoveryTest?: typeof state };
testGlobal.__ifdRecoveryTest = state;
process.env.SUPABASE_SERVICE_ROLE_KEY = "isolated-test-signing-key";

const adapters: Record<string, string> = {
  "server-only": "",
  "next/headers": "exports.cookies = async () => globalThis.__ifdRecoveryTest.cookies;",
  "@/lib/supabase/server": "exports.createClient = async () => globalThis.__ifdRecoveryTest.client;",
  "@/lib/auth/personnel": "exports.getAuthenticatedPersonnel = async () => globalThis.__ifdRecoveryTest.personnel;",
};
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (Object.hasOwn(adapters, specifier)) return { url: `ifd-recovery-test:${specifier}`, shortCircuit: true };
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.startsWith("ifd-recovery-test:")) return { source: adapters[url.slice("ifd-recovery-test:".length)], format: "commonjs", shortCircuit: true };
    return nextLoad(url, context);
  },
});

describe("recovery service with Supabase OTP sessions", async () => {
  const recovery = await import("./password-recovery-server");
  const validHash = "a".repeat(64);
  const password = "TestOnly-NewPassword1!";
  beforeEach(() => {
    cookieValues.clear();
    state.tokenValid = true; state.used = false; state.updates = 0; state.signOuts = 0; state.claimsError = false;
    state.personnel = { email: "test@example.test" };
    state.claims = { sub: "test-user", session_id: "test-session", amr: [{ method: "otp", timestamp: Date.now() / 1000 }] };
  });
  it("allows the verified token-hash flow despite Supabase returning otp rather than recovery", async () => {
    assert.equal(await recovery.verifyPasswordRecoveryToken(validHash), true);
    assert.equal(await recovery.hasPasswordRecoverySession(), true);
    const proof = cookieValues.get("ifd_password_recovery");
    assert.equal(await recovery.establishPasswordRecoverySessionFromAuthUser(), true);
    assert.equal(cookieValues.get("ifd_password_recovery"), proof); // no sliding expiry
    assert.equal((await recovery.completePasswordRecovery({ newPassword: password, confirmPassword: password })).ok, true);
    assert.equal(state.updates, 1);
    assert.equal(state.signOuts, 1);
    assert.equal(await recovery.hasPasswordRecoverySession(), false);
  });
  it("does not permit an ordinary OTP or password session, even with a forged old cookie", async () => {
    for (const method of ["otp", "password", "magiclink"]) {
      cookieValues.set("ifd_password_recovery", "1");
      state.claims.amr[0].method = method;
      assert.equal(await recovery.establishPasswordRecoverySessionFromAuthUser(), false);
      assert.equal((await recovery.completePasswordRecovery({ newPassword: password, confirmPassword: password })).ok, false);
    }
    assert.equal(state.updates, 0);
  });
  it("rejects expired tokens, reused tokens and invalid hashes", async () => {
    state.tokenValid = false;
    assert.equal(await recovery.verifyPasswordRecoveryToken(validHash), false);
    assert.equal(await recovery.verifyPasswordRecoveryToken("invalid"), false);
    assert.equal(await recovery.hasPasswordRecoverySession(), false);
    state.tokenValid = true;
    assert.equal(await recovery.verifyPasswordRecoveryToken(validHash), true);
    assert.equal(await recovery.verifyPasswordRecoveryToken(validHash), false);
  });
  it("rejects disabled/unmatched personnel and unverified or mismatched claims", async () => {
    state.personnel = null;
    assert.equal(await recovery.verifyPasswordRecoveryToken(validHash), false);
    state.used = false; state.personnel = { email: "other@example.test" };
    assert.equal(await recovery.verifyPasswordRecoveryToken(validHash), false);
    state.used = false; state.personnel = { email: "test@example.test" }; state.claimsError = true;
    assert.equal(await recovery.verifyPasswordRecoveryToken(validHash), false);
    state.used = false; state.claimsError = false; state.claims.sub = "other";
    assert.equal(await recovery.verifyPasswordRecoveryToken(validHash), false);
    assert.equal(cookieValues.size, 0);
  });
  it("invalidates proof when the authenticated session changes", async () => {
    assert.equal(await recovery.verifyPasswordRecoveryToken(validHash), true);
    state.claims.session_id = "later-password-login";
    assert.equal(await recovery.hasPasswordRecoverySession(), false);
    assert.equal((await recovery.completePasswordRecovery({ newPassword: password, confirmPassword: password })).ok, false);
    assert.equal(state.updates, 0);
  });
  it("keeps PKCE recovery sessions supported without accepting query-string claims", async () => {
    state.claims.amr[0].method = "recovery";
    assert.equal(await recovery.markPasswordRecoverySession(), true);
    assert.equal(await recovery.hasPasswordRecoverySession(), true);
  });
});
