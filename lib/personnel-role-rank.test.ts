import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isAdministrativeRole, isSignatureEligibleRole } from "@/lib/auth/roles";
import { isPersonnelTitle } from "@/lib/personnel";
import {
  PERSONNEL_ROLE_LABELS,
  PERSONNEL_ROLES,
  PERSONNEL_TITLE_LABELS,
  PERSONNEL_TITLES,
} from "@/types/personnel";

const personnelFormFieldsSource = readFileSync(
  path.join(process.cwd(), "components/admin/PersonnelFormFields.tsx"),
  "utf8",
);
const typesPersonnelSource = readFileSync(
  path.join(process.cwd(), "types/personnel.ts"),
  "utf8",
);
const personnelSource = readFileSync(
  path.join(process.cwd(), "lib/personnel.ts"),
  "utf8",
);
const rolesSource = readFileSync(
  path.join(process.cwd(), "lib/auth/roles.ts"),
  "utf8",
);
const personnelTitleMigrationSql = readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20260719220000_add_personnel_title.sql",
  ),
  "utf8",
);
const expandPersonnelTitlesMigrationSql = readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20260719230000_expand_personnel_titles.sql",
  ),
  "utf8",
);

describe("personnel title migration", () => {
  it("adds personnel.title in the migration", () => {
    assert.match(
      personnelTitleMigrationSql,
      /add column if not exists title text not null default 'firefighter'/,
    );
  });

  it("defaults title to firefighter for existing and new rows", () => {
    assert.match(personnelTitleMigrationSql, /default 'firefighter'/);
    assert.doesNotMatch(
      personnelTitleMigrationSql,
      /update public\.personnel[\s\S]*role/,
    );
  });

  it("documents title as separate from application authorization role", () => {
    assert.match(
      personnelTitleMigrationSql,
      /separate from the application authorization role/,
    );
    assert.doesNotMatch(personnelTitleMigrationSql, /\brole\b[\s\S]*default/);
  });

  it("does not map application roles into rank values during backfill", () => {
    assert.doesNotMatch(personnelTitleMigrationSql, /'mto'/);
    assert.doesNotMatch(personnelTitleMigrationSql, /update public\.personnel/);
  });
});

describe("expanded personnel title migration", () => {
  it("includes all five ranks in the database constraint", () => {
    assert.match(expandPersonnelTitlesMigrationSql, /'firefighter'/);
    assert.match(expandPersonnelTitlesMigrationSql, /'lieutenant'/);
    assert.match(expandPersonnelTitlesMigrationSql, /'assistant_chief'/);
    assert.match(expandPersonnelTitlesMigrationSql, /'deputy_chief'/);
    assert.match(expandPersonnelTitlesMigrationSql, /'fire_chief'/);
    assert.match(expandPersonnelTitlesMigrationSql, /personnel_title_check/);
  });

  it("does not alter existing title or application role values", () => {
    assert.doesNotMatch(expandPersonnelTitlesMigrationSql, /update public\.personnel/);
    assert.doesNotMatch(expandPersonnelTitlesMigrationSql, /alter column.*\brole\b/);
  });
});

describe("personnel role and rank labels", () => {
  it("displays stored role firefighter as User", () => {
    assert.equal(PERSONNEL_ROLE_LABELS.firefighter, "User");
    assert.match(typesPersonnelSource, /firefighter: "User"/);
  });

  it("displays Firefighter rank as Firefighter", () => {
    assert.equal(PERSONNEL_TITLE_LABELS.firefighter, "Firefighter");
  });

  it("displays Lieutenant rank as Lieutenant", () => {
    assert.equal(PERSONNEL_TITLE_LABELS.lieutenant, "Lieutenant");
  });

  it("displays Assistant Chief rank as Assistant Chief", () => {
    assert.equal(PERSONNEL_TITLE_LABELS.assistant_chief, "Assistant Chief");
  });

  it("displays Deputy Chief rank as Deputy Chief", () => {
    assert.equal(PERSONNEL_TITLE_LABELS.deputy_chief, "Deputy Chief");
    assert.equal(isPersonnelTitle("deputy_chief"), true);
  });

  it("displays Fire Chief rank as Fire Chief", () => {
    assert.equal(PERSONNEL_TITLE_LABELS.fire_chief, "Fire Chief");
    assert.equal(isPersonnelTitle("fire_chief"), true);
  });
});

