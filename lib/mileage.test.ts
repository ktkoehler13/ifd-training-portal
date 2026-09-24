import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { calculateExpenseSummary } from "@/lib/expenses";
import {
  calculateMileageReimbursement,
  getGsaMileageRateFromEnv,
  isValidMilesInput,
  resolveGsaMileageRate,
  validateTotalReimbursableMilesInput,
} from "@/lib/mileage";
import { parseGsaMileageRateSettingValue } from "@/lib/system-settings";

describe("total reimbursable miles validation", () => {
  it("rejects blank mileage when a department vehicle is not requested", () => {
    assert.equal(
      validateTotalReimbursableMilesInput("", { requireInput: true }),
      "Enter total reimbursable miles.",
    );
    assert.equal(
      validateTotalReimbursableMilesInput("   ", { requireInput: true }),
      "Enter total reimbursable miles.",
    );
  });

  it("accepts zero mileage when a department vehicle is not requested", () => {
    assert.equal(isValidMilesInput("0"), true);
    assert.equal(
      validateTotalReimbursableMilesInput("0", { requireInput: true }),
      null,
    );
  });

  it("accepts positive mileage when a department vehicle is not requested", () => {
    assert.equal(
      validateTotalReimbursableMilesInput("125.5", { requireInput: true }),
      null,
    );
  });

  it("does not require mileage input when a department vehicle is requested", () => {
    assert.equal(
      validateTotalReimbursableMilesInput("", { requireInput: false }),
      null,
    );
  });

  it("rejects malformed mileage input", () => {
    assert.equal(
      validateTotalReimbursableMilesInput("abc", { requireInput: true }),
      "Enter a valid mileage amount of zero or greater.",
    );
  });
});

describe("GSA mileage rate resolution", () => {
  it("prefers the database setting over the environment fallback", () => {
    assert.equal(
      resolveGsaMileageRate({ databaseRate: 0.7, envRate: 0.67 }),
      0.7,
    );
  });

  it("falls back to the environment rate when the database value is missing", () => {
    assert.equal(
      resolveGsaMileageRate({ databaseRate: null, envRate: 0.67 }),
      0.67,
    );
  });

  it("handles invalid database rates safely", () => {
    assert.equal(parseGsaMileageRateSettingValue("not-a-rate"), null);
    assert.equal(parseGsaMileageRateSettingValue("-1"), null);
    assert.equal(parseGsaMileageRateSettingValue("0"), null);
  });
});

describe("mileage reimbursement calculation", () => {
  it("calculates reimbursement from miles and rate", () => {
    assert.equal(calculateMileageReimbursement(100, 0.7), 70);
    assert.equal(calculateMileageReimbursement(0, 0.7), 0);
  });

  it("returns zero reimbursement for department vehicle effective miles", () => {
    const summary = calculateExpenseSummary({
      requestDepartmentVehicle: true,
      totalReimbursableMiles: 500,
      gsaMileageRate: 0.7,
      registrationFee: 0,
      lodging: 0,
      airfare: 0,
      rentalVehicle: 0,
      foodExpenses: 0,
      otherExpenses: 0,
    });
    assert.equal(summary.totalReimbursableMiles, 0);
    assert.equal(summary.mileageReimbursement, 0);
  });
});

describe("environment mileage fallback", () => {
  it("reads NEXT_PUBLIC_GSA_MILEAGE_RATE when present", () => {
    const previous = process.env.NEXT_PUBLIC_GSA_MILEAGE_RATE;
    process.env.NEXT_PUBLIC_GSA_MILEAGE_RATE = "0.725";
    try {
      assert.equal(getGsaMileageRateFromEnv(), 0.725);
    } finally {
      if (previous === undefined) {
        delete process.env.NEXT_PUBLIC_GSA_MILEAGE_RATE;
      } else {
        process.env.NEXT_PUBLIC_GSA_MILEAGE_RATE = previous;
      }
    }
  });
});
