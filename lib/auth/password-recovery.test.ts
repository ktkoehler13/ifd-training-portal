import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  PASSWORD_MISMATCH_MESSAGE,
  validatePermanentPassword,
} from "@/lib/auth/password";
import {
  PASSWORD_RECOVERY_LINK_INVALID_MESSAGE,
  PASSWORD_RECOVERY_REQUEST_SUCCESS_MESSAGE,
  PASSWORD_RECOVERY_SESSION_REQUIRED_MESSAGE,
  PASSWORD_RECOVERY_SUCCESS_MESSAGE,
} from "@/lib/auth/password-recovery-messages";
const recoveryServerSource = readFileSync(
  path.join(process.cwd(), "lib/auth/password-recovery-server.ts"),
  "utf8",
);
const recoveryRequestRouteSource = readFileSync(
  path.join(process.cwd(), "app/api/auth/request-password-recovery/route.ts"),
  "utf8",
);
const recoveryResetRouteSource = readFileSync(
  path.join(process.cwd(), "app/api/auth/reset-password/route.ts"),
  "utf8",
);
const recoverySessionRouteSource = readFileSync(
  path.join(process.cwd(), "app/api/auth/reset-password/session/route.ts"),
  "utf8",
);
const authCallbackSource = readFileSync(
  path.join(process.cwd(), "app/auth/callback/route.ts"),
  "utf8",
);
const landingGateSource = readFileSync(
  path.join(process.cwd(), "components/layout/LandingGate.tsx"),
  "utf8",
);
const recoveryResetViewSource = readFileSync(
  path.join(process.cwd(), "components/auth/PasswordRecoveryResetView.tsx"),
  "utf8",
);
const recoveryRequestViewSource = readFileSync(
  path.join(process.cwd(), "components/auth/PasswordRecoveryRequestView.tsx"),
  "utf8",
);
const changePasswordViewSource = readFileSync(
  path.join(process.cwd(), "components/settings/ChangePasswordView.tsx"),
  "utf8",
);
const readmeSource = readFileSync(path.join(process.cwd(), "README.md"), "utf8");

