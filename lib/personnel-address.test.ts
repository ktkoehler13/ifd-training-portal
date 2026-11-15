import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizePersonnelAddress, prefillNewRequestAddress, samePersonnelAddress, validatePersonnelAddress } from "./personnel-address";

const address = { requesterAddress: "123 Example St Apt 2", requesterCity: "Ithaca", requesterState: "NY", requesterZip: "14850-1234" };

describe("saved profile address and request snapshots", () => {
  it("normalizes only address fields, excluding phone and training ID", () => {
    assert.deepEqual(normalizePersonnelAddress({ ...address, requesterAddress: "  123  Example St\nApt 2 ", requesterState: " ny ", requesterPhone: "6075550100", nyTrainingId: "00123456", academySsnLast4: "0012" }), address);
  });
  it("requires a complete valid address with bounded lengths", () => {
    assert.equal(Object.keys(validatePersonnelAddress({})).length, 4);
    assert.deepEqual(validatePersonnelAddress(address), {});
    assert.deepEqual(validatePersonnelAddress({ ...address, requesterZip: "01234" }), {});
    const errors = validatePersonnelAddress({ requesterAddress: "a".repeat(161), requesterCity: "c".repeat(81), requesterState: "New York", requesterZip: "123" });
    assert.equal(Object.keys(errors).length, 4);
    assert.ok(validatePersonnelAddress({ ...address, requesterAddress: " \n " }).requesterAddress);
  });
  it("prefills a new blank request without changing other details or the saved address", () => {
    const draft = { courseName: "Test", requesterPhone: "6075550100" };
    const result = prefillNewRequestAddress(draft, address, false, false);
    assert.deepEqual(result, { ...draft, ...address });
    assert.deepEqual(draft, { courseName: "Test", requesterPhone: "6075550100" });
    assert.notEqual(result, address);
  });
  it("never overwrites drafts or returned requests, even when their address is blank", () => {
    const draft = { requesterAddress: "" };
    assert.equal(prefillNewRequestAddress(draft, address, true, false), draft);
    assert.equal(prefillNewRequestAddress({ ...address }, { ...address, requesterCity: "Albany" }, true, false).requesterCity, "Ithaca");
  });
  it("protects manual input and deliberately cleared fields from a slow profile load", () => {
    const blank = { requesterAddress: "" };
    const partial = { requesterCity: "Albany" };
    assert.equal(prefillNewRequestAddress(blank, address, false, true), blank);
    assert.equal(prefillNewRequestAddress(partial, address, false, false), partial);
    assert.equal(prefillNewRequestAddress(blank, null, false, false), blank);
  });
  it("detects changed addresses while ignoring formatting and other student details", () => {
    assert.equal(samePersonnelAddress(address, { ...address, requesterState: "ny", requesterPhone: "6075550100" }), true);
    assert.equal(samePersonnelAddress(address, { ...address, requesterZip: "14851" }), false);
  });
});
