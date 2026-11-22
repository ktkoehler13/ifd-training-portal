import assert from "node:assert/strict";
import { before, after, beforeEach, afterEach, describe, it } from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const EXPENSES = {
  registration_cost: 100, lodging_cost: 0, food_cost: 0, airfare_cost: 0,
  rental_vehicle_cost: 0, other_cost: 0, total_reimbursable_miles: 0,
  other_expense_description: "",
};

describe("decision changes and later expense edits (D27)", () => {
  let db: PGlite;
  const ids = {
    owner: "11111111-1111-4111-8111-111111111111",
    mto: "22222222-2222-4222-8222-222222222222",
    deputy: "33333333-3333-4333-8333-333333333333",
    office: "44444444-4444-4444-8444-444444444444",
  };
  let requestId: string;

  async function asUser(name: keyof typeof ids, role = "authenticated") {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ email: `${name}@example.test`, sub: ids[name] })]);
    await db.exec(`set role ${role}`);
  }
  async function reject(run: () => Promise<unknown>, pattern: RegExp) {
    await db.exec("savepoint rejected");
    await assert.rejects(run, pattern);
    await db.exec("rollback to savepoint rejected; release savepoint rejected");
  }
  async function complete(reservation: string, comments: string | null) {
    await db.exec("reset role; set role service_role");
    await db.query(
      "select complete_training_request_signature_action($1,$2,true,'training-request-signature-snapshots',$3,$4,'image/png',100)",
      [reservation, comments, `${requestId}/${reservation}/signature.png`, "a".repeat(64)],
    );
    await db.exec("reset role");
  }
  async function review(actor: "mto" | "deputy", action: string, comments: string | null = null) {
    await asUser(actor);
    const reservation = String((await db.query<{ id: string }>("select reserve_training_request_signature_action($1,$2) id", [requestId, action])).rows[0].id);
    await complete(reservation, comments);
  }
  async function version() {
    await db.exec("reset role");
    return (await db.query<{ updated_at: string }>("select updated_at from training_requests where id=$1", [requestId])).rows[0].updated_at;
  }
  async function reserveChange(actor: keyof typeof ids, change: string, expenses: object | null = null) {
    const updatedAt = await version();
    await asUser(actor);
    const id = String((await db.query<{ id: string }>("select reserve_training_request_decision_change($1,$2,$3,$4) id",
      [requestId, change, updatedAt, expenses ? JSON.stringify(expenses) : null])).rows[0].id);
    await db.exec("reset role");
    return id;
  }
  async function change(actor: "mto" | "deputy", kind: string, reason = "Budget changed", expenses: object | null = null) {
    await complete(await reserveChange(actor, kind, expenses), reason);
  }
  async function state() {
    return (await db.query<{ status: string; current_action_role: string | null; total_cost: string }>(
      "select status,current_action_role,total_cost from training_requests where id=$1", [requestId])).rows[0];
  }
  async function lastAction() {
    return (await db.query<{ action: string; decision_change: boolean; expense_changes: unknown; comments: string }>(
      "select action,decision_change,expense_changes,comments from training_request_actions where training_request_id=$1 order by created_at desc, id desc limit 1", [requestId])).rows[0];
  }
  async function events() {
    return (await db.query<{ event_type: string }>(
      "select event_type from training_request_notifications where training_request_id=$1 order by created_at, event_type", [requestId])).rows.map((r) => r.event_type);
  }
  // Event types emailed for the most recent action (all rows in one test share a timestamp).
  async function latestEvent() {
    return (await db.query<{ event_type: string }>(
      `select distinct n.event_type from training_request_notifications n
       where n.training_request_id=$1 and n.source_action_id = (select id from training_request_actions
         where training_request_id=$1 order by created_at desc, id desc limit 1)`, [requestId])).rows.map((r) => r.event_type).sort().join(",");
  }
  async function cityTasks() {
    return Number((await db.query<{ n: number }>("select count(*)::int n from training_request_city_authorizations where request_id=$1", [requestId])).rows[0].n);
  }
  async function setStart(offsetDays: number) {
    await db.exec("reset role; alter table training_requests disable trigger user");
    await db.query("update training_requests set start_date=(now() at time zone 'America/New_York')::date + $2::int, end_date=(now() at time zone 'America/New_York')::date + $2::int + 1 where id=$1", [requestId, offsetDays]);
    await db.exec("alter table training_requests enable trigger user");
  }
  // Separate transactions are not available inside one test, so action times
  // are spaced explicitly to keep "latest action" ordering deterministic.
  async function tick() {
    await db.exec("reset role");
    await db.query("update training_request_actions set created_at = created_at - interval '1 minute' where training_request_id=$1", [requestId]);
  }
  async function approveNormally() {
    await review("mto", "mto_approved"); await tick();
    await review("deputy", "deputy_chief_approved"); await tick();
  }

  before(async () => {
    db = new PGlite();
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
      alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
      create schema auth;
      create table auth.users (id uuid primary key, email text unique);
      create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
      create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
      grant usage on schema auth, public to authenticated, anon, service_role;
      create schema storage;
      create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
      create table storage.objects (id uuid default gen_random_uuid(), bucket_id text, name text);
      create function storage.foldername(text) returns text[] language sql as $$ select string_to_array($1, '/') $$;
    `);
    for (const file of (await readdir("supabase/migrations")).filter((f) => f.endsWith(".sql")).sort()) {
      try { await db.exec(await readFile(`supabase/migrations/${file}`, "utf8")); }
      catch (error) { throw new Error(`Migration failed: ${file}`, { cause: error }); }
    }
    for (const [name, role, title] of [
      ["owner", "firefighter", "firefighter"], ["mto", "mto", "lieutenant"],
      ["deputy", "deputy_chief", "deputy_chief"], ["office", "office", "firefighter"],
    ] as const) {
      await db.query("insert into personnel(id,badge_number,email,first_name,last_name,role,title,active) values ($1,$2,$3,$2,'Test',$4,$5,true)",
        [ids[name], name, `${name}@example.test`, role, title]);
    }
    for (const name of ["mto", "deputy"] as const) {
      await asUser(name);
      await db.query("insert into personnel_signatures(personnel_id,storage_bucket,storage_path,mime_type,file_size_bytes,certification_confirmed) values($1,'personnel-signatures',$2,'image/png',100,true)",
        [ids[name], `${ids[name]}/signature.png`]);
    }
    await db.exec("reset role");
  });
  beforeEach(async () => {
    await db.exec("reset role; begin");
    await asUser("owner");
    requestId = String((await db.query("insert into training_requests(training_title, registration_cost, total_cost) values ('Decision test', 100, 100) returning id")).rows[0].id);
    await db.query("select submit_training_request($1)", [requestId]);
    await setStart(10);
    await tick();
  });
  afterEach(async () => { await db.exec("rollback; reset role"); });
  after(async () => { await db?.close(); });

  it("switches an approved request to Denied with a signed, marked action and a denial email", async () => {
    await approveNormally();
    await change("deputy", "deny", "Training cancelled by provider");
    assert.equal((await state()).status, "denied");
    assert.equal((await state()).current_action_role, null);
    const action = await lastAction();
    assert.equal(action.action, "deputy_chief_denied");
    assert.equal(action.decision_change, true);
    assert.equal(action.comments, "Training cancelled by provider");
    assert.equal(await latestEvent(), "denied");
  });

  it("returns a DC-switched approval to MTO review when the MTO had denied it, then finalizes on MTO approval", async () => {
    await review("mto", "mto_denied", "Not in budget"); await tick();
    await change("deputy", "approve", "Funding found"); await tick();
    assert.equal((await state()).status, "pending_mto");
    assert.equal((await state()).current_action_role, "mto");
    assert.equal(await cityTasks(), 0);
    assert.equal(await latestEvent(), "pending_mto");
    await review("mto", "mto_approved");
    assert.equal((await state()).status, "approved");
    assert.equal(await cityTasks(), 1);
    assert.ok((await events()).includes("approved"));
    assert.ok((await events()).includes("office_city_authorization"));
    assert.equal((await db.query("select status from training_request_packets where request_id=$1", [requestId])).rows[0].status, "pending");
  });

  it("approves immediately when the other role's approval is still current", async () => {
    await approveNormally();
    await change("mto", "deny"); await tick();
    await change("mto", "approve", "Reconsidered");
    assert.equal((await state()).status, "approved");
    assert.equal((await lastAction()).action, "mto_approved");
    assert.equal(await cityTasks(), 1, "the existing City task is reused");
    assert.equal((await events()).filter((e) => e === "office_city_authorization").length, 1, "Office is not emailed twice");
  });

  it("sends a DC denial back to DC review when the MTO switches it back", async () => {
    await approveNormally();
    await change("deputy", "deny"); await tick();
    await change("mto", "approve");
    assert.equal((await state()).status, "pending_deputy_chief");
    assert.equal(await latestEvent(), "pending_deputy_chief");
  });

  it("re-signs approved expense edits, regenerates forms and records before/after", async () => {
    await approveNormally();
    await change("mto", "expenses", "Registration price increased", { ...EXPENSES, registration_cost: 150 });
    assert.equal(Number((await state()).total_cost), 150);
    assert.equal((await state()).status, "approved");
    const action = await lastAction();
    assert.equal(action.action, "mto_approved");
    assert.equal(action.decision_change, false);
    assert.ok(action.expense_changes);
    assert.equal(await latestEvent(), "approved");
    assert.equal((await db.query("select status from training_request_packets where request_id=$1", [requestId])).rows[0].status, "pending");
    assert.equal(await cityTasks(), 1);
  });

  it("invalidates the other role's approval after an expense change", async () => {
    await approveNormally();
    await change("mto", "expenses", "Lower cost", { ...EXPENSES, registration_cost: 80 }); await tick();
    await change("mto", "deny"); await tick();
    await change("mto", "approve");
    assert.equal((await state()).status, "pending_deputy_chief", "DC must approve the new amounts");
  });

  it("lets the Deputy Chief edit expenses during DC review only", async () => {
    await review("mto", "mto_approved"); await tick();
    const updatedAt = await version();
    await asUser("deputy");
    await db.query("select deputy_update_training_request_expenses($1,$2,$3,'Lodging added')", [requestId, updatedAt, JSON.stringify({ ...EXPENSES, lodging_cost: 200 })]);
    await db.exec("reset role");
    assert.equal(Number((await state()).total_cost), 300);
    assert.equal((await lastAction()).action, "deputy_chief_expenses_updated");
    const next = await version();
    await asUser("mto");
    await reject(() => db.query("select deputy_update_training_request_expenses($1,$2,$3,'x')", [requestId, next, JSON.stringify(EXPENSES)]), /Only active Deputy Chief/);
    await reject(() => db.query("select mto_update_training_request_expenses($1,$2,$3,'x')", [requestId, next, JSON.stringify(EXPENSES)]), /awaiting MTO review/);
    // updated_at is the transaction time inside one test, so the newer version is simulated.
    await db.exec("reset role; alter table training_requests disable trigger user");
    await db.query("update training_requests set updated_at = updated_at + interval '1 second' where id=$1", [requestId]);
    await db.exec("alter table training_requests enable trigger user");
    await asUser("deputy");
    await reject(() => db.query("select deputy_update_training_request_expenses($1,$2,$3,'x')", [requestId, updatedAt, JSON.stringify(EXPENSES)]), /has changed/);
    await db.exec("reset role");
  });

  it("blocks changes on or after the course start date", async () => {
    await approveNormally();
    for (const offset of [0, -3]) {
      await setStart(offset);
      await reject(() => reserveChange("deputy", "deny"), /before the course start date/);
    }
    await setStart(5);
    const reservation = await reserveChange("deputy", "deny");
    await setStart(0);
    await reject(() => complete(reservation, "Late"), /before the course start date/);
  });

  it("rejects the wrong people, states, missing reasons and stale versions", async () => {
    for (const actor of ["owner", "office"] as const) await reject(() => reserveChange(actor, "deny"), /Only active MTO or Deputy Chief/);
    await reject(() => reserveChange("mto", "deny"), /Only an approved request/);
    await approveNormally();
    await reject(() => reserveChange("mto", "approve"), /Only a denied request/);
    await reject(() => reserveChange("mto", "deny", EXPENSES), /only accepted when re-signing/);
    await reject(() => reserveChange("mto", "expenses", { ...EXPENSES, unknown_field: 1 }), /Only estimated expense fields/);
    const reservation = await reserveChange("mto", "deny");
    await reject(() => complete(reservation, "  "), /Enter a reason/);
    await reject(() => reserveChange("deputy", "deny"), /signature action is in progress/);
    const stale = await version();
    await db.query("update training_request_signature_action_reservations set expires_at=now() - interval '1 second' where id=$1", [reservation]);
    await db.exec("alter table training_requests disable trigger user");
    await db.query("update training_requests set updated_at = updated_at + interval '1 second' where id=$1", [requestId]);
    await db.exec("alter table training_requests enable trigger user");
    await asUser("deputy");
    await reject(() => db.query("select reserve_training_request_decision_change($1,'deny',$2,null)", [requestId, stale]), /has changed/);
    await asUser("deputy", "anon");
    await reject(() => db.query("select reserve_training_request_decision_change($1,'deny',$2,null)", [requestId, stale]), /permission denied/);
    await db.exec("reset role");
  });
});
