import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { accountNavLinks, adminNavLinks, isActiveNavLink, personnelInitials, primaryNavLinks } from "./navigation";
import { ownRequestHref, requestStatusTone, timeOfDayGreeting } from "./request-status";

const labels = (links: { label: string }[]) => links.map((link) => link.label);

describe("portal navigation", () => {
  it("shows each role only the sections it can use", () => {
    assert.deepEqual(labels(primaryNavLinks("firefighter")), ["Dashboard", "My requests", "Compensation"]);
    assert.deepEqual(labels(primaryNavLinks("office")), ["Dashboard", "My requests", "Compensation", "City Authorizations"]);
    assert.deepEqual(labels(primaryNavLinks("mto")), ["Dashboard", "My requests", "Approvals", "Compensation", "City Authorizations"]);
    assert.deepEqual(labels(primaryNavLinks("deputy_chief")), ["Dashboard", "My requests", "Approvals", "Compensation", "City Authorizations"]);
    assert.deepEqual(labels(primaryNavLinks("admin")), ["Dashboard", "My requests", "Compensation", "City Authorizations"]);
  });
  it("limits the Admin menu to administrative roles", () => {
    assert.equal(adminNavLinks("firefighter").length, 0);
    for (const role of ["mto", "deputy_chief", "admin", "office"] as const) {
      assert.deepEqual(adminNavLinks(role).map((link) => link.href), ["/admin/users", "/admin/requests", "/admin/approved-training", "/admin/settings"]);
    }
  });
  it("offers profile, signature and password in the account menu", () => {
    assert.deepEqual(accountNavLinks("firefighter").map((link) => link.href), ["/settings/profile", "/settings/signature", "/settings/password"]);
  });
  it("highlights the current section, including its sub-pages", () => {
    assert.equal(isActiveNavLink("/dashboard", "/dashboard"), true);
    assert.equal(isActiveNavLink("/dashboard", "/dashboard/x"), false);
    assert.equal(isActiveNavLink("/requests", "/requests/abc/confirmation"), true);
    assert.equal(isActiveNavLink("/requests", "/requests/new"), false);
    assert.equal(isActiveNavLink("/approvals", "/approvals/123"), true);
    assert.equal(isActiveNavLink("/compensation", "/compensation-other"), false);
  });
  it("builds initials from names, falling back to the badge", () => {
    assert.equal(personnelInitials("Kevin", "Koehler", "207"), "KK");
    assert.equal(personnelInitials(null, " ", "207"), "20");
  });
});

describe("request status presentation", () => {
  it("colors statuses by meaning", () => {
    assert.equal(requestStatusTone("draft"), "neutral");
    assert.equal(requestStatusTone("pending_mto"), "waiting");
    assert.equal(requestStatusTone("pending_deputy_chief"), "waiting");
    assert.equal(requestStatusTone("returned_for_correction"), "attention");
    assert.equal(requestStatusTone("approved"), "success");
    assert.equal(requestStatusTone("denied"), "danger");
    assert.equal(requestStatusTone("cancelled"), "neutral");
  });
  it("opens drafts in the editor and everything else on its request page", () => {
    assert.equal(ownRequestHref({ id: "a b", status: "draft" }), "/requests/new?draft=a%20b");
    assert.equal(ownRequestHref({ id: "x", status: "approved" }), "/requests/x/confirmation");
  });
  it("greets by time of day", () => {
    assert.equal(timeOfDayGreeting(8), "Good morning");
    assert.equal(timeOfDayGreeting(13), "Good afternoon");
    assert.equal(timeOfDayGreeting(19), "Good evening");
  });
});
