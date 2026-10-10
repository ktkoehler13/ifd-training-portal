import assert from "node:assert/strict";
import { it } from "node:test";
import { getRequestReturnPath, passwordSetupReturnPath } from "./request-return-path";

const id = "12345678-1234-1234-1234-123456789abc";
it("returns the same approval or request link after login", () => {
  for (const path of [`/approvals/${id}`, `/requests/${id}/confirmation`]) {
    assert.equal(getRequestReturnPath(path), path);
    assert.equal(new URL(passwordSetupReturnPath(path), "https://portal.test").searchParams.get("next"), path);
  }
});
it("cannot turn an email return path into an open redirect or another endpoint", () => {
  for (const value of [null, undefined, 42, "https://evil.test", "//evil.test", "/\\evil.test", "/dashboard", `/approvals/${id}?next=https://evil.test`, `/approvals/${id}/../..`, `/approvals/${id}\n`, `/requests/${id}/edit`, `/%61pprovals/${id}`, `/approvals/${id}#x`]) {
    assert.equal(getRequestReturnPath(value), null, String(value));
    assert.equal(passwordSetupReturnPath(value), "/settings/password?required=1");
  }
});
