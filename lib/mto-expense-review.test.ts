import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canEditMtoExpenses,
  createMtoExpenseDraft,
  formatExpenseChangeSummary,
  getExpenseChangeRows,
  getMtoExpenseTotals,
  parseMtoExpenseDraft,
} from "./mto-expense-review";
import {
  APPROVED_PACKET_VISUAL_FIXTURE_REQUEST as fixture,
  APPROVED_PACKET_VISUAL_FIXTURE_ACTIONS,
} from "./pdf/approved-packet-visual-fixture";
import { buildAuditTrailEntry } from "./pdf/build-audit-trail";
import { mapTrainingRequestActionRow } from "./training-request-actions";
import type { TrainingRequestActionRow } from "@/types/training-request-action";

describe("MTO expense review", () => {
  it("allows only the MTO at the MTO review step", () => {
    const request = {
      ...fixture,
      status: "pending_mto" as const,
      currentActionRole: "mto" as const,
    };
    assert.equal(canEditMtoExpenses("mto", request), true);
    for (const role of ["firefighter", "admin", "deputy_chief"])
      assert.equal(canEditMtoExpenses(role, request), false);
    for (const status of [
      "draft",
      "approved",
      "denied",
      "returned_for_correction",
      "pending_deputy_chief",
    ] as const) {
      assert.equal(canEditMtoExpenses("mto", { ...request, status }), false);
    }
    assert.equal(
      canEditMtoExpenses("mto", { ...request, currentActionRole: null }),
      false,
    );
  });
  it("uses the stored mileage rate and recalculates the total", () => {
    const draft = {
      ...createMtoExpenseDraft(fixture),
      total_reimbursable_miles: "100.50",
      lodging_cost: "250.25",
    };
    assert.deepEqual(
      getMtoExpenseTotals(parseMtoExpenseDraft(draft, fixture), fixture),
      { mileage: 70.35, total: 505.6 },
    );
  });
  it("preserves historical mileage when miles have not changed", () => {
    const historical = {
      ...fixture,
      gsaMileageRate: 0,
      mileageReimbursement: 45,
    };
    assert.equal(
      getMtoExpenseTotals(
        parseMtoExpenseDraft(createMtoExpenseDraft(historical), historical),
        historical,
      ).mileage,
      45,
    );
    assert.throws(
      () =>
        parseMtoExpenseDraft(
          {
            ...createMtoExpenseDraft(historical),
            total_reimbursable_miles: "100",
          },
          historical,
        ),
      /stored mileage rate/,
    );
  });
  it("rejects invalid amounts instead of silently converting them to zero", () => {
    for (const value of [
      "",
      "-10",
      "NaN",
      "Infinity",
      "1.001",
      "12345678",
      "1e3",
      "abc",
    ]) {
      assert.throws(
        () =>
          parseMtoExpenseDraft(
            { ...createMtoExpenseDraft(fixture), registration_cost: value },
            fixture,
          ),
        /Registration Fee/,
      );
    }
  });
  it("accepts formatted amounts and requires descriptions when Other Expense changes", () => {
    assert.equal(
      parseMtoExpenseDraft(
        { ...createMtoExpenseDraft(fixture), registration_cost: "1,234.50" },
        fixture,
      ).registration_cost,
      1234.5,
    );
    assert.throws(
      () =>
        parseMtoExpenseDraft(
          { ...createMtoExpenseDraft(fixture), other_cost: "20" },
          fixture,
        ),
      /Describe Other Expense/,
    );
    const described = { ...fixture, otherExpenseDescription: "Tolls" };
    assert.throws(
      () =>
        parseMtoExpenseDraft(
          {
            ...createMtoExpenseDraft(described),
            other_expense_description: "\t\n",
          },
          described,
        ),
      /Describe Other Expense/,
    );
    assert.equal(
      parseMtoExpenseDraft(createMtoExpenseDraft(fixture), fixture)
        .other_expense_description,
      "",
    );
  });
  it("does not change department-vehicle mileage", () => {
    const vehicle = { ...fixture, requestDepartmentVehicle: true };
    assert.throws(
      () =>
        parseMtoExpenseDraft(
          {
            ...createMtoExpenseDraft(vehicle),
            total_reimbursable_miles: "100",
          },
          vehicle,
        ),
      /department vehicle/,
    );
  });
  it("shows changed values in request history and PDF audit without inventing a signature", () => {
    const changes = {
      before: { lodging_cost: 100, total_cost: 200 },
      after: { lodging_cost: 125, total_cost: 225 },
    };
    const action = {
      ...APPROVED_PACKET_VISUAL_FIXTURE_ACTIONS[0],
      action: "mto_expenses_updated" as const,
      actorRole: "mto" as const,
      comments: "Updated hotel quote",
      expenseChanges: changes,
    };
    const entry = buildAuditTrailEntry(action, fixture.id);
    assert.equal(entry.actionPhrase, "Updated estimated expenses");
    assert.equal(entry.commentLabel, "Reason");
    assert.match(entry.commentText!, /Updated hotel quote/);
    assert.match(entry.commentText!, /Lodging: \$100.00 to \$125.00/);
    assert.equal(getExpenseChangeRows(changes).length, 2);
    assert.equal(formatExpenseChangeSummary(null), "");
    const mapped = mapTrainingRequestActionRow({
      action: "mto_expenses_updated",
      expense_changes: changes,
    } as TrainingRequestActionRow);
    assert.equal(mapped.action, "mto_expenses_updated");
    assert.deepEqual(mapped.expenseChanges, changes);
  });
});