describe("password recovery request flow", () => {
  it("does not reveal whether a badge exists", () => {
    assert.match(
      recoveryRequestRouteSource,
      /PASSWORD_RECOVERY_REQUEST_SUCCESS_MESSAGE/,
    );
    assert.match(recoveryServerSource, /genericResponse/);
    assert.match(
      recoveryRequestViewSource,
      /PASSWORD_RECOVERY_REQUEST_SUCCESS_MESSAGE/,
    );
    assert.equal(
      PASSWORD_RECOVERY_REQUEST_SUCCESS_MESSAGE,
      "If an account matches that badge number, a password reset email has been sent.",
    );
  });

  it("uses /reset-password as redirectTo", () => {
    assert.match(recoveryServerSource, /resetPasswordForEmail/);
    assert.match(recoveryServerSource, /redirectTo/);
    assert.match(recoveryServerSource, /getPasswordRecoveryRedirectUrl/);
    assert.match(recoveryServerSource, /buildApplicationPathUrl\("\/reset-password"/);
    const appUrlSource = readFileSync(
      path.join(process.cwd(), "lib/auth/app-url.ts"),
      "utf8",
    );
    assert.match(appUrlSource, /APP_BASE_URL/);
  });
});

describe("password recovery reset page", () => {
  it("rejects missing recovery session", () => {
    assert.match(recoveryServerSource, /hasPasswordRecoveryCookie/);
    assert.match(recoveryResetRouteSource, /completePasswordRecovery/);
    assert.equal(
      PASSWORD_RECOVERY_SESSION_REQUIRED_MESSAGE,
      PASSWORD_RECOVERY_LINK_INVALID_MESSAGE,
    );
    assert.match(recoveryResetViewSource, /PASSWORD_RECOVERY_LINK_INVALID_MESSAGE/);
  });

  it("shows a useful message for expired or invalid recovery links", () => {
    assert.match(recoveryResetViewSource, /reason === "invalid-link"/);
    assert.match(recoveryResetViewSource, /PASSWORD_RECOVERY_LINK_INVALID_MESSAGE/);
    assert.match(recoveryResetViewSource, /Request a new reset email/);
    assert.match(recoveryResetViewSource, /Back to sign in/);
    const resetPageSource = readFileSync(
      path.join(process.cwd(), "app/reset-password/page.tsx"),
      "utf8",
    );
    assert.match(resetPageSource, /invalid-link/);
  });

  it("does not require current password during recovery", () => {
    assert.doesNotMatch(recoveryResetViewSource, /current-password/);
    assert.doesNotMatch(recoveryResetViewSource, /Current Password/);
    assert.match(recoveryServerSource, /updateUser\(\{\s*password:/);
    assert.doesNotMatch(recoveryResetRouteSource, /currentPassword/);
  });

  it("returns the user to sign in after a successful reset", () => {
    assert.match(recoveryResetViewSource, /reason=password-reset/);
    assert.equal(
      PASSWORD_RECOVERY_SUCCESS_MESSAGE,
      "Your password has been reset. Sign in with your new password.",
    );
    assert.match(landingGateSource, /password-reset/);
    assert.match(recoveryServerSource, /clearPasswordRecoverySession/);
  });
});

describe("password recovery validation", () => {
  it("rejects mismatched passwords", () => {
    assert.match(recoveryServerSource, /PASSWORD_MISMATCH_MESSAGE/);
    assert.equal(
      PASSWORD_MISMATCH_MESSAGE,
      "New password and confirmation do not match.",
    );
  });

  it("rejects weak passwords using the permanent password policy", () => {
    assert.match(recoveryServerSource, /validatePermanentPassword/);
    assert.equal(
      validatePermanentPassword("short"),
      "Password must be at least 12 characters.",
    );
    assert.equal(
      validatePermanentPassword("alllowercase1!"),
      "Password must include an uppercase letter.",
    );
    assert.equal(
      validatePermanentPassword("ALLUPPERCASE1!"),
      "Password must include a lowercase letter.",
    );
    assert.equal(
      validatePermanentPassword("NoNumberHere!"),
      "Password must include a number.",
    );
    assert.equal(
      validatePermanentPassword("NoSpecialChar1"),
      "Password must include a special character.",
    );
  });
});

describe("password recovery wiring", () => {
  it("redirects recovery callbacks to /reset-password", () => {
    assert.match(
      authCallbackSource,
      /if \(type === "recovery"\) \{\s*await markPasswordRecoverySession\(\);\s*return NextResponse\.redirect\(new URL\("\/reset-password", origin\)\);\s*\}/,
    );
  });

  it("handles PASSWORD_RECOVERY auth events on the reset page", () => {
    assert.match(recoveryResetViewSource, /PASSWORD_RECOVERY/);
    assert.match(recoverySessionRouteSource, /establishPasswordRecoverySessionFromAuthUser/);
  });

  it("links forgot password from the login page", () => {
    assert.match(landingGateSource, /Forgot password\?/);
    assert.match(landingGateSource, /\/forgot-password/);
  });

  it("does not log passwords or recovery tokens", () => {
    assert.doesNotMatch(recoveryServerSource, /console\.(log|info|debug)/);
    assert.doesNotMatch(recoveryResetViewSource, /console\.(log|info|debug)/);
    assert.doesNotMatch(
      recoveryServerSource,
      /console\.(log|info|debug)\([^)]*password/i,
    );
    assert.doesNotMatch(recoveryServerSource, /console\.(log|info|debug)\([^)]*code/i);
  });

  it("updates the authenticated user password on successful recovery", () => {
    assert.match(recoveryServerSource, /updateUser\(\{\s*password:/);
    assert.match(recoveryServerSource, /verifyRecoverySession/);
  });

  it("documents Supabase redirect URLs in README", () => {
    assert.match(readmeSource, /Redirect URLs/);
    assert.match(readmeSource, /\/reset-password/);
    assert.match(readmeSource, /localhost:3000\/reset-password/);
  });

  it("keeps ordinary change-password separate from recovery reset", () => {
    assert.match(changePasswordViewSource, /Current Password/);
    assert.doesNotMatch(recoveryResetViewSource, /initial password/i);
  });
});
