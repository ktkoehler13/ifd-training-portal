import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { deriveApprovalInitials } from "./derive-approval-initials";

describe("deriveApprovalInitials", () => {
  it("derives two-letter initials from first and last name", () => {
    assert.equal(deriveApprovalInitials("Kevin Koehler"), "KK");
  });

  it("includes middle-name initials", () => {
    assert.equal(deriveApprovalInitials("Kevin T. Koehler"), "KTK");
  });

  it("ignores punctuation-only name parts", () => {
    assert.equal(deriveApprovalInitials("K. Koehler"), "KK");
  });

  it("returns empty string for blank input", () => {
    assert.equal(deriveApprovalInitials(""), "");
    assert.equal(deriveApprovalInitials(null), "");
  });
});
