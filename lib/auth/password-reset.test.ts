import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  PASSWORD_RESET_INACTIVE_MESSAGE,
  PASSWORD_RESET_NO_AUTH_ACCOUNT_MESSAGE,
} from "./password-reset-messages";
import { generateTemporaryPassword, validatePasswordStrength } from "./password";
import { isAdministrativeRole } from "./roles";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260718250000_personnel_must_change_password.sql",
);
const migrationSql = readFileSync(migrationPath, "utf8");
const adminPersonnelSource = readFileSync(
  path.join(process.cwd(), "lib/auth/admin-personnel-server.ts"),
  "utf8",
);
const resetConfirmDialogSource = readFileSync(
  path.join(process.cwd(), "components/admin/ResetPasswordConfirmDialog.tsx"),
  "utf8",
);
const resetResultDialogSource = readFileSync(
  path.join(process.cwd(), "components/admin/ResetPasswordResultDialog.tsx"),
  "utf8",
);
const userManagementSource = readFileSync(
  path.join(process.cwd(), "components/admin/UserManagementView.tsx"),
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
const authGateSource = readFileSync(
  path.join(process.cwd(), "components/layout/AuthGate.tsx"),
  "utf8",
);
const loginServerSource = readFileSync(
  path.join(process.cwd(), "lib/auth/login-server.ts"),
  "utf8",
);

describe("administrator password reset authorization", () => {
  it("allows MTO personnel to reset passwords", () => {
    assert.equal(isAdministrativeRole("mto"), true);
    assert.match(adminPersonnelSource, /isAdministrativeRole/);
  });

  it("allows Deputy Chief personnel to reset passwords", () => {
    assert.equal(isAdministrativeRole("deputy_chief"), true);
  });

  it("allows Admin personnel to reset passwords", () => {
    assert.equal(isAdministrativeRole("admin"), true);
  });

  it("blocks firefighters from resetting another user's password", () => {
    assert.equal(isAdministrativeRole("firefighter"), false);
    assert.match(
      adminPersonnelSource,
      /throw new PasswordResetError\(PASSWORD_RESET_UNAUTHORIZED_MESSAGE\)/,
    );
  });
});

describe("administrator reset UI", () => {
  it("does not include a Current Password field", () => {
    assert.doesNotMatch(resetConfirmDialogSource, /Current Password/);
    assert.doesNotMatch(userManagementSource, /currentPassword/);
    assert.match(resetConfirmDialogSource, /Reset password\?/);
    assert.match(resetConfirmDialogSource, /Reset Password/);
  });

  it("requires confirmation before calling the reset route", () => {
    assert.match(userManagementSource, /ResetPasswordConfirmDialog/);
    assert.match(userManagementSource, /setResetPasswordTarget\(user\)/);
    assert.doesNotMatch(
      userManagementSource,
      /setResetPasswordTarget\(user\)[\s\S]*fetch\([\s\S]*reset-password/,
    );
  });

  it("prevents duplicate reset submissions while resetting", () => {
    assert.match(resetConfirmDialogSource, /if \(isSubmitting\)/);
    assert.match(resetConfirmDialogSource, /disabled=\{isSubmitting\}/);
    assert.match(resetConfirmDialogSource, /Resetting…/);
  });

  it("displays the temporary password once in a result dialog", () => {
    assert.match(userManagementSource, /ResetPasswordResultDialog/);
    assert.match(resetResultDialogSource, /Password reset successful/);
    assert.match(resetResultDialogSource, /Copy Password/);
    assert.match(
      resetResultDialogSource,
      /This password will not be shown again/,
    );
  });

  it("clears the temporary password from state when the dialog closes", () => {
    assert.match(userManagementSource, /setResetPasswordResult\(null\)/);
    assert.doesNotMatch(
      userManagementSource,
      /localStorage|sessionStorage/,
    );
  });
});

describe("administrator reset server behavior", () => {
  it("uses auth.admin.updateUserById without verifying the old password", () => {
    assert.match(adminPersonnelSource, /auth\.admin\.updateUserById/);
    assert.doesNotMatch(
      adminPersonnelSource,
      /resetPersonnelAuthPassword[\s\S]*signInWithPassword/,
    );
    assert.doesNotMatch(adminPersonnelSource, /currentPassword/);
  });

  it("can replace an existing password", () => {
    assert.match(adminPersonnelSource, /password: temporaryPassword/);
  });

  it("can assign the first password to a legacy account through updateUserById", () => {
    assert.match(adminPersonnelSource, /resolveAuthUserIdByPersonnelEmail/);
    assert.match(adminPersonnelSource, /updateUserById/);
  });

  it("blocks inactive personnel resets", () => {
    assert.match(
      adminPersonnelSource,
      /!personnel\.active[\s\S]*PASSWORD_RESET_INACTIVE_MESSAGE/,
    );
    assert.equal(
      PASSWORD_RESET_INACTIVE_MESSAGE,
      "Activate this user before resetting their password.",
    );
  });

  it("returns a safe error when no Auth account exists", () => {
    assert.match(
      adminPersonnelSource,
      /kind === "missing"[\s\S]*PASSWORD_RESET_NO_AUTH_ACCOUNT_MESSAGE/,
    );
    assert.equal(
      PASSWORD_RESET_NO_AUTH_ACCOUNT_MESSAGE,
      "No authentication account exists for this personnel record.",
    );
  });

  it("fails safely when multiple Auth accounts match", () => {
    assert.match(
      adminPersonnelSource,
      /matches\.length > 1[\s\S]*ambiguous/,
    );
  });

  it("does not store the temporary password", () => {
    const resetFunctionMatch = adminPersonnelSource.match(
      /export async function resetPersonnelAuthPassword[\s\S]*?^}/m,
    );
    assert.ok(resetFunctionMatch, "resetPersonnelAuthPassword should exist");
    const resetFunction = resetFunctionMatch[0];
    assert.doesNotMatch(resetFunction, /\.insert\(/);
    assert.doesNotMatch(
      resetFunction,
      /\.update\([\s\S]*temporaryPassword/,
    );
    assert.doesNotMatch(adminPersonnelSource, /console\.log/);
  });

  it("never exposes the service-role key to client code", () => {
    assert.doesNotMatch(resetConfirmDialogSource, /SERVICE_ROLE/);
    assert.doesNotMatch(userManagementSource, /SERVICE_ROLE/);
    assert.match(adminPersonnelSource, /import "server-only"/);
  });

  it("sets must_change_password after an administrator reset", () => {
    assert.match(migrationSql, /must_change_password/);
    assert.match(adminPersonnelSource, /must_change_password: true/);
    assert.match(adminPersonnelSource, /markPersonnelMustChangePassword/);
  });
});

describe("self-service password change", () => {
  it("still requires the current password for normal changes", () => {
    assert.match(changePasswordViewSource, /Current Password/);
    assert.match(changePasswordServerSource, /signInWithPassword/);
    assert.match(changePasswordServerSource, /requiresCurrentPassword/);
  });

  it("allows required first-login changes without the current password", () => {
    assert.match(changePasswordViewSource, /requiredPasswordChange/);
    assert.match(changePasswordViewSource, /Choose a New Password/);
    assert.match(
      changePasswordServerSource,
      /requiresCurrentPassword[\s\S]*signInWithPassword/,
    );
    assert.match(changePasswordServerSource, /clearPersonnelMustChangePassword/);
  });
});

describe("must_change_password redirect behavior", () => {
  it("redirects users with mustChangePassword to the password settings page", () => {
    assert.match(authGateSource, /mustChangePassword/);
    assert.match(authGateSource, /\/settings\/password\?required=1/);
  });

  it("redirects successful logins with temporary passwords to password setup", () => {
    assert.match(loginServerSource, /mustChangePassword/);
  });
});

describe("temporary password generation", () => {
  it("generates secure passwords with required character classes", () => {
    const password = generateTemporaryPassword();
    assert.ok(password.length >= 16);
    assert.equal(validatePasswordStrength(password), null);
  });
});
