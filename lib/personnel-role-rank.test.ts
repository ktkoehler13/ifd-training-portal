import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isAdministrativeRole, isSignatureEligibleRole } from "@/lib/auth/roles";
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

describe("personnel title migration", () => {
  it("adds personnel.title in the migration", () => {
    assert.match(
      personnelTitleMigrationSql,
      /add column if not exists title text not null default 'firefighter'/,
    );
  });

  it("defaults title to firefighter for existing and new rows", () => {
    assert.match(
      personnelTitleMigrationSql,
      /default 'firefighter'/,
    );
    assert.doesNotMatch(personnelTitleMigrationSql, /update public\.personnel[\s\S]*role/);
  });

  it("allows firefighter, lieutenant, and assistant_chief titles", () => {
    assert.match(personnelTitleMigrationSql, /'firefighter'/);
    assert.match(personnelTitleMigrationSql, /'lieutenant'/);
    assert.match(personnelTitleMigrationSql, /'assistant_chief'/);
    assert.match(personnelTitleMigrationSql, /personnel_title_check/);
  });

  it("rejects invalid title values through personnel_title_check", () => {
    assert.match(
      personnelTitleMigrationSql,
      /check \([\s\S]*title in \([\s\S]*'firefighter'[\s\S]*'lieutenant'[\s\S]*'assistant_chief'/,
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
    assert.doesNotMatch(personnelTitleMigrationSql, /'deputy_chief'/);
    assert.doesNotMatch(personnelTitleMigrationSql, /'admin'/);
    assert.doesNotMatch(personnelTitleMigrationSql, /update public\.personnel/);
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
});

describe("Add User and Edit User dropdowns", () => {
  it("includes User in the Application Role dropdown", () => {
    assert.match(personnelFormFieldsSource, /label="Application Role"/);
    assert.match(personnelFormFieldsSource, /PERSONNEL_ROLE_LABELS\[role\]/);
    assert.match(typesPersonnelSource, /firefighter: "User"/);
  });

  it("does not include Lieutenant or Assistant Chief in the Application Role dropdown", () => {
    const applicationRoleBlock = personnelFormFieldsSource.match(
      /label="Application Role"[\s\S]*?<\/Field>/,
    );
    assert.ok(applicationRoleBlock, "application role field should exist");
    assert.doesNotMatch(applicationRoleBlock[0]!, /Lieutenant/);
    assert.doesNotMatch(applicationRoleBlock[0]!, /Assistant Chief/);
    assert.doesNotMatch(applicationRoleBlock[0]!, /PERSONNEL_TITLES/);
  });

  it("does not include User, MTO, Deputy Chief, or Admin in the Rank dropdown", () => {
    const rankBlock = personnelFormFieldsSource.match(
      /label="Rank"[\s\S]*?<\/Field>/,
    );
    assert.ok(rankBlock, "rank field should exist");
    assert.match(rankBlock[0]!, /PERSONNEL_TITLES/);
    assert.match(rankBlock[0]!, /PERSONNEL_TITLE_LABELS/);
    assert.doesNotMatch(rankBlock[0]!, /PERSONNEL_ROLES/);
    assert.doesNotMatch(rankBlock[0]!, /"User"/);
    assert.doesNotMatch(rankBlock[0]!, /Deputy Chief/);
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

  it("preserves ordinary-rank firefighter permissions regardless of rank", () => {
    for (const title of PERSONNEL_TITLES) {
      assert.equal(isAdministrativeRole("firefighter"), false);
      assert.equal(isSignatureEligibleRole("firefighter"), false);
      void title;
    }
    assert.match(rolesSource, /role === "mto"/);
    assert.doesNotMatch(rolesSource, /title/);
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
