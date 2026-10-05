import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { otherExpenseLabel, validateOtherExpenseDescription } from "./other-expense-description";
import { buildTrainingRequestDatabasePayload, buildTrainingRequestInput, mapTrainingRequestRow, trainingRequestRecordToDraft } from "./training-requests";
import { calculateExpenseSummaryFromDraft } from "./expenses";
import { APPROVED_PACKET_VISUAL_FIXTURE_REQUEST as request } from "./pdf/approved-packet-visual-fixture";
import type { AuthenticatedPersonnel } from "./auth/personnel";
import type { TrainingRequestRow } from "@/types/training-request";

const personnel = { id: request.requesterPersonnelId } as AuthenticatedPersonnel;
function input(description: string, requireComplete: boolean) {
  const draft = trainingRequestRecordToDraft({ ...request, otherExpenseDescription: description });
  return buildTrainingRequestInput({ personnel, draft, requireComplete, expenseSummary: calculateExpenseSummaryFromDraft(draft, request.gsaMileageRate) });
}

describe("Other Expense descriptions", () => {
  it("requires a meaningful description only for a positive amount", () => {
    for (const blank of [null, undefined, "", " \t\n", 42]) {
      assert.ok(validateOtherExpenseDescription(0.01, blank));
      assert.equal(validateOtherExpenseDescription(0, blank), null);
    }
    assert.equal(validateOtherExpenseDescription(45, "Parking & Tolls"), null);
  });
  it("permits incomplete drafts but rejects final submissions", () => {
    assert.equal(input("", false).otherExpenseDescription, "");
    assert.throws(() => input(" \n", true), /Describe Other Expense/);
    assert.equal(input(" Parking & Tolls ", true).otherExpenseDescription, "Parking & Tolls");
  });
  it("round-trips description through database payload, record, and editable draft", () => {
    const payload = buildTrainingRequestDatabasePayload(input(" Parking & Tolls ", true));
    assert.equal(payload.other_expense_description, "Parking & Tolls");
    const record = mapTrainingRequestRow({ ...payload, id: request.id, status: "draft" } as TrainingRequestRow);
    assert.equal(record.otherExpenseDescription, "Parking & Tolls");
    assert.equal(trainingRequestRecordToDraft(record).otherExpenseDescription, "Parking & Tolls");
  });
  it("opens historical records without a description without inventing one", () => {
    const payload = buildTrainingRequestDatabasePayload(input("", false));
    assert.equal(payload.other_expense_description, null);
    delete (payload as Partial<typeof payload>).other_expense_description;
    const record = mapTrainingRequestRow({ ...payload, id: request.id, status: "approved" } as TrainingRequestRow);
    assert.equal(record.otherExpenseDescription, "");
    assert.equal(trainingRequestRecordToDraft(record).otherExpenseDescription, "");
    assert.equal(otherExpenseLabel(record.otherExpenseDescription), "Other Expense");
    assert.equal(otherExpenseLabel("Parking & Tolls"), "Other – Parking & Tolls");
  });
});
