import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { drawTypedSignature, normalizeSignatureName } from "./personnel-signature-text";

function canvasFixture() {
  const written: unknown[][] = [];
  const context = {
    font: "", fillStyle: "", textAlign: "", textBaseline: "",
    fillRect() {}, measureText(text: string) { return { width: text.length * parseInt(this.font) * 0.65 }; },
    fillText(...args: unknown[]) { written.push(args); },
  };
  return { context, written, canvas: { width: 900, height: 220, getContext: () => context } as unknown as HTMLCanvasElement };
}

describe("typed signatures", () => {
  it("preserves names, accents and punctuation while removing extra whitespace", () => {
    assert.equal(normalizeSignatureName("  Ana  O’Neil-Sánchez  "), "Ana O’Neil-Sánchez");
  });
  it("creates the preview from the exact normalized name, centered within its bounds", () => {
    const { canvas, written } = canvasFixture();
    assert.equal(drawTypedSignature(canvas, "  Sample   Requester "), true);
    assert.deepEqual(written, [["Sample Requester", 450, 110, 804]]);
  });
  it("shrinks long names to fit without cutting off their beginning or end", () => {
    const { canvas, context, written } = canvasFixture();
    const name = "Long ".repeat(19).trim();
    assert.equal(drawTypedSignature(canvas, name), true);
    assert.ok(context.measureText(name).width <= 804);
    assert.equal(written[0][0], name);
  });
  it("does not create a blank or oversized signature", () => {
    for (const value of ["", " \n ", "x".repeat(101)]) {
      const { canvas, written } = canvasFixture();
      assert.equal(drawTypedSignature(canvas, value), false);
      assert.equal(written.length, 0);
    }
  });
});
