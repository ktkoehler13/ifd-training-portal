import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  INVALID_CREDENTIALS_MESSAGE,
  generateTemporaryPassword,
  validatePasswordStrength,
} from "./password";
import {
  isLoginRateLimited,
  recordLoginAttempt,
  resetLoginAttempts,
} from "./login-rate-limit";
import { normalizeBadgeNumberForLookup } from "./badge";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260718240000_password_authentication.sql",
);
const migrationSql = readFileSync(migrationPath, "utf8");
const landingGateSource = readFileSync(
  path.join(process.cwd(), "components/layout/LandingGate.tsx"),
  "utf8",
);
const loginRouteSource = readFileSync(
  path.join(process.cwd(), "app/api/auth/login/route.ts"),
  "utf8",
);
const loginServerSource = readFileSync(
  path.join(process.cwd(), "lib/auth/login-server.ts"),
  "utf8",
);
const adminPersonnelSource = readFileSync(
  path.join(process.cwd(), "lib/auth/admin-personnel-server.ts"),
  "utf8",
);
const changePasswordServerSource = readFileSync(
  path.join(process.cwd(), "lib/auth/password-change-server.ts"),
  "utf8",
);
const changePasswordRouteSource = readFileSync(
  path.join(process.cwd(), "app/api/auth/change-password/route.ts"),
  "utf8",
);
const personnelLookupSource = readFileSync(
  path.join(process.cwd(), "lib/auth/personnel-lookup-server.ts"),
  "utf8",
);

describe("password authentication migration", () => {
  it("prevents duplicate active badge records", () => {
    assert.match(migrationSql, /personnel_active_badge_number_unique/);
    assert.match(migrationSql, /where active = true/);
  });

  it("revokes anonymous access to legacy magic-link pre-check", () => {
    assert.match(
      migrationSql,
      /revoke all on function public\.personnel_login_allowed\(text, text\) from anon;/,
    );
  });
});

describe("password validation", () => {
  it("accepts a strong generated temporary password", () => {
    const password = generateTemporaryPassword();
    assert.equal(validatePasswordStrength(password), null);
    assert.ok(password.length >= 12);
  });

  it("rejects weak passwords", () => {
    assert.match(
      validatePasswordStrength("short") ?? "",
      /at least 12 characters/,
    );
  });
});

