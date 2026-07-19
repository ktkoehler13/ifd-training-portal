import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getApprovedPacketStampPlan,
} from "@/lib/pdf/build-stamp-values";
import { buildApprovedTrainingCsv } from "@/lib/approved-training-schedule";
import {
  buildTrainingDayDetailsFromDraft,
  formatOnDutyDatesForCsv,
  normalizeOnDutyDatesForCount,
  resizeOnDutyDates,
  sortOnDutyDates,
  suggestTotalDaysIncludingTravel,
  validateTrainingDayDetails,
} from "@/lib/training-day-details";
import { trainingRequestRecordToDraft } from "@/lib/training-requests";
import type { TrainingRequestRecord } from "@/types/training-request";

const migrationSql = readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20260719250000_add_training_day_details.sql",
  ),
  "utf8",
);
const buildStampValuesSource = readFileSync(
  path.join(process.cwd(), "lib/pdf/build-stamp-values.ts"),
  "utf8",
);
const wizardSource = readFileSync(
  path.join(process.cwd(), "components/requests/TrainingRequestWizard.tsx"),
  "utf8",
);
const trainingDayDetailsFieldsSource = readFileSync(
  path.join(process.cwd(), "components/requests/TrainingDayDetailsFields.tsx"),
  "utf8",
);

const baseRecord: TrainingRequestRecord = {
  id: "11111111-1111-1111-1111-111111111111",
  requestNumber: "Koehler, K, Fire Officer I, 2026.1",
  requesterPersonnelId: "22222222-2222-2222-2222-222222222222",
  requesterBadgeNumber: "207",
  requesterEmail: "owner@ifd.example",
  requesterName: "Kevin Koehler",
  requesterTitleSnapshot: "firefighter",
  courseName: "Fire Officer I",
  courseNumber: "FO-1",
  trainingProvider: "Provider",
  courseDescription: "Description",
  location: "Montour Falls",
  courseStartDate: "2026-07-20",
  courseEndDate: "2026-07-24",
  totalDaysIncludingTravel: 5,
  numberOfDaysOnDuty: 1,
  onDutyDates: ["2026-07-22"],
  registrationFee: 0,
  lodging: 0,
  foodExpenses: 0,
  airfare: 0,
  rentalVehicle: 0,
  otherExpenses: 0,
  mileageReimbursement: 0,
  totalReimbursableMiles: 0,
  gsaMileageRate: 0.7,
  totalEstimatedExpenses: 0,
  requestDepartmentVehicle: false,
  transportationNotes: "",
  status: "approved",
  currentActionRole: null,
  submittedAt: "2026-07-01T12:00:00.000Z",
  createdAt: "2026-06-30T12:00:00.000Z",
  updatedAt: "2026-07-02T12:00:00.000Z",
};

describe("training day details migration", () => {
  it("adds total_days_including_travel and on_duty_dates", () => {
    assert.match(migrationSql, /total_days_including_travel integer/);
    assert.match(migrationSql, /on_duty_dates date\[\]/);
  });

  it("does not backfill total_days_including_travel from number_of_days_on_duty", () => {
    assert.doesNotMatch(migrationSql, /update public\.training_requests/);
    assert.doesNotMatch(migrationSql, /set total_days_including_travel = number_of_days_on_duty/);
  });
});

