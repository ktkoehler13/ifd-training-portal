import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  generateMemorableInitialPassword,
  INITIAL_PASSWORD_INVALID_SERVER_MESSAGE,
  INITIAL_PASSWORD_MISMATCH_MESSAGE,
  INITIAL_PASSWORD_TOO_SHORT_MESSAGE,
  INITIAL_PASSWORD_WHITESPACE_ONLY_MESSAGE,
  validateInitialPassword,
  validatePermanentPassword,
} from "./password";
import { validateAddUserForm } from "@/lib/personnel";

const addUserFormSource = readFileSync(
  path.join(process.cwd(), "components/admin/AddUserForm.tsx"),
  "utf8",
);
const personnelFormFieldsSource = readFileSync(
  path.join(process.cwd(), "components/admin/PersonnelFormFields.tsx"),
  "utf8",
);
const editUserModalSource = readFileSync(
  path.join(process.cwd(), "components/admin/EditUserModal.tsx"),
  "utf8",
);
const userManagementSource = readFileSync(
  path.join(process.cwd(), "components/admin/UserManagementView.tsx"),
  "utf8",
);
const adminPersonnelRouteSource = readFileSync(
  path.join(process.cwd(), "app/api/admin/personnel/route.ts"),
  "utf8",
);
const adminPersonnelServerSource = readFileSync(
  path.join(process.cwd(), "lib/auth/admin-personnel-server.ts"),
  "utf8",
);
const personnelSource = readFileSync(
  path.join(process.cwd(), "lib/personnel.ts"),
  "utf8",
);
const changePasswordServerSource = readFileSync(
  path.join(process.cwd(), "lib/auth/password-change-server.ts"),
  "utf8",
);
const typesPersonnelSource = readFileSync(
  path.join(process.cwd(), "types/personnel.ts"),
  "utf8",
);

const emptyExistingUsers = [] as const;

describe("initial password validation", () => {
  it("rejects a 5-character password", () => {
    assert.equal(
      validateInitialPassword("Truck"),
      INITIAL_PASSWORD_TOO_SHORT_MESSAGE,
    );
  });

  it("accepts a 6-character password", () => {
    assert.equal(validateInitialPassword("Truck7"), null);
  });

  it("rejects a password containing only spaces", () => {
    assert.equal(
      validateInitialPassword("      "),
      INITIAL_PASSWORD_WHITESPACE_ONLY_MESSAGE,
    );
  });

  it("does not require uppercase, numbers, or symbols for initial passwords", () => {
    assert.equal(validateInitialPassword("engine"), null);
    assert.equal(validateInitialPassword("Ithaca"), null);
  });

  it("requires matching initial passwords in the browser form", () => {
    const errors = validateAddUserForm(
      {
        firstName: "Pat",
        lastName: "Smith",
        badgeNumber: "101",
        email: "pat.smith@example.gov",
        title: "firefighter",
        role: "firefighter",
        active: true,
        initialPassword: "Truck7",
        confirmInitialPassword: "Engine4",
      },
      [...emptyExistingUsers],
    );

    assert.equal(errors.confirmInitialPassword, INITIAL_PASSWORD_MISMATCH_MESSAGE);
  });
});

describe("Add User form", () => {
  it("includes Initial Password and Confirm Initial Password fields", () => {
    assert.match(personnelFormFieldsSource, /Initial Password/);
    assert.match(personnelFormFieldsSource, /Confirm Initial Password/);
    assert.match(addUserFormSource, /initialPassword/);
    assert.match(addUserFormSource, /confirmInitialPassword/);
  });

  it("validates initial passwords in the browser", () => {
    assert.match(addUserFormSource, /validateAddUserForm/);
    assert.match(personnelSource, /validateInitialPassword/);
  });

  it("clears password fields after success", () => {
    assert.match(addUserFormSource, /setValues\(initialValues\)/);
    assert.match(addUserFormSource, /initialPassword: ""/);
  });

  it("does not display the password after user creation", () => {
    assert.match(
      addUserFormSource,
      /User created successfully\. Provide the initial password to the user securely\./,
    );
    assert.doesNotMatch(addUserFormSource, /clipboard/);
    const handleAddUserBlock = userManagementSource.match(
      /async function handleAddUser[\s\S]*?^  \}/m,
    );
    assert.ok(handleAddUserBlock, "handleAddUser should exist");
    assert.doesNotMatch(handleAddUserBlock[0], /temporaryPassword/);
    assert.doesNotMatch(handleAddUserBlock[0], /initialPassword/);
  });

  it("prevents duplicate form submissions", () => {
    assert.match(addUserFormSource, /if \(isSubmitting\)/);
    assert.match(addUserFormSource, /disabled=\{disabled \|\| isSubmitting\}/);
  });
});

