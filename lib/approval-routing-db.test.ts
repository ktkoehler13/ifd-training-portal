import assert from "node:assert/strict";
import { before, after, beforeEach, afterEach, describe, it } from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

describe("approval routing: primary MTO, primary Office and Fire Chief", () => {
  let db: PGlite;
  const ids = {
    owner: "11111111-1111-4111-8111-111111111111",
    mto: "22222222-2222-4222-8222-222222222222",
    mto2: "33333333-3333-4333-8333-333333333333",
    office: "44444444-4444-4444-8444-444444444444",
    office2: "55555555-5555-4555-8555-555555555555",
    chief: "66666666-6666-4666-8666-666666666666",
    deputy: "77777777-7777-4777-8777-777777777777",
  };
  let requestId: string;
  let actionId: string;
  async function asUser(name: keyof typeof ids, role = "authenticated") {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ email: `${name}@example.test`, sub: ids[name] })]);
    await db.exec(`set role ${role}`);
  }
  async function route(key: string, id: string | null, actor: keyof typeof ids = "mto") {
    await asUser(actor);
    await db.query("select set_approval_routing($1,$2)", [key, id]);
    await db.exec("reset role");
  }
  async function reject(run: () => Promise<unknown>, pattern: RegExp) {
    await db.exec("savepoint rejected");
    await assert.rejects(run, pattern);
    await db.exec("rollback to savepoint rejected; release savepoint rejected");
  }
  async function alerts(event: string) {
    return (await db.query<{ recipient_personnel_id: string; status: string; last_error: string | null }>(
      "select recipient_personnel_id,status,last_error from training_request_notifications where training_request_id=$1 and event_type=$2 order by recipient_personnel_id",
      [requestId, event])).rows;
  }
  async function approveByDeputy() {
    await db.exec("alter table training_requests disable trigger user");
    await db.query("update training_requests set status='approved', current_action_role=null where id=$1", [requestId]);
    await db.exec("alter table training_requests enable trigger user");
    return String((await db.query("insert into training_request_actions(training_request_id,actor_personnel_id,actor_name,actor_badge_number,actor_role,action,created_at) values($1,$2,'Deputy Test','deputy','deputy_chief','deputy_chief_approved',now()+interval '2 second') returning id", [requestId, ids.deputy])).rows[0].id);
  }
  async function mtoSignsCompensation() {
    const packetId = String((await db.query(`insert into training_compensation_packets(request_id,requester_id,status,data,identity,requester_signature,mto_signature,pdf_path,pdf_sha256)
      values($1,$2,'pending_office','{}','{}','{}','{}','packet.pdf',$3) returning id`, [requestId, ids.owner, "c".repeat(64)])).rows[0].id);
    return String((await db.query("insert into training_compensation_events(packet_id,action,actor_id,actor_name,version,snapshot) values($1,'mto_approved',$2,'MTO Test',2,'{}') returning id", [packetId, ids.mto])).rows[0].id);
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
      ["owner", "firefighter", "firefighter"], ["mto", "mto", "lieutenant"], ["mto2", "mto", "lieutenant"],
      ["office", "office", "firefighter"], ["office2", "office", "firefighter"],
      ["chief", "admin", "fire_chief"], ["deputy", "deputy_chief", "deputy_chief"],
    ] as const) {
      await db.query("insert into personnel(id,badge_number,email,first_name,last_name,role,title,active) values ($1,$2,$3,$2,'Test',$4,$5,true)",
        [ids[name], name, `${name}@example.test`, role, title]);
    }
  });
  beforeEach(async () => {
    await db.exec("reset role; begin");
    await asUser("owner");
    requestId = String((await db.query("insert into training_requests(training_title) values ('Routing test') returning id")).rows[0].id);
    await db.query("select submit_training_request($1)", [requestId]);
    await db.exec("reset role");
    actionId = String((await db.query("select id from training_request_actions where training_request_id=$1 and action='submitted'", [requestId])).rows[0].id);
    await db.query("delete from training_request_notifications where training_request_id=$1", [requestId]);
  });
  afterEach(async () => { await db.exec("rollback; reset role"); });
  after(async () => { await db?.close(); });

  it("emails every MTO until a primary MTO is chosen, then only the primary", async () => {
    await db.query("select enqueue_training_request_notifications($1,$2,'pending_mto')", [requestId, actionId]);
    assert.deepEqual((await alerts("pending_mto")).map((a) => a.recipient_personnel_id), [ids.mto, ids.mto2]);
    await db.query("delete from training_request_notifications where training_request_id=$1", [requestId]);
    await route("primary_approval_mto", ids.mto2);
    await db.query("select enqueue_training_request_notifications($1,$2,'pending_mto')", [requestId, actionId]);
    assert.deepEqual((await alerts("pending_mto")).map((a) => a.recipient_personnel_id), [ids.mto2]);
  });
  it("moves unsent MTO alerts to a newly chosen primary MTO", async () => {
    await db.query("select enqueue_training_request_notifications($1,$2,'pending_mto')", [requestId, actionId]);
    await route("primary_approval_mto", ids.mto2);
    assert.deepEqual((await alerts("pending_mto")).map((a) => [a.recipient_personnel_id, a.status]), [[ids.mto, "skipped"], [ids.mto2, "pending"]]);
    await route("primary_approval_mto", ids.mto);
    assert.deepEqual((await alerts("pending_mto")).map((a) => a.status), ["pending", "skipped"]);
  });
  it("leaves backup MTO review access unchanged", async () => {
    await route("primary_approval_mto", ids.mto);
    await asUser("mto2");
    await db.query("select mto_return_training_request($1,'Fix dates')", [requestId]);
    await db.exec("reset role");
    assert.equal((await db.query("select status from training_requests where id=$1", [requestId])).rows[0].status, "returned_for_correction");
  });
  it("emails all Office users about a new City Authorization task until a primary is chosen", async () => {
    const dcAction = await approveByDeputy();
    const rows = (await db.query<{ recipient_personnel_id: string; source_action_id: string; subject: string }>(
      "select recipient_personnel_id,source_action_id,subject from training_request_notifications where training_request_id=$1 and event_type='office_city_authorization' order by recipient_personnel_id", [requestId])).rows;
    assert.deepEqual(rows.map((r) => r.recipient_personnel_id), [ids.office, ids.office2]);
    assert.ok(rows.every((r) => r.source_action_id === dcAction && r.subject.startsWith("City Authorization needed")));
  });
  it("emails only the primary Office person and moves unsent Office alerts on change", async () => {
    await route("primary_office", ids.office2);
    await approveByDeputy();
    await mtoSignsCompensation();
    assert.deepEqual((await alerts("office_city_authorization")).map((a) => a.recipient_personnel_id), [ids.office2]);
    assert.deepEqual((await alerts("office_compensation")).map((a) => a.recipient_personnel_id), [ids.office2]);
    await route("primary_office", ids.office);
    for (const event of ["office_city_authorization", "office_compensation"]) {
      assert.deepEqual((await alerts(event)).map((a) => [a.recipient_personnel_id, a.status]), [[ids.office, "pending"], [ids.office2, "skipped"]]);
    }
  });
  it("does not email Office for compensation events other than the MTO signature", async () => {
    const packetId = String((await db.query("insert into training_compensation_packets(request_id,requester_id,data,identity) values($1,$2,'{}','{}') returning id", [requestId, ids.owner])).rows[0].id);
    await db.query("insert into training_compensation_events(packet_id,action,actor_id,actor_name,version,snapshot) values($1,'submitted',$2,'Owner',1,'{}')", [packetId, ids.owner]);
    assert.equal((await alerts("office_compensation")).length, 0);
  });
  it("records the Fire Chief without creating alerts, and allows clearing", async () => {
    await route("fire_chief", ids.chief);
    assert.equal((await db.query("select value from system_settings where key='fire_chief'")).rows[0].value, ids.chief);
    assert.equal((await db.query("select count(*)::int n from training_request_notifications")).rows[0].n, 0);
    await route("fire_chief", null);
    assert.equal((await db.query("select value from system_settings where key='fire_chief'")).rows[0].value, "");
    const audit = (await db.query("select old_value,new_value,changed_by_personnel_id from system_settings_audit where setting_key='fire_chief' order by changed_at, new_value desc")).rows;
    assert.equal(audit.length, 2);
  });
  it("rejects non-administrators, unknown keys and ineligible people", async () => {
    for (const actor of ["owner", "office"] as const) {
      await asUser(actor);
      await reject(() => db.query("select set_approval_routing('primary_office',$1)", [ids.office]), /Administrative access required/);
    }
    await asUser("mto");
    await reject(() => db.query("select set_approval_routing('primary_approval_deputy_chief',$1)", [ids.deputy]), /Unknown routing setting/);
    for (const [key, id] of [["primary_approval_mto", ids.office], ["primary_office", ids.mto], ["fire_chief", ids.mto], ["primary_office", "99999999-9999-4999-8999-999999999999"]]) {
      await reject(() => db.query("select set_approval_routing($1,$2)", [key, id]), /eligible active person/);
    }
    await asUser("owner", "anon");
    await reject(() => db.query("select set_approval_routing('fire_chief',$1)", [ids.chief]), /permission denied/);
    await db.exec("reset role");
  });
  it("prevents removing a selected person until someone else is chosen", async () => {
    await route("primary_approval_mto", ids.mto2);
    await route("primary_office", ids.office);
    await route("fire_chief", ids.chief);
    for (const [sql, id, message] of [
      ["update personnel set active=false where id=$1", ids.mto2, /another primary MTO/],
      ["update personnel set role='firefighter' where id=$1", ids.office, /another primary Office/],
      ["update personnel set title='deputy_chief' where id=$1", ids.chief, /another Fire Chief/],
      ["delete from personnel where id=$1", ids.office, /another primary Office/],
    ] as const) await reject(() => db.query(sql, [id]), message);
    await route("primary_office", ids.office2);
    await db.query("update personnel set active=false where id=$1", [ids.office]);
  });
});