describe("login server behavior", () => {
  it("uses signInWithPassword with server-resolved personnel email", () => {
    assert.match(loginServerSource, /resolveActivePersonnelByBadge/);
    assert.match(loginServerSource, /signInWithPassword\(/);
    assert.match(loginServerSource, /email: personnel\.email/);
    assert.doesNotMatch(loginServerSource, /signInWithOtp/);
  });

  it("returns the same generic error for failed authentication", () => {
    assert.match(loginServerSource, /INVALID_CREDENTIALS_MESSAGE/);
    assert.equal(
      INVALID_CREDENTIALS_MESSAGE,
      "Unable to sign in. Check your badge number and password.",
    );
  });

  it("signs out when authenticated email and personnel email mismatch", () => {
    assert.match(
      loginServerSource,
      /authEmail !== personnelEmail[\s\S]*signOut\(\)/,
    );
  });

  it("signs out when post-auth personnel validation fails", () => {
    assert.match(
      loginServerSource,
      /!verifiedPersonnel[\s\S]*signOut\(\)/,
    );
  });
});

describe("login page and route", () => {
  it("does not require an email field on the login page", () => {
    assert.match(landingGateSource, /Badge Number/);
    assert.match(landingGateSource, /Password/);
    assert.doesNotMatch(landingGateSource, /Department Email/);
    assert.doesNotMatch(landingGateSource, /signInWithOtp/);
    assert.doesNotMatch(landingGateSource, /check-email/);
  });

  it("never calls signInWithOtp during normal login", () => {
    assert.doesNotMatch(landingGateSource, /signInWithOtp/);
    assert.match(landingGateSource, /\/api\/auth\/login/);
  });

  it("does not return resolved personnel email to the browser", () => {
    assert.doesNotMatch(loginRouteSource, /email:/);
    assert.doesNotMatch(loginRouteSource, /personnel\.email/);
    assert.match(loginRouteSource, /redirectTo: result\.mustChangePassword/);
    assert.match(loginRouteSource, /\/settings\/password\?required=1/);
    assert.match(loginRouteSource, /\/dashboard/);
    assert.match(personnelLookupSource, /import "server-only"/);
  });

  it("prevents repeated Sign In clicks from submitting duplicate requests", () => {
    assert.match(landingGateSource, /if \(isSubmitting\)/);
    assert.match(landingGateSource, /disabled=\{isSubmitting\}/);
    assert.match(landingGateSource, /lastSubmittedAt/);
    assert.match(loginRouteSource, /isLoginRateLimited/);
    assert.match(loginRouteSource, /recordLoginAttempt/);
  });
});

describe("login rate limiting", () => {
  it("blocks repeated submissions within the rate-limit window", () => {
    const ip = "203.0.113.10";
    const badge = "207";

    for (let attempt = 0; attempt < 8; attempt += 1) {
      recordLoginAttempt(ip, badge);
    }

    assert.equal(isLoginRateLimited(ip, badge), true);
    resetLoginAttempts(ip, badge);
    assert.equal(isLoginRateLimited(ip, badge), false);
  });
});

describe("badge lookup normalization", () => {
  it("normalizes badge numbers before lookup", () => {
    assert.equal(normalizeBadgeNumberForLookup("  207  "), "207");
    assert.equal(normalizeBadgeNumberForLookup("   "), "");
  });
});

describe("admin personnel provisioning", () => {
  it("creates password-based Auth accounts for admin-created users", () => {
    assert.match(adminPersonnelSource, /auth\.admin\.createUser\(/);
    assert.match(adminPersonnelSource, /password: temporaryPassword/);
    assert.match(adminPersonnelSource, /email_confirm: true/);
  });

  it("requires administrative personnel before creating Auth users", () => {
    assert.match(adminPersonnelSource, /requireAdministrativePersonnel/);
    assert.match(adminPersonnelSource, /isAdministrativeRole/);
  });

  it("reconciles Auth user creation when personnel insert fails", () => {
    assert.match(adminPersonnelSource, /deleteAuthUserById/);
    assert.match(
      adminPersonnelSource,
      /if \(createdAuthUserId\)[\s\S]*deleteAuthUserById/,
    );
  });

  it("does not expose auth.admin to browser code", () => {
    assert.doesNotMatch(landingGateSource, /auth\.admin/);
    assert.match(adminPersonnelSource, /import "server-only"/);
  });
});

describe("password change", () => {
  it("works for authenticated users through a protected route", () => {
    assert.match(changePasswordRouteSource, /changeAuthenticatedUserPassword/);
    assert.match(changePasswordServerSource, /getAuthenticatedPersonnel/);
  });
});

describe("public signup and secrets", () => {
  it("does not expose unrestricted public signup", () => {
    assert.doesNotMatch(landingGateSource, /signUp\(/);
    assert.doesNotMatch(landingGateSource, /shouldCreateUser/);
    assert.doesNotMatch(adminPersonnelSource, /signUp\(/);
  });

  it("never exposes the service-role key in client login code", () => {
    assert.doesNotMatch(landingGateSource, /SERVICE_ROLE/);
    assert.doesNotMatch(landingGateSource, /service_role/);
    assert.doesNotMatch(loginRouteSource, /SERVICE_ROLE/);
  });

  it("does not log or persist password fields in login code", () => {
    assert.doesNotMatch(landingGateSource, /console\.log/);
    assert.doesNotMatch(loginRouteSource, /console\.log/);
    assert.doesNotMatch(loginServerSource, /console\.log/);
    assert.doesNotMatch(landingGateSource, /localStorage/);
    assert.doesNotMatch(landingGateSource, /sessionStorage/);
    assert.doesNotMatch(loginRouteSource, /password:/);
  });
});

describe("SSR session establishment", () => {
  it("uses the Supabase SSR server client for password login", () => {
    assert.match(loginServerSource, /createClient\(\)/);
    assert.match(loginServerSource, /@\/lib\/supabase\/server/);
    assert.doesNotMatch(loginServerSource, /createServiceRoleClient/);
  });
});