describe("training day details validation", () => {
  it("allows totalDaysIncludingTravel = 5 with numberOfDaysOnDuty = 1", () => {
    const errors = validateTrainingDayDetails({
      totalDaysIncludingTravel: "5",
      numberOfDaysOnDuty: "1",
      onDutyDates: ["2026-07-22"],
      courseStartDate: "2026-07-20",
      courseEndDate: "2026-07-24",
      requireComplete: true,
    });

    assert.deepEqual(errors, {});
  });

  it("requires exactly one on-duty date when the count is 1", () => {
    const errors = validateTrainingDayDetails({
      totalDaysIncludingTravel: "5",
      numberOfDaysOnDuty: "1",
      onDutyDates: [""],
      courseStartDate: "2026-07-20",
      courseEndDate: "2026-07-24",
      requireComplete: true,
    });

    assert.match(errors.onDutyDates ?? "", /Enter all 1 on-duty dates/);
  });

  it("allows zero on-duty days with no date fields", () => {
    const errors = validateTrainingDayDetails({
      totalDaysIncludingTravel: "5",
      numberOfDaysOnDuty: "0",
      onDutyDates: [],
      courseStartDate: "2026-07-20",
      courseEndDate: "2026-07-24",
      requireComplete: true,
    });

    assert.deepEqual(errors, {});
  });

  it("rejects duplicate on-duty dates", () => {
    const errors = validateTrainingDayDetails({
      totalDaysIncludingTravel: "5",
      numberOfDaysOnDuty: "2",
      onDutyDates: ["2026-07-22", "2026-07-22"],
      courseStartDate: "2026-07-20",
      courseEndDate: "2026-07-24",
      requireComplete: true,
    });

    assert.match(errors.onDutyDates ?? "", /cannot be duplicated/);
  });

  it("requires the date-list length to match the on-duty count", () => {
    const errors = validateTrainingDayDetails({
      totalDaysIncludingTravel: "5",
      numberOfDaysOnDuty: "2",
      onDutyDates: ["2026-07-22"],
      courseStartDate: "2026-07-20",
      courseEndDate: "2026-07-24",
      requireComplete: true,
    });

    assert.match(errors.onDutyDates ?? "", /Enter all 2 on-duty dates/);
  });

  it("rejects days on duty above total days including travel", () => {
    const errors = validateTrainingDayDetails({
      totalDaysIncludingTravel: "5",
      numberOfDaysOnDuty: "6",
      onDutyDates: normalizeOnDutyDatesForCount([], 6),
      courseStartDate: "2026-07-20",
      courseEndDate: "2026-07-24",
      requireComplete: true,
    });

    assert.match(
      errors.numberOfDaysOnDuty ?? "",
      /cannot exceed total days including travel/,
    );
  });

  it("sorts on-duty dates chronologically before storage", () => {
    const stored = buildTrainingDayDetailsFromDraft(
      {
        totalDaysIncludingTravel: "5",
        numberOfDaysOnDuty: "2",
        onDutyDates: ["2026-07-24", "2026-07-20"],
        courseStartDate: "2026-07-20",
        courseEndDate: "2026-07-24",
      },
      { requireComplete: true },
    );

    assert.deepEqual(stored.onDutyDates, ["2026-07-20", "2026-07-24"]);
  });
});

describe("training day details dynamic fields", () => {
  it("adds blank date fields when the count increases", () => {
    const resized = resizeOnDutyDates(["2026-07-22"], 2, 1);
    assert.equal(resized.confirmed, true);
    assert.deepEqual(resized.dates, ["2026-07-22", ""]);
  });

  it("warns before deleting populated dates when the count decreases", () => {
    const originalConfirm = globalThis.confirm;
    let confirmCalled = false;
    globalThis.confirm = () => {
      confirmCalled = true;
      return false;
    };

    try {
      const resized = resizeOnDutyDates(
        ["2026-07-20", "2026-07-22"],
        1,
        2,
      );
      assert.equal(confirmCalled, true);
      assert.equal(resized.confirmed, false);
      assert.deepEqual(resized.dates, ["2026-07-20", "2026-07-22"]);
    } finally {
      globalThis.confirm = originalConfirm;
    }
  });

  it("restores saved values for returned requests", () => {
    const draft = trainingRequestRecordToDraft(baseRecord);
    assert.equal(draft.totalDaysIncludingTravel, "5");
    assert.equal(draft.numberOfDaysOnDuty, "1");
    assert.deepEqual(draft.onDutyDates, ["2026-07-22"]);
  });
});

