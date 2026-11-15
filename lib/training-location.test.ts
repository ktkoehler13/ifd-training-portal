import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyAcademyExpenseDefaults, normalizeTrainingLocation, parseAcademyMealDays, requestContactEmail, suggestedAcademyMealDays, validateAcademySsnLast4, validateRequestContactEmail } from "./training-location";
import { buildTrainingRequestDatabasePayload, buildTrainingRequestInput, mapTrainingRequestRow, trainingRequestRecordToDraft } from "./training-requests";
import { calculateExpenseSummaryFromDraft } from "./expenses";
import { APPROVED_PACKET_VISUAL_FIXTURE_REQUEST as request } from "./pdf/approved-packet-visual-fixture";
import type { AuthenticatedPersonnel } from "./auth/personnel";
import type { TrainingRequestRow } from "@/types/training-request";

const details = { requesterAddress: "123 Example St", requesterCity: "Ithaca", requesterState: "NY", requesterZip: "14850", requesterPhone: "607-555-0100", nyTrainingId: "NY0012345" };
const draft = { ...trainingRequestRecordToDraft({ ...request, ...details, otherExpenseDescription: "Parking" }), locationType: "nys_fire_academy" as const, location: "NYS Fire Academy", academyMealDays: "", academySsnLast4: "0012", numberOfDaysOnDuty: "0", onDutyDates: [], courseStartDate: "2026-12-01", courseEndDate: "2026-12-03", registrationFee: "", foodExpenses: "" };
describe("Academy estimates and request contact details", () => {
  it("uses the chosen venue and retains custom location text", () => {
    assert.deepEqual(normalizeTrainingLocation("sptc", "old text"), { locationType: "sptc", location: "SPTC" });
    assert.deepEqual(normalizeTrainingLocation("other", "  Station 1  "), { locationType: "other", location: "Station 1" });
    assert.equal(trainingRequestRecordToDraft({ ...request, location: "NYS Fire Academy" }).locationType, "other");
  });
  it("defaults to $25 registration and $8 for each inclusive course day", () => {
    const result = applyAcademyExpenseDefaults(draft);
    assert.equal(result.registrationFee, "25.00"); assert.equal(result.foodExpenses, "24.00"); assert.equal(result.academyMealDays, "3");
    assert.equal(result.lodging, draft.lodging);
    assert.equal(suggestedAcademyMealDays("2026-10-31", "2026-11-02"), 3);
    assert.equal(suggestedAcademyMealDays("2026-12-01", "2026-12-01"), 1);
    assert.equal(suggestedAcademyMealDays("", ""), 1);
    assert.equal(suggestedAcademyMealDays("2026-12-03", "2026-12-01"), 1);
  });
  it("retains user adjustments, including zero, until defaults are explicitly reapplied", () => {
    const adjusted = { ...draft, registrationFee: "50", foodExpenses: "0", academyMealDays: "2" };
    assert.deepEqual(applyAcademyExpenseDefaults(adjusted), adjusted);
    assert.equal(applyAcademyExpenseDefaults(adjusted, true).foodExpenses, "16.00");
    assert.equal(applyAcademyExpenseDefaults({ ...draft, academyMealDays: "0" }).foodExpenses, "0.00");
    const other = { ...draft, locationType: "other" as const };
    assert.equal(applyAcademyExpenseDefaults(other), other);
  });
  it("validates meal days and contact emails", () => {
    for (const value of ["", "-1", "1.5", "367", "NaN", undefined]) assert.equal(parseAcademyMealDays(value), null);
    for (const value of [0, 1, 366]) assert.equal(parseAcademyMealDays(String(value)), value);
    for (const value of ["", "missing@domain", "bad @example.test", "x".repeat(255) + "@example.test"]) assert.ok(validateRequestContactEmail(value));
    assert.equal(validateRequestContactEmail("alternate@example.test"), null);
    assert.equal(requestContactEmail({ requesterEmail: "historical@example.test", requestContactEmail: null }), "historical@example.test");
  });
  it("round-trips alternate contact email without changing the account identity", () => {
    const completed = { ...applyAcademyExpenseDefaults(draft), departmentEmail: " Alternate@Example.Test " };
    const input = buildTrainingRequestInput({ personnel: { id: request.requesterPersonnelId, email: "account@example.test" } as AuthenticatedPersonnel, draft: completed, expenseSummary: calculateExpenseSummaryFromDraft(completed, request.gsaMileageRate), requireComplete: true });
    const payload = buildTrainingRequestDatabasePayload(input);
    assert.equal(payload.request_contact_email, "alternate@example.test"); assert.equal(payload.requester_email, "account@example.test");
    assert.equal(payload.location_type, "nys_fire_academy"); assert.equal(payload.academy_meal_days, 3);
    assert.equal(payload.academy_ssn_last4, "0012");
    const record = mapTrainingRequestRow({ ...payload, id: request.id, status: "draft" } as TrainingRequestRow);
    assert.equal(trainingRequestRecordToDraft(record).departmentEmail, "alternate@example.test");
    assert.equal(trainingRequestRecordToDraft(record).academyMealDays, "3");
    assert.equal(trainingRequestRecordToDraft(record).academySsnLast4, "0012");
    assert.equal(mapTrainingRequestRow({ ...payload, location_type: null } as TrainingRequestRow).locationType, "other");
  });
  it("requires exactly four SSN digits only for Academy submission and keeps them off other requests", () => {
    for (const value of ["", "123", "12345", "123456789", "12a4", "1e03"]) assert.ok(validateAcademySsnLast4(value, "nys_fire_academy"));
    assert.equal(validateAcademySsnLast4("0012", "nys_fire_academy"), null);
    assert.equal(validateAcademySsnLast4("", "nys_fire_academy", false), null);
    assert.equal(validateAcademySsnLast4("", "sptc"), null);
    const empty = { ...applyAcademyExpenseDefaults(draft), academySsnLast4: "" };
    const input = { personnel: { id: request.requesterPersonnelId } as AuthenticatedPersonnel, draft: empty, expenseSummary: calculateExpenseSummaryFromDraft(empty, request.gsaMileageRate) };
    assert.doesNotThrow(() => buildTrainingRequestInput(input));
    assert.throws(() => buildTrainingRequestInput({ ...input, requireComplete: true }), /last four digits/);
    const other = buildTrainingRequestInput({ ...input, draft: { ...empty, locationType: "other", academySsnLast4: "0012" } });
    assert.equal(other.academySsnLast4, null); assert.equal(buildTrainingRequestDatabasePayload(other).academy_ssn_last4, null);
  });
  it("requires meal days at Academy submission but allows an incomplete draft", () => {
    const input = { personnel: { id: request.requesterPersonnelId } as AuthenticatedPersonnel, draft, expenseSummary: calculateExpenseSummaryFromDraft(draft, request.gsaMileageRate) };
    assert.doesNotThrow(() => buildTrainingRequestInput(input));
    assert.throws(() => buildTrainingRequestInput({ ...input, requireComplete: true }), /meal-day count/);
  });
});
