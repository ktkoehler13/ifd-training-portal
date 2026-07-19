import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validatePermanentPassword } from "./password";

const changePasswordServerSource = readFileSync(
  path.join(process.cwd(), "lib/auth/password-change-server.ts"),
  "utf8",
);
const changePasswordViewSource = readFileSync(
  path.join(process.cwd(), "components/settings/ChangePasswordView.tsx"),
  "utf8",
);
const adminPersonnelSource = readFileSync(
  path.join(process.cwd(), "lib/auth/admin-personnel-server.ts"),
  "utf8",
);
const reconciliationSource = readFileSync(
  path.join(process.cwd(), "lib/auth/forced-password-setup-reconciliation.ts"),
  "utf8",
);
const correctiveMigrationSql = readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20260719200000_add_password_setup_completed_at.sql",
  ),
  "utf8",
);

function extractForcedSetupBlock(source: string): string {
  const match = source.match(
    /if \(personnel\.mustChangePassword\) \{[\s\S]*?return \{ ok: true, message: PASSWORD_CHANGE_SUCCESS_MESSAGE \};\s*\}/,
  );
  assert.ok(match, "forced setup block should exist");
  return match[0]!;
}

describe("forced first-login password setup", () => {
  it("uses auth.admin.updateUserById for forced setup", () => {
    assert.match(
      changePasswordServerSource,
      /personnel\.mustChangePassword[\s\S]*auth\.admin\.updateUserById/,
    );
  });

  it("derives the Auth user ID from the authenticated session", () => {
    const forcedSetupBlock = extractForcedSetupBlock(changePasswordServerSource);
    assert.match(changePasswordServerSource, /supabase\.auth\.getUser\(\)/);
    assert.match(forcedSetupBlock, /updateUserById\(\s*user\.id/);
    assert.doesNotMatch(forcedSetupBlock, /updateUserById\(\s*input\./);
  });

  it("does not require Current Password during forced setup", () => {
    const forcedSetupBlock = extractForcedSetupBlock(changePasswordServerSource);
    assert.match(changePasswordViewSource, /!forcedPasswordSetup[\s\S]*Current Password/);
    assert.doesNotMatch(forcedSetupBlock, /currentPassword/);
    assert.doesNotMatch(forcedSetupBlock, /current_password/);
  });

  it("does not trust an Auth user ID from the browser", () => {
    assert.doesNotMatch(changePasswordServerSource, /input\.userId/);
    assert.doesNotMatch(changePasswordServerSource, /body\.authUserId/);
  });

  it("clears must_change_password only after a successful forced Auth update", () => {
    assert.match(
      changePasswordServerSource,
      /if \(updateError\)[\s\S]*return[\s\S]*clearPersonnelMustChangePassword\(personnel\.id\)/,
    );
  });

  it("does not clear must_change_password when the forced Auth update fails", () => {
    const forcedSetupBlock = extractForcedSetupBlock(changePasswordServerSource);
    const updateErrorBlock = forcedSetupBlock.match(/if \(updateError\) \{[\s\S]*?\n    \}/);
    assert.ok(updateErrorBlock, "forced updateError block should exist");
    assert.doesNotMatch(updateErrorBlock[0]!, /clearPersonnelMustChangePassword/);
  });
});

describe("ordinary password change", () => {
  it("still requires Current Password in the UI", () => {
    assert.match(changePasswordViewSource, /Current Password/);
  });

  it("uses current_password with the authenticated client", () => {
    assert.match(changePasswordServerSource, /current_password: currentPassword/);
    assert.doesNotMatch(
      changePasswordServerSource,
      /ordinary-change[\s\S]*signInWithPassword/,
    );
  });
});

describe("permanent password validation and security", () => {
  it("rejects weak permanent passwords", () => {
    assert.equal(
      validatePermanentPassword("short"),
      "Password must be at least 12 characters.",
    );
  });

  it("keeps the service-role client server-only", () => {
    assert.match(changePasswordServerSource, /import "server-only"/);
    assert.match(changePasswordServerSource, /createServiceRoleClient/);
    assert.doesNotMatch(changePasswordViewSource, /createServiceRoleClient/);
  });

  it("never logs password values", () => {
    const diagnosticBlocks = changePasswordServerSource.match(
      /console\.error\([\s\S]*?\}\);/g,
    );
    assert.ok(diagnosticBlocks, "diagnostic blocks should exist");
    for (const block of diagnosticBlocks) {
      assert.doesNotMatch(block, /newPassword/);
      assert.doesNotMatch(block, /currentPassword/);
      assert.doesNotMatch(block, /initialPassword/);
      assert.doesNotMatch(block, /input\.password/);
    }
  });

  it("preserves Supabase error code and message in safe server-side diagnostics", () => {
    assert.match(changePasswordServerSource, /Password update failed/);
    assert.match(changePasswordServerSource, /mode: "forced-setup"/);
    assert.match(changePasswordServerSource, /mode: "ordinary-change"/);
    assert.match(changePasswordServerSource, /code: updateError\.code/);
    assert.match(changePasswordServerSource, /message: updateError\.message/);
  });
});

describe("password setup completion migration and flag clearing", () => {
  it("adds password_setup_completed_at in the corrective migration", () => {
    assert.match(
      correctiveMigrationSql,
      /add column if not exists password_setup_completed_at timestamptz null/,
    );
    assert.match(
      correctiveMigrationSql,
      /successfully established or replaced their permanent password/,
    );
  });

  it("sets must_change_password to false after successful forced setup", () => {
    const forcedSetupBlock = extractForcedSetupBlock(changePasswordServerSource);
    assert.match(adminPersonnelSource, /must_change_password: false/);
    assert.match(forcedSetupBlock, /clearPersonnelMustChangePassword\(personnel\.id\)/);
  });

  it("records password_setup_completed_at after successful forced setup", () => {
    assert.match(adminPersonnelSource, /password_setup_completed_at: new Date\(\)\.toISOString\(\)/);
    assert.match(adminPersonnelSource, /\.select\("id"\)[\s\S]*\.maybeSingle\(\)/);
  });

  it("treats a missing personnel row as a failure", () => {
    assert.match(adminPersonnelSource, /if \(!data\)/);
    assert.match(adminPersonnelSource, /PERSONNEL_NOT_FOUND/);
  });

  it("returns the partial-success message when Auth succeeds but the personnel update fails", () => {
    assert.match(
      changePasswordServerSource,
      /FORCED_PASSWORD_SETUP_PARTIAL_SUCCESS_MESSAGE/,
    );
    assert.match(
      changePasswordServerSource,
      /Your password was changed, but account setup could not be finalized/,
    );
    assert.match(
      changePasswordServerSource,
      /markForcedPasswordSetupPendingFinalize/,
    );
  });

  it("reconciles pending forced setup only when the Auth marker is present", () => {
    assert.match(
      reconciliationSource,
      /forced_password_setup_pending_finalize/,
    );
    assert.match(reconciliationSource, /personnel\.mustChangePassword/);
    assert.match(reconciliationSource, /normalizePersonnelEmail/);
    assert.doesNotMatch(
      reconciliationSource,
      /mustChangePassword[\s\S]*clearPersonnelMustChangePassword[\s\S]*readPendingFinalizeMarker/,
    );
  });

  it("never logs passwords or tokens during personnel flag clearing", () => {
    const diagnosticBlocks = [
      ...(adminPersonnelSource.match(/console\.error\([\s\S]*?\}\);/g) ?? []),
      ...(reconciliationSource.match(/console\.error\([\s\S]*?\}\);/g) ?? []),
      ...(changePasswordServerSource.match(/console\.error\([\s\S]*?\}\);/g) ?? []),
    ];
    assert.ok(diagnosticBlocks.length > 0, "diagnostic blocks should exist");
    for (const block of diagnosticBlocks) {
      assert.doesNotMatch(block, /newPassword/);
      assert.doesNotMatch(block, /currentPassword/);
      assert.doesNotMatch(block, /initialPassword/);
      assert.doesNotMatch(block, /access token/i);
      assert.doesNotMatch(block, /refresh token/i);
      assert.doesNotMatch(block, /serviceRoleKey/);
      assert.doesNotMatch(block, /SERVICE_ROLE/);
    }
  });
});