describe("training day details PDF mapping", () => {
  const mtoAction = {
    id: "33333333-3333-3333-3333-333333333333",
    trainingRequestId: baseRecord.id,
    actorPersonnelId: "44444444-4444-4444-4444-444444444444",
    actorName: "MTO Reviewer",
    actorBadgeNumber: "100",
    actorRole: "mto" as const,
    action: "mto_approved" as const,
    comments: null,
    signatureName: "MTO Reviewer",
    signedAt: "2026-07-01T15:00:00.000Z",
    electronicSignatureConfirmed: true,
    signatureStorageBucket: "training-request-signature-snapshots",
    signatureStoragePath: `${baseRecord.id}/33333333-3333-3333-3333-333333333333/signature.png`,
    signatureSha256: "abc",
    signatureMimeType: "image/png",
    signatureFileSizeBytes: 100,
    createdAt: "2026-07-01T15:00:00.000Z",
  };
  const deputyAction = {
    ...mtoAction,
    id: "55555555-5555-5555-5555-555555555555",
    actorRole: "deputy_chief" as const,
    action: "deputy_chief_approved" as const,
    signedAt: "2026-07-02T10:00:00.000Z",
    createdAt: "2026-07-02T10:00:00.000Z",
    signatureStoragePath: `${baseRecord.id}/55555555-5555-5555-5555-555555555555/signature.png`,
  };

  it("uses totalDaysIncludingTravel for the PDF total-days field", () => {
    const plan = getApprovedPacketStampPlan({
      request: baseRecord,
      mtoAction,
      deputyAction,
    });

    assert.equal(plan.trainingRequestText.totalDaysIncludingTravel, "5");
    assert.match(buildStampValuesSource, /request\.totalDaysIncludingTravel/);
    assert.doesNotMatch(
      buildStampValuesSource,
      /totalDaysIncludingTravel: formatOptionalPdfNumber\(request\.numberOfDaysOnDuty\)/,
    );
  });

  it("uses onDutyDates for on-duty date lines", () => {
    const plan = getApprovedPacketStampPlan({
      request: baseRecord,
      mtoAction,
      deputyAction,
    });

    assert.equal(plan.trainingRequestText.onDutyDatePrimary, "07/22/2026");
    assert.equal(plan.trainingRequestText.onDutyDateSecondary, "");
  });

  it("never places approval dates in on-duty date lines", () => {
    const plan = getApprovedPacketStampPlan({
      request: baseRecord,
      mtoAction,
      deputyAction,
    });

    assert.notEqual(
      plan.trainingRequestText.onDutyDatePrimary,
      plan.trainingRequestApprovalDates.mtoApprovalDate,
    );
    assert.notEqual(
      plan.trainingRequestText.onDutyDateSecondary,
      plan.trainingRequestApprovalDates.deputyApprovalDate,
    );
  });

  it("leaves legacy missing values blank without failing PDF generation", () => {
    const legacyRequest: TrainingRequestRecord = {
      ...baseRecord,
      totalDaysIncludingTravel: null,
      numberOfDaysOnDuty: 5,
      onDutyDates: [],
    };
    const plan = getApprovedPacketStampPlan({
      request: legacyRequest,
      mtoAction,
      deputyAction,
    });

    assert.equal(plan.trainingRequestText.totalDaysIncludingTravel, "");
    assert.equal(plan.trainingRequestText.onDutyDatePrimary, "");
    assert.equal(plan.trainingRequestText.onDutyDateSecondary, "");
  });
});

describe("training day details CSV export", () => {
  it("exports the three distinct values correctly", () => {
    const csv = buildApprovedTrainingCsv([
      {
        id: baseRecord.id,
        requestNumber: baseRecord.requestNumber!,
        requesterPersonnelId: baseRecord.requesterPersonnelId,
        requesterName: baseRecord.requesterName,
        requesterBadgeNumber: baseRecord.requesterBadgeNumber,
        requesterTitleSnapshot: baseRecord.requesterTitleSnapshot,
        requesterCurrentTitle: null,
        courseName: baseRecord.courseName,
        courseNumber: baseRecord.courseNumber,
        location: baseRecord.location,
        courseStartDate: baseRecord.courseStartDate,
        courseEndDate: baseRecord.courseEndDate,
        totalDaysIncludingTravel: 5,
        numberOfDaysOnDuty: 1,
        onDutyDates: ["2026-07-22"],
        totalEstimatedExpenses: 0,
        approvedAt: null,
      },
    ]);

    assert.match(csv, /Total Days Including Travel/);
    assert.match(csv, /Number of Days On Duty/);
    assert.match(csv, /On-Duty Dates/);
    assert.match(csv, /2026-07-22/);
    assert.equal(formatOnDutyDatesForCsv(["2026-07-22", "2026-07-20"]), "2026-07-20; 2026-07-22");
  });
});

describe("training day details form wiring", () => {
  it("includes separate total-days and on-duty fields in the wizard", () => {
    assert.match(wizardSource, /TrainingDayDetailsFields/);
    assert.match(trainingDayDetailsFieldsSource, /Total Number of Days Including Travel/);
    assert.match(trainingDayDetailsFieldsSource, /Number of Days On Duty During Training/);
    assert.match(wizardSource, /On-Duty Dates/);
  });

  it("suggests an inclusive course-date total without auto-filling it", () => {
    assert.equal(
      suggestTotalDaysIncludingTravel("2026-07-20", "2026-07-24"),
      5,
    );
    assert.match(
      trainingDayDetailsFieldsSource,
      /Suggested total based on course dates/,
    );
  });

  it("preserves values through submission input building", () => {
    const stored = buildTrainingDayDetailsFromDraft(
      {
        totalDaysIncludingTravel: "5",
        numberOfDaysOnDuty: "1",
        onDutyDates: ["2026-07-22"],
        courseStartDate: "2026-07-20",
        courseEndDate: "2026-07-24",
      },
      { requireComplete: true },
    );

    assert.equal(stored.totalDaysIncludingTravel, 5);
    assert.equal(stored.numberOfDaysOnDuty, 1);
    assert.deepEqual(stored.onDutyDates, ["2026-07-22"]);
  });
});

describe("training day details sorting helper", () => {
  it("sorts dates ascending for display", () => {
    assert.deepEqual(
      sortOnDutyDates(["2026-07-24", "2026-07-20", "2026-07-22"]),
      ["2026-07-20", "2026-07-22", "2026-07-24"],
    );
  });
});
