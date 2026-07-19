import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PASSWORD_SETUP_REQUEST_SUCCESS_MESSAGE } from "./password-setup-messages";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260718260000_legacy_password_setup.sql",
);
const migrationSql = readFileSync(migrationPath, "utf8");
const landingGateSource = readFileSync(
  path.join(process.cwd(), "components/layout/LandingGate.tsx"),
  "utf8",
);
const setupRequestViewSource = readFileSync(
  path.join(process.cwd(), "components/auth/PasswordSetupRequestView.tsx"),
  "utf8",
);
const setupRequestRouteSource = readFileSync(
  path.join(process.cwd(), "app/api/auth/request-password-setup/route.ts"),
  "utf8",
);
const setupServerSource = readFileSync(
  path.join(process.cwd(), "lib/auth/password-setup-server.ts"),
  "utf8",
);
const setupRateLimitSource = readFileSync(
  path.join(process.cwd(), "lib/auth/password-setup-rate-limit.ts"),
  "utf8",
);
const callbackRouteSource = readFileSync(
  path.join(process.cwd(), "app/auth/callback/route.ts"),
  "utf8",
);
const changePasswordViewSource = readFileSync(
  path.join(process.cwd(), "components/settings/ChangePasswordView.tsx"),
  "utf8",
);
const changePasswordServerSource = readFileSync(
  path.join(process.cwd(), "lib/auth/password-change-server.ts"),
  "utf8",
);
const loginRouteSource = readFileSync(
  path.join(process.cwd(), "app/api/auth/login/route.ts"),
  "utf8",
);
const adminPersonnelSource = readFileSync(
  path.join(process.cwd(), "lib/auth/admin-personnel-server.ts"),
  "utf8",
);
const personnelLookupSource = readFileSync(
  path.join(process.cwd(), "lib/auth/personnel-lookup-server.ts"),
  "utf8",
);

function extractForcedSetupBlock(source: string): string {
  const match = source.match(
    /if \(personnel\.mustChangePassword\) \{[\s\S]*?return \{ ok: true, message: PASSWORD_CHANGE_SUCCESS_MESSAGE \};\s*\}/,
  );
  assert.ok(match, "forced setup block should exist");
  return match[0]!;
}

describe("legacy password setup login page", () => {
  it("still uses badge number and password for sign in", () => {
    assert.match(landingGateSource, /Badge Number/);
    assert.match(landingGateSource, /Password/);
    assert.match(landingGateSource, /Sign In/);
    assert.match(landingGateSource, /\/api\/auth\/login/);
  });

  it("includes Set up my password on the login page", () => {
    assert.match(landingGateSource, /Set up my password/);
    assert.match(landingGateSource, /\/setup-password/);
    assert.match(landingGateSource, /Previously signed in by email link\?/);
    assert.match(landingGateSource, /Create a password for your/);
  });
});