describe("Add User server and API", () => {
  it("validates initial passwords on the server", () => {
    assert.match(adminPersonnelRouteSource, /validateInitialPassword/);
    assert.match(adminPersonnelServerSource, /validateInitialPassword/);
  });

  it("creates Auth accounts with email_confirm true and the assigned password", () => {
    assert.match(adminPersonnelServerSource, /email_confirm: true/);
    assert.match(adminPersonnelServerSource, /password: input\.initialPassword/);
  });

  it("does not insert passwords into public.personnel", () => {
    const createFunction = adminPersonnelServerSource.match(
      /export async function createPersonnelAuthAccount[\s\S]*?^}/m,
    );
    assert.ok(createFunction, "createPersonnelAuthAccount should exist");
    assert.doesNotMatch(createFunction[0], /\.insert\([\s\S]*initialPassword/);
    assert.doesNotMatch(createFunction[0], /\.insert\([\s\S]*password:/);
  });

  it("does not return the password from the API", () => {
    assert.match(
      adminPersonnelRouteSource,
      /return NextResponse\.json\(\{\s*ok: true,\s*personnel: created\.personnel,\s*\}\)/,
    );
    assert.doesNotMatch(adminPersonnelRouteSource, /temporaryPassword/);
    assert.doesNotMatch(adminPersonnelRouteSource, /ok: true[\s\S]*initialPassword/);
  });

  it("sets must_change_password for new accounts", () => {
    assert.match(adminPersonnelServerSource, /must_change_password: true/);
  });

  it("requires administrative authorization before creating accounts", () => {
    assert.match(adminPersonnelServerSource, /requireAdministrativePersonnel/);
    assert.match(adminPersonnelServerSource, /isAdministrativeRole/);
  });

  it("deletes the Auth user when personnel creation fails", () => {
    assert.match(adminPersonnelServerSource, /deleteAuthUserById/);
  });
});

describe("account creation types", () => {
  it("keeps initial passwords out of PersonnelRecord", () => {
    const personnelRecordBlock = typesPersonnelSource.match(
      /export interface PersonnelRecord[\s\S]*?^}/m,
    );
    assert.ok(personnelRecordBlock, "PersonnelRecord should exist");
    assert.doesNotMatch(personnelRecordBlock[0], /initialPassword/);
    assert.match(typesPersonnelSource, /CreatePersonnelAccountInput/);
  });
});

describe("forced permanent password policy", () => {
  it("requires strong permanent passwords after first login", () => {
    assert.match(changePasswordServerSource, /validatePermanentPassword/);
    assert.equal(validatePermanentPassword("short"), "Password must be at least 12 characters.");
  });

  it("keeps ordinary Change Password on the strong permanent policy", () => {
    assert.doesNotMatch(changePasswordServerSource, /validateInitialPassword/);
    assert.match(changePasswordServerSource, /validatePermanentPassword/);
  });
});

describe("administrator reset password", () => {
  it("uses the relaxed initial-password policy", () => {
    assert.match(adminPersonnelServerSource, /generateMemorableInitialPassword/);
    assert.match(adminPersonnelServerSource, /validateInitialPassword\(initialPassword\)/);
  });
});

describe("Edit User form", () => {
  it("does not expose password fields", () => {
    assert.doesNotMatch(editUserModalSource, /Initial Password/);
    assert.doesNotMatch(editUserModalSource, /initialPassword/);
  });
});

describe("memorable generated initial passwords", () => {
  it("generates easy-to-enter passwords with secure randomness", () => {
    const password = generateMemorableInitialPassword();
    assert.equal(validateInitialPassword(password), null);
    assert.ok(password.length >= 6);
  });
});

describe("server rejection message", () => {
  it("uses a safe message for invalid initial passwords", () => {
    assert.equal(
      INITIAL_PASSWORD_INVALID_SERVER_MESSAGE,
      "Initial password must be at least 6 characters and cannot contain only spaces.",
    );
  });
});