describe("Add User and Edit User dropdowns", () => {
  it("includes User in the Application Role dropdown", () => {
    assert.match(personnelFormFieldsSource, /label="Application Role"/);
    assert.match(personnelFormFieldsSource, /PERSONNEL_ROLE_LABELS\[role\]/);
    assert.match(typesPersonnelSource, /firefighter: "User"/);
  });

  it("includes Deputy Chief application role separately from rank", () => {
    const applicationRoleBlock = personnelFormFieldsSource.match(
      /label="Application Role"[\s\S]*?<\/Field>/,
    );
    assert.ok(applicationRoleBlock, "application role field should exist");
    assert.match(applicationRoleBlock[0]!, /PERSONNEL_ROLES/);
    assert.match(applicationRoleBlock[0]!, /PERSONNEL_ROLE_LABELS\[role\]/);
    assert.deepEqual(PERSONNEL_ROLES, [
      "firefighter",
      "mto",
      "deputy_chief",
      "admin",
    ]);
  });

  it("does not include rank-only titles in the Application Role dropdown", () => {
    const applicationRoleBlock = personnelFormFieldsSource.match(
      /label="Application Role"[\s\S]*?<\/Field>/,
    );
    assert.ok(applicationRoleBlock, "application role field should exist");
    assert.doesNotMatch(applicationRoleBlock[0]!, /PERSONNEL_TITLES/);
    assert.doesNotMatch(applicationRoleBlock[0]!, /Fire Chief/);
    assert.doesNotMatch(applicationRoleBlock[0]!, /Lieutenant/);
    assert.doesNotMatch(applicationRoleBlock[0]!, /Assistant Chief/);
  });

  it("includes Deputy Chief and Fire Chief in the Rank dropdown", () => {
    const rankBlock = personnelFormFieldsSource.match(
      /label="Rank"[\s\S]*?<\/Field>/,
    );
    assert.ok(rankBlock, "rank field should exist");
    assert.match(rankBlock[0]!, /PERSONNEL_TITLES/);
    assert.match(rankBlock[0]!, /PERSONNEL_TITLE_LABELS/);
    assert.deepEqual(PERSONNEL_TITLES, [
      "firefighter",
      "lieutenant",
      "assistant_chief",
      "deputy_chief",
      "fire_chief",
    ]);
    assert.equal(PERSONNEL_TITLE_LABELS.deputy_chief, "Deputy Chief");
    assert.equal(PERSONNEL_TITLE_LABELS.fire_chief, "Fire Chief");
    assert.match(rankBlock[0]!, /PERSONNEL_TITLE_LABELS\[title\]/);
  });

  it("does not use application roles in the Rank dropdown", () => {
    const rankBlock = personnelFormFieldsSource.match(
      /label="Rank"[\s\S]*?<\/Field>/,
    );
    assert.ok(rankBlock, "rank field should exist");
    assert.doesNotMatch(rankBlock[0]!, /PERSONNEL_ROLES/);
    assert.doesNotMatch(rankBlock[0]!, /"User"/);
    assert.doesNotMatch(rankBlock[0]!, />\s*MTO\s*</);
    assert.doesNotMatch(rankBlock[0]!, />\s*Admin\s*</);
  });
});

describe("rank and application role independence", () => {
  it("keeps rank and application role as separate form fields", () => {
    assert.match(personnelFormFieldsSource, /values\.title/);
    assert.match(personnelFormFieldsSource, /values\.role/);
    assert.match(personnelSource, /title: values\.title/);
    assert.match(personnelSource, /role: values\.role/);
  });

  it("does not change application role when rank changes", () => {
    assert.match(personnelFormFieldsSource, /title: event\.target\.value/);
    assert.match(personnelFormFieldsSource, /role: event\.target\.value/);
    assert.doesNotMatch(
      personnelFormFieldsSource,
      /values\.title[\s\S]*values\.role: "firefighter"/,
    );
  });

  it("allows Deputy Chief rank with User application role", () => {
    assert.equal(isPersonnelTitle("deputy_chief"), true);
    assert.equal(PERSONNEL_ROLE_LABELS.firefighter, "User");
  });

  it("allows Fire Chief rank with User application role", () => {
    assert.equal(isPersonnelTitle("fire_chief"), true);
    assert.equal(PERSONNEL_ROLE_LABELS.firefighter, "User");
  });

  it("does not grant administrative permissions from rank alone", () => {
    for (const title of PERSONNEL_TITLES) {
      assert.equal(isAdministrativeRole("firefighter"), false);
      assert.equal(isSignatureEligibleRole("firefighter"), false);
      void title;
    }
    assert.match(rolesSource, /role === "mto"/);
    assert.doesNotMatch(rolesSource, /title/);
  });

  it("rejects invalid rank values", () => {
    assert.equal(isPersonnelTitle("admin"), false);
    assert.equal(isPersonnelTitle("mto"), false);
    assert.equal(isPersonnelTitle("chief"), false);
    assert.equal(isPersonnelTitle(""), false);
  });
});

describe("stored application role values", () => {
  it("keeps firefighter as the stored ordinary application role value", () => {
    assert.deepEqual(PERSONNEL_ROLES, [
      "firefighter",
      "mto",
      "deputy_chief",
      "admin",
    ]);
  });
});