describe("password setup request", () => {
  it("asks only for badge number on the setup request page", () => {
    assert.match(setupRequestViewSource, /Create password access/);
    assert.match(setupRequestViewSource, /Badge Number/);
    assert.doesNotMatch(setupRequestViewSource, /Department Email/);
    assert.doesNotMatch(setupRequestViewSource, /type=\"email\"/);
  });

  it("resolves badge to email only on the server", () => {
    assert.match(setupServerSource, /resolveActivePersonnelByBadge/);
    assert.match(setupServerSource, /import "server-only"/);
    assert.match(personnelLookupSource, /createServiceRoleClient/);
  });

  it("never returns email to the browser", () => {
    assert.doesNotMatch(setupRequestRouteSource, /email:/);
    assert.doesNotMatch(setupRequestRouteSource, /personnel\.email/);
    assert.doesNotMatch(setupRequestViewSource, /personnel\.email/);
    assert.match(setupRequestRouteSource, /PASSWORD_SETUP_REQUEST_SUCCESS_MESSAGE/);
  });

  it("returns identical public responses for valid and invalid badge requests", () => {
    assert.match(setupServerSource, /genericResponse/);
    assert.match(setupServerSource, /if \(!personnel\)/);
    assert.match(setupServerSource, /if \(!normalizedBadge\)/);
    assert.match(setupServerSource, /authLookup\.kind !== "found"/);
    assert.equal(
      PASSWORD_SETUP_REQUEST_SUCCESS_MESSAGE,
      "If an active account matches that badge number, a password setup link has been sent to the department email on file.",
    );
  });

  it("returns the same generic response for inactive accounts", () => {
    assert.match(setupServerSource, /resolveActivePersonnelByBadge/);
    assert.match(personnelLookupSource, /\.eq\("active", true\)/);
  });

  it("rate-limits setup requests by IP address and badge number", () => {
    assert.match(setupRateLimitSource, /isPasswordSetupRateLimited/);
    assert.match(setupRateLimitSource, /recordPasswordSetupAttempt/);
    assert.match(setupServerSource, /isPasswordSetupRateLimited/);
    assert.match(setupServerSource, /recordPasswordSetupAttempt/);
  });
});

describe("password setup callback and forced creation", () => {
  it("exchanges the setup link code for an authenticated session", () => {
    assert.match(callbackRouteSource, /exchangeCodeForSession/);
  });

  it("verifies Auth email against personnel email in the callback", () => {
    assert.match(callbackRouteSource, /normalizePersonnelEmail\(user\.email\)/);
    assert.match(callbackRouteSource, /normalizePersonnelEmail\(personnel\.email\)/);
    assert.match(callbackRouteSource, /signOut\(\)/);
  });

  it("redirects setup callbacks to forced password creation", () => {
    assert.match(callbackRouteSource, /flow === "password-setup"/);
    assert.match(callbackRouteSource, /\/settings\/password\?required=1&setup=legacy/);
    assert.match(callbackRouteSource, /markPersonnelMustChangePassword/);
  });

  it("prevents completed users from replaying the setup flow", () => {
    assert.match(
      callbackRouteSource,
      /passwordSetupCompletedAt && !personnel\.mustChangePassword/,
    );
    assert.match(callbackRouteSource, /link-used/);
  });
});

describe("forced password setup page and API", () => {
  it("does not render Current Password during forced setup", () => {
    assert.match(
      changePasswordViewSource,
      /personnel\.mustChangePassword/,
    );
    assert.match(
      changePasswordViewSource,
      /\{!forcedPasswordSetup \? \([\s\S]*Current Password/,
    );
  });

  it("does not require Current Password in the forced password API", () => {
    const forcedSetupBlock = extractForcedSetupBlock(changePasswordServerSource);
    assert.match(forcedSetupBlock, /auth\.admin\.updateUserById/);
    assert.doesNotMatch(forcedSetupBlock, /current_password/);
    assert.doesNotMatch(forcedSetupBlock, /currentPassword/);
    assert.doesNotMatch(changePasswordServerSource, /requiredPasswordChange/);
  });

  it("still requires Current Password for ordinary password changes", () => {
    assert.match(changePasswordViewSource, /Current Password/);
    assert.match(changePasswordServerSource, /current_password: currentPassword/);
  });

  it("clears must_change_password after successful setup", () => {
    assert.match(changePasswordServerSource, /clearPersonnelMustChangePassword/);
    assert.match(adminPersonnelSource, /password_setup_completed_at/);
  });

  it("does not clear must_change_password when the password update fails", () => {
    const forcedSetupBlock = extractForcedSetupBlock(changePasswordServerSource);
    const updateErrorBlock = forcedSetupBlock.match(/if \(updateError\) \{[\s\S]*?\n    \}/);
    assert.ok(updateErrorBlock, "forced updateError block should exist");
    assert.doesNotMatch(updateErrorBlock[0]!, /clearPersonnelMustChangePassword/);
  });

  it("shows legacy setup messaging without using the query parameter as authorization", () => {
    assert.match(changePasswordViewSource, /Create Your Password/);
    assert.match(changePasswordViewSource, /personnel\.mustChangePassword/);
    assert.match(
      changePasswordViewSource,
      /searchParams\.get\("setup"\) === "legacy"/,
    );
  });
});

describe("login email behavior and administrator alternative", () => {
  it("never sends email during normal password login", () => {
    assert.doesNotMatch(loginRouteSource, /resetPasswordForEmail/);
    assert.doesNotMatch(loginRouteSource, /signInWithOtp/);
    assert.match(loginRouteSource, /performPasswordLogin/);
  });

  it("keeps administrator temporary-password reset available", () => {
    assert.match(adminPersonnelSource, /resetPersonnelAuthPassword/);
    assert.match(adminPersonnelSource, /generateMemorableInitialPassword/);
    assert.match(adminPersonnelSource, /markPersonnelMustChangePassword/);
  });

  it("never exposes service-role credentials to client code", () => {
    assert.doesNotMatch(landingGateSource, /SERVICE_ROLE/);
    assert.doesNotMatch(setupRequestViewSource, /SERVICE_ROLE/);
    assert.doesNotMatch(changePasswordViewSource, /SERVICE_ROLE/);
    assert.match(setupServerSource, /import "server-only"/);
  });
});

describe("legacy password setup migration", () => {
  it("guarantees must_change_password and password_setup_completed_at columns", () => {
    assert.match(migrationSql, /must_change_password boolean not null default false/);
    assert.match(migrationSql, /password_setup_completed_at timestamptz null/);
    assert.match(migrationSql, /one-time conversion from magic-link-only accounts/);
  });
});
