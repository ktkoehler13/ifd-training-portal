import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  calculateSignatureOutputCanvasDimensions,
  calculateSignatureScaleToFit,
} from "./personnel-signature-normalize";
import {
  PERSONNEL_SIGNATURE_MAX_HEIGHT,
  PERSONNEL_SIGNATURE_MAX_WIDTH,
  PERSONNEL_SIGNATURE_MIN_HEIGHT,
  PERSONNEL_SIGNATURE_MIN_WIDTH,
} from "@/types/personnel-signature";

describe("calculateSignatureScaleToFit", () => {
  it("scales 3000 by 800 down to 2000 by 533", () => {
    const result = calculateSignatureScaleToFit(3000, 800);
    assert.equal(result.width, 2000);
    assert.equal(result.height, 533);
    assert.equal(result.scaledDown, true);
  });

  it("scales 1000 by 1500 down to 667 by 1000", () => {
    const result = calculateSignatureScaleToFit(1000, 1500);
    assert.equal(result.width, 667);
    assert.equal(result.height, 1000);
    assert.equal(result.scaledDown, true);
  });

  it("leaves 800 by 300 unchanged", () => {
    const result = calculateSignatureScaleToFit(800, 300);
    assert.equal(result.width, 800);
    assert.equal(result.height, 300);
    assert.equal(result.scaledDown, false);
  });

  it("preserves aspect ratio when scaling", () => {
    const result = calculateSignatureScaleToFit(3000, 800);
    const ratio = result.width / result.height;
    assert.ok(Math.abs(ratio - 3000 / 800) < 0.01);
  });

  it("never exceeds the maximum output dimensions", () => {
    const cases = [
      [3000, 800],
      [1000, 1500],
      [800, 300],
      [4000, 4000],
    ] as const;

    for (const [width, height] of cases) {
      const result = calculateSignatureScaleToFit(width, height);
      assert.ok(result.width <= PERSONNEL_SIGNATURE_MAX_WIDTH);
      assert.ok(result.height <= PERSONNEL_SIGNATURE_MAX_HEIGHT);
    }
  });
});

describe("calculateSignatureOutputCanvasDimensions", () => {
  it("places 100 by 30 on at least a 150 by 50 canvas", () => {
    const result = calculateSignatureOutputCanvasDimensions(100, 30);
    assert.ok(result.width >= PERSONNEL_SIGNATURE_MIN_WIDTH);
    assert.ok(result.height >= PERSONNEL_SIGNATURE_MIN_HEIGHT);
    assert.equal(result.width, 150);
    assert.equal(result.height, 80);
  });

  it("keeps small signatures within the maximum after padding", () => {
    const result = calculateSignatureOutputCanvasDimensions(800, 300);
    assert.ok(result.width <= PERSONNEL_SIGNATURE_MAX_WIDTH);
    assert.ok(result.height <= PERSONNEL_SIGNATURE_MAX_HEIGHT);
  });

  it("scales large trimmed signatures to fit inside 2000 by 1000 with padding", () => {
    const result = calculateSignatureOutputCanvasDimensions(3000, 800);
    assert.ok(result.width <= PERSONNEL_SIGNATURE_MAX_WIDTH);
    assert.ok(result.height <= PERSONNEL_SIGNATURE_MAX_HEIGHT);
    assert.equal(result.scaledDown, true);
  });
});
