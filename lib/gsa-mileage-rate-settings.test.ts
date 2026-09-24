import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isAdministrativeRole } from "@/lib/auth/roles";
import { calculateMileageReimbursement } from "@/lib/mileage";

const migrationSql = readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20260723200000_system_settings.sql",
  ),
  "utf8",
);
const systemSettingsServerSource = readFileSync(
  path.join(process.cwd(), "lib/system-settings-server.ts"),
  "utf8",
);
const adminSettingsRouteSource = readFileSync(
  path.join(
    process.cwd(),
    "app/api/admin/settings/gsa-mileage-rate/route.ts",
  ),
  "utf8",
);
const wizardSource = readFileSync(
  path.join(process.cwd(), "components/requests/TrainingRequestWizard.tsx"),
  "utf8",
);
const generateApprovedPacketSource = readFileSync(
  path.join(process.cwd(), "lib/pdf/generate-approved-packet.ts"),
  "utf8",
);
const buildStampValuesSource = readFileSync(
  path.join(process.cwd(), "lib/pdf/build-stamp-values.ts"),
  "utf8",
);
const personnelRoleRankSource = readFileSync(
  path.join(process.cwd(), "lib/personnel-role-rank.test.ts"),
  "utf8",
);

describe("system_settings migration", () => {
  it("creates system_settings and audit tables", () => {
    assert.match(migrationSql, /create table if not exists public\.system_settings/);
    assert.match(
      migrationSql,
      /create table if not exists public\.system_settings_audit/,
    );
    assert.match(migrationSql, /GSA mileage rate/);
  });
});

describe("GSA mileage rate administration", () => {
  it("loads the current rate from system_settings on the server", () => {
    assert.match(systemSettingsServerSource, /getCurrentGsaMileageRate/);
    assert.match(systemSettingsServerSource, /GSA_MILEAGE_RATE_SETTING_KEY/);
    assert.match(systemSettingsServerSource, /system_settings_audit/);
  });

  it("allows only administrative application roles to change the rate", () => {
    assert.match(adminSettingsRouteSource, /isAdministrativeRole/);
    assert.equal(isAdministrativeRole("mto"), true);
    assert.equal(isAdministrativeRole("deputy_chief"), true);
    assert.equal(isAdministrativeRole("admin"), true);
    assert.equal(isAdministrativeRole("firefighter"), false);
  });

  it("blocks normal users from the admin settings route", () => {
    assert.match(adminSettingsRouteSource, /Access denied/);
    assert.doesNotMatch(adminSettingsRouteSource, /isPersonnelTitle/);
  });

  it("does not grant settings access from personnel rank alone", () => {
    assert.match(personnelRoleRankSource, /separate from the application authorization role/);
    assert.doesNotMatch(adminSettingsRouteSource, /title/);
  });
});

describe("request workflow mileage snapshots", () => {
  it("snapshots the current rate at submission through expense summary input", () => {
    assert.match(wizardSource, /currentGsaMileageRate/);
    assert.match(wizardSource, /buildTrainingRequestInput/);
    assert.match(wizardSource, /expenseSummary/);
    assert.match(wizardSource, /preservedSubmittedGsaRate/);
  });

  it("preserves stored request rates for returned corrections", () => {
    assert.match(wizardSource, /returned_for_correction/);
    assert.match(wizardSource, /request\.gsaMileageRate/);
  });

  it("uses stored request mileage rates in PDF generation", () => {
    assert.match(buildStampValuesSource, /request\.gsaMileageRate/);
    assert.doesNotMatch(generateApprovedPacketSource, /getCurrentGsaMileageRate/);
    assert.doesNotMatch(generateApprovedPacketSource, /getGsaMileageRate/);
  });

  it("keeps reimbursement math accurate for historical rates", () => {
    assert.equal(calculateMileageReimbursement(200, 0.67), 134);
    assert.equal(calculateMileageReimbursement(200, 0.7), 140);
  });
});
