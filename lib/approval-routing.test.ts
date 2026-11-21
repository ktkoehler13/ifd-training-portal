import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cityAuthorizationNeedsAction } from "./city-authorization/model";
import { compensationNeedsAction } from "./compensation/access";
import { isRoutingSlot, ROUTING_SETTING_KEYS } from "./approval-routing";

describe("primary Office action badge", () => {
  it("alerts every Office user until a primary is chosen", () => {
    assert.equal(cityAuthorizationNeedsAction("pending", "office", "office-a", null), true);
    assert.equal(cityAuthorizationNeedsAction("pending", "office", "office-b"), true);
    assert.equal(compensationNeedsAction({ requester_id: "owner", status: "pending_office" }, { id: "office-b", role: "office" }, ""), true);
  });
  it("alerts only the primary Office person once chosen; backups stay quiet", () => {
    assert.equal(cityAuthorizationNeedsAction("pending", "office", "office-a", "office-a"), true);
    assert.equal(cityAuthorizationNeedsAction("pending", "office", "office-b", "office-a"), false);
    assert.equal(compensationNeedsAction({ requester_id: "owner", status: "pending_office" }, { id: "office-a", role: "office" }, "office-a"), true);
    assert.equal(compensationNeedsAction({ requester_id: "owner", status: "pending_office" }, { id: "office-b", role: "office" }, "office-a"), false);
    for (const role of ["admin", "mto", "deputy_chief"] as const) assert.equal(cityAuthorizationNeedsAction("pending", role, "x", null), false);
  });
  it("does not change MTO or requester compensation badges", () => {
    assert.equal(compensationNeedsAction({ requester_id: "owner", status: "pending_mto" }, { id: "mto-b", role: "mto" }, "office-a"), true);
    assert.equal(compensationNeedsAction({ requester_id: "owner", status: "returned" }, { id: "owner", role: "firefighter" }, "office-a"), true);
  });
  it("maps only the three routing slots to settings keys", () => {
    assert.deepEqual(ROUTING_SETTING_KEYS, { mto: "primary_approval_mto", office: "primary_office", chief: "fire_chief" });
    assert.equal(isRoutingSlot("deputy_chief"), false);
    assert.equal(isRoutingSlot("office"), true);
  });
});
