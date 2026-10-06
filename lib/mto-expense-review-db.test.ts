import assert from "node:assert/strict";
import { before, after, beforeEach, afterEach, describe, it } from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

// Execute the real migrations and RLS policies in isolated PostgreSQL. Only
// Supabase's external auth/storage schemas are represented by test fixtures.
describe("MTO expense review database boundary", () => {
  let db: PGlite;
  let requestId: string;
  let version: string;
  const values = {
    registration_cost: 125,
    lodging_cost: 200,
    food_cost: 75,
    airfare_cost: 0,
    rental_vehicle_cost: 0,
    other_cost: 10,
    other_expense_description: "Parking",
    total_reimbursable_miles: 100,
  };
  async function asUser(email: string, role = "authenticated") {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claims', $1, false)", [
      JSON.stringify({ email, sub: "00000000-0000-0000-0000-000000000001" }),
    ]);
    await db.exec(`set role ${role}`);
  }
  async function update(
    overrides: Record<string, unknown> = {},
    reason: string | null = "Updated estimates",
    expected: string | null = version,
  ) {
    return db.query(
      "select * from mto_update_training_request_expenses($1, $2, $3, $4)",
      [
        requestId,
        expected,
        JSON.stringify({ ...values, ...overrides }),
        reason,
      ],
    );
  }
  async function requestRow() {
    return (
      await db.query(
        "select *, updated_at::text as version from training_requests where id=$1",
        [requestId],
      )
    ).rows[0];
  }
  before(async () => {
    db = new PGlite();
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
      alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
      create schema auth;
      create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
      create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
      grant usage on schema auth, public to authenticated, anon, service_role;
      create schema storage;
      create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
      create table storage.objects (id uuid default gen_random_uuid(), bucket_id text, name text);
      create function storage.foldername(text) returns text[] language sql as $$ select string_to_array($1, '/') $$;
    `);
    for (const file of (await readdir("supabase/migrations"))
      .filter((file) => file.endsWith(".sql"))
      .sort()) {
      try {
        await db.exec(await readFile(`supabase/migrations/${file}`, "utf8"));
      } catch (error) {
        throw new Error(`Migration failed: ${file}`, { cause: error });
      }
    }
    await db.exec(`insert into personnel (badge_number,email,role,first_name,last_name,active) values
      ('1','requester@example.test','firefighter','Request','Owner',true),
      ('2','mto@example.test','mto','MTO','Reviewer',true),
      ('3','deputy@example.test','deputy_chief','Deputy','Reviewer',true),
      ('4','admin@example.test','admin','Admin','User',true),
      ('5','inactive@example.test','mto','Inactive','Reviewer',false);`);
    await asUser("mto@example.test");
    await db.exec(`insert into personnel_signatures(personnel_id, storage_bucket, storage_path, mime_type, file_size_bytes, certification_confirmed)
      select id, 'personnel-signatures', id::text || '/signature.png', 'image/png', 100, true from personnel where email='mto@example.test';`);
  });
  beforeEach(async (context) => {
    await asUser("requester@example.test");
    const result =
      await db.query(`insert into training_requests (training_title, registration_cost, lodging_cost, food_cost, other_cost, other_expense_description, total_reimbursable_miles, gsa_mileage_rate, mileage_cost, total_cost)
      values ('Expense Review Test',100,200,75,10,'Parking',60,0.7,42,427) returning id`);
    requestId = String(result.rows[0].id);
    if (!context.name.includes("editing in draft"))
      await db.query("select submit_training_request($1)", [requestId]);
    await asUser("mto@example.test");
    version = String((await requestRow()).version);
  });
  afterEach(async () => {
    await db.exec("reset role");
    await db.query("delete from training_requests where id=$1", [requestId]);
  });
  after(async () => {
    await db?.close();
  });

  it("updates only expenses, calculates from the stored rate, and records accurate immutable history", async () => {
    const original = await requestRow();
    await update();
    const revised = await requestRow();
    assert.equal(Number(revised.mileage_cost), 70);
    assert.equal(Number(revised.total_cost), 480);
    const changed = new Set([
      "registration_cost",
      "total_reimbursable_miles",
      "mileage_cost",
      "total_cost",
      "updated_at",
      "version",
    ]);
    for (const key of Object.keys(original))
      if (!changed.has(key)) assert.deepEqual(revised[key], original[key], key);
    const history = (
      await db.query(
        "select * from training_request_actions where training_request_id=$1 and action='mto_expenses_updated'",
        [requestId],
      )
    ).rows[0];
    assert.equal(history.actor_role, "mto");
    assert.equal(history.actor_name, "MTO Reviewer");
    assert.equal(history.comments, "Updated estimates");
    assert.equal(history.electronic_signature_confirmed, false);
    assert.equal(history.signature_storage_path, null);
    const snapshot = history.expense_changes as {
      before: Record<string, number>;
      after: Record<string, number>;
    };
    assert.equal(snapshot.before.total_cost, 427);
    assert.equal(snapshot.after.total_cost, 480);
    assert.equal(snapshot.after.gsa_mileage_rate, 0.7);
    assert.equal(
      (
        await db.query(
          "update training_request_actions set comments='tampered' where id=$1 returning id",
          [history.id],
        )
      ).rows.length,
      0,
    );
    assert.equal(
      (
        await db.query(
          "delete from training_request_actions where id=$1 returning id",
          [history.id],
        )
      ).rows.length,
      0,
    );
    await asUser("requester@example.test");
    assert.equal(
      (
        await db.query("select id from training_request_actions where id=$1", [
          history.id,
        ])
      ).rows.length,
      1,
    );
  });

  it("uses a historical fractional mileage rate even when the global rate changes", async () => {
    await db.exec("reset role");
    await db.query(
      "update training_requests set gsa_mileage_rate=0.725 where id=$1",
      [requestId],
    );
    await db.exec(
      "insert into system_settings(key,value) values ('gsa_mileage_rate','0.99') on conflict(key) do update set value='0.99'",
    );
    await asUser("mto@example.test");
    version = String((await requestRow()).version);
    await update({ total_reimbursable_miles: 100.5 });
    assert.equal(Number((await requestRow()).mileage_cost), 72.86);
    assert.equal(Number((await requestRow()).gsa_mileage_rate), 0.725);
  });

  it("preserves signed approval snapshots when a returned request reaches MTO review again", async () => {
    const reservation = (
      await db.query(
        "select reserve_training_request_signature_action_for_version($1, 'mto_approved', $2) as id",
        [requestId, version],
      )
    ).rows[0].id;
    await db.exec("reset role; set role service_role");
    await db.query(
      "select complete_training_request_signature_action($1, 'First approval', true, 'training-request-signature-snapshots', $2, $3, 'image/png', 100)",
      [
        reservation,
        `${requestId}/${reservation}/signature.png`,
        "a".repeat(64),
      ],
    );
    const signed = (
      await db.query("select * from training_request_actions where id=$1", [
        reservation,
      ])
    ).rows[0];
    assert.equal(signed.electronic_signature_confirmed, true);
    await asUser("deputy@example.test");
    await db.query(
      "select deputy_return_training_request($1, 'Update course information')",
      [requestId],
    );
    await asUser("requester@example.test");
    await db.query("select resubmit_training_request($1)", [requestId]);
    await asUser("mto@example.test");
    version = String((await requestRow()).version);
    await update();
    const preserved = (
      await db.query("select * from training_request_actions where id=$1", [
        reservation,
      ])
    ).rows[0];
    assert.deepEqual(preserved, signed);
  });
  for (const email of [
    "requester@example.test",
    "deputy@example.test",
    "admin@example.test",
    "inactive@example.test",
    "unknown@example.test",
  ]) {
    it(`rejects expense edits by ${email}`, async () => {
      await asUser(email);
      await assert.rejects(
        () => update(),
        /Only active MTO|Active authenticated/,
      );
    });
  }
  it("does not grant anonymous RPC access or general MTO write access", async () => {
    assert.equal(
      (
        await db.query(
          "update training_requests set registration_cost=999 where id=$1 returning id",
          [requestId],
        )
      ).rows.length,
      0,
    );
    await asUser("", "anon");
    await assert.rejects(() => update(), /permission denied/);
  });
  for (const status of [
    "draft",
    "pending_deputy_chief",
    "returned_for_correction",
    "approved",
    "denied",
    "cancelled",
  ]) {
    it(`rejects editing in ${status}`, async () => {
      await db.exec("reset role");
      if (status !== "draft")
        await db.query("update training_requests set status=$1 where id=$2", [
          status,
          requestId,
        ]);
      await asUser("mto@example.test");
      await assert.rejects(
        () => update(),
        /only be edited while awaiting MTO review/,
      );
    });
  }
  it("rejects missing reasons, invalid inputs and fields outside expenses without partial writes", async () => {
    for (const reason of [null, "", "\t\n", "x".repeat(2001)])
      await assert.rejects(() => update({}, reason), /Enter a reason/);
    for (const amount of [-1, 1.001, "NaN", null, "125", 10000000])
      await assert.rejects(
        () => update({ registration_cost: amount }),
        /numeric value|nonnegative/,
      );
    for (const field of [
      "gsa_mileage_rate",
      "total_cost",
      "mileage_cost",
      "training_title",
      "status",
      "requester_personnel_id",
    ]) {
      await assert.rejects(
        () => update({ [field]: 999 }),
        /Only estimated expense fields/,
      );
    }
    assert.equal(Number((await requestRow()).total_cost), 427);
    assert.equal(
      (
        await db.query(
          "select * from training_request_actions where action='mto_expenses_updated' and training_request_id=$1",
          [requestId],
        )
      ).rows.length,
      0,
    );
  });
  it("requires a description for a changed positive Other Expense", async () => {
    await assert.rejects(
      () => update({ other_expense_description: "\t\n" }),
      /Describe Other Expense/,
    );
    await assert.rejects(
      () => update({ other_expense_description: null }),
      /must be text/,
    );
    await update({ other_expense_description: "Tolls", other_cost: 20 });
    assert.equal((await requestRow()).other_expense_description, "Tolls");
  });
  it("preserves historical missing descriptions and rates when their amounts are unchanged", async () => {
    await db.exec("reset role");
    await db.query(
      "update training_requests set other_expense_description=null, gsa_mileage_rate=0 where id=$1",
      [requestId],
    );
    await asUser("mto@example.test");
    version = String((await requestRow()).version);
    await update({
      other_expense_description: "",
      total_reimbursable_miles: 60,
    });
    assert.equal(Number((await requestRow()).mileage_cost), 42);
    assert.equal((await requestRow()).other_expense_description, null);
    version = String((await requestRow()).version);
    await assert.rejects(
      () => update({ other_expense_description: "", other_cost: 20 }),
      /Describe Other Expense/,
    );
    await assert.rejects(() => update(), /stored mileage rate/);
  });
  it("blocks department-vehicle mileage changes", async () => {
    await db.exec("reset role");
    await db.query(
      "update training_requests set vehicle_requested=true, mileage_cost=0, total_reimbursable_miles=0, total_cost=385 where id=$1",
      [requestId],
    );
    await asUser("mto@example.test");
    version = String((await requestRow()).version);
    await assert.rejects(() => update(), /department vehicle/);
    await update({ total_reimbursable_miles: 0 });
    assert.equal(Number((await requestRow()).mileage_cost), 0);
  });
  it("rejects stale saves and stale signature attempts", async () => {
    await update();
    await assert.rejects(
      () => update({ lodging_cost: 250 }),
      /request has changed/,
    );
    await assert.rejects(
      () => update({}, "reason", null),
      /request has changed/,
    );
    await assert.rejects(
      () =>
        db.query(
          "select reserve_training_request_signature_action_for_version($1, 'mto_approved', $2)",
          [requestId, version],
        ),
      /request has changed/,
    );
    const current = String((await requestRow()).version);
    const result = await db.query(
      "select reserve_training_request_signature_action_for_version($1, 'mto_approved', $2) as id",
      [requestId, current],
    );
    assert.ok(result.rows[0].id);
    await assert.rejects(
      () => update({ lodging_cost: 250 }, "Revised hotel", current),
      /signature action is in progress/,
    );
  });
  it("rejects a no-op without adding history or changing the version", async () => {
    await assert.rejects(
      () => update({ registration_cost: 100, total_reimbursable_miles: 60 }),
      /No expense changes/,
    );
    assert.equal(String((await requestRow()).version), version);
  });
});
