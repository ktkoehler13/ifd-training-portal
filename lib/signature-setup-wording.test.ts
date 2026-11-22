import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

// First-time signers must see that their signature is saved for reuse (D15).
describe("signature setup wording", () => {
  const setup = readFileSync("components/signature/WorkflowSignatureSetup.tsx", "utf8");
  const dialog = readFileSync("components/signature/AddSignatureDialog.tsx", "utf8");
  const create = readFileSync("components/signature/SignatureCreateCanvas.tsx", "utf8");

  it("offers Sign and Save Signature when none is saved, and Change Signature when one is", () => {
    assert.match(setup, /preview \? "Change Signature" : "Sign and Save Signature"/);
    assert.match(setup, /Using your saved signature/);
    assert.match(setup, /You don&apos;t have a saved signature yet/);
  });

  it("labels every save button in the setup window Sign and Save Signature", () => {
    for (const source of [dialog, create]) {
      assert.doesNotMatch(source, /"Add Signature"/);
      assert.match(source, /Sign and Save Signature/);
    }
    assert.match(dialog, /My signature in the account menu/);
  });
});
