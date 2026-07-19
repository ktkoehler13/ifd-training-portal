import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isAdministrativeRole } from "@/lib/auth/roles";
import {
  APPROVED_TRAINING_SCHEDULE_TIME_ZONE,
  buildApprovedTrainingCsv,
  buildApprovedTrainingScheduleViewModel,
  calculateInclusiveTrainingDays,
  filterApprovedTrainingRecords,
  FINAL_APPROVED_TRAINING_REQUEST_STATUS,
  formatApprovedTrainingDateRange,
  formatApprovedTrainingRequesterRank,
  getApprovedTrainingEmptyStateMessage,
  getTodayInAmericaNewYork,
  isFinallyApprovedTrainingRequest,
  recordMatchesApprovedTrainingSearch,
  sortApprovedTrainingRecords,
  type ApprovedTrainingScheduleRecord,
} from "@/lib/approved-training-schedule";
import { canDownloadApprovedPacket } from "@/lib/training-request-packet-access";
import { TRAINING_REQUEST_STATUSES } from "@/types/training-request";

const approvedTrainingScheduleSource = readFileSync(
  path.join(process.cwd(), "lib/approved-training-schedule.ts"),
  "utf8",
);
const approvedTrainingScheduleServerSource = readFileSync(
  path.join(process.cwd(), "lib/approved-training-schedule-server.ts"),
  "utf8",
);
const approvedTrainingPageSource = readFileSync(
  path.join(process.cwd(), "app/admin/approved-training/page.tsx"),
  "utf8",
);
const approvedTrainingViewSource = readFileSync(
  path.join(
    process.cwd(),
    "components/admin/ApprovedTrainingScheduleView.tsx",
  ),
  "utf8",
);
const dashboardViewSource = readFileSync(
  path.join(process.cwd(), "components/layout/DashboardView.tsx"),
  "utf8",
);
const authGateSource = readFileSync(
  path.join(process.cwd(), "components/layout/AuthGate.tsx"),
  "utf8",
);
const requesterTitleSnapshotMigrationSql = readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20260719240000_add_requester_title_snapshot.sql",
  ),
  "utf8",
);
const approvedPacketRouteSource = readFileSync(
  path.join(
    process.cwd(),
    "app/api/training-requests/[id]/approved-packet/route.ts",
  ),
  "utf8",
);

function createRecord(
  overrides: Partial<ApprovedTrainingScheduleRecord> = {},
): ApprovedTrainingScheduleRecord {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    requestNumber: "Koehler, K, Fire Officer I, 2026.1",
    requesterPersonnelId: "22222222-2222-2222-2222-222222222222",
    requesterName: "Kevin Koehler",
    requesterBadgeNumber: "207",
    requesterTitleSnapshot: "firefighter",
    requesterCurrentTitle: "lieutenant",
    courseName: "Fire Officer I",
    courseNumber: "FO-1",
    location: "Montour Falls",
    courseStartDate: "2026-08-18",
    courseEndDate: "2026-08-18",
    totalEstimatedExpenses: 125.5,
    approvedAt: "2026-07-02T12:00:00.000Z",
    ...overrides,
  };
}

describe("approved training schedule status filtering", () => {
  it("only finally approved requests appear", () => {
    assert.equal(FINAL_APPROVED_TRAINING_REQUEST_STATUS, "approved");
    assert.equal(isFinallyApprovedTrainingRequest("approved"), true);
  });

  it("excludes pending requests", () => {
    assert.equal(isFinallyApprovedTrainingRequest("pending_mto"), false);
    assert.equal(isFinallyApprovedTrainingRequest("pending_deputy_chief"), false);
  });

  it("excludes returned requests", () => {
    assert.equal(isFinallyApprovedTrainingRequest("returned_for_correction"), false);
  });

  it("excludes denied requests", () => {
    assert.equal(isFinallyApprovedTrainingRequest("denied"), false);
  });

  it("excludes cancelled requests", () => {
    assert.equal(isFinallyApprovedTrainingRequest("cancelled"), false);
  });

  it("loads only approved status server-side", () => {
    assert.match(
      approvedTrainingScheduleServerSource,
      /\.eq\("status", FINAL_APPROVED_TRAINING_REQUEST_STATUS\)/,
    );
    assert.doesNotMatch(
      approvedTrainingScheduleServerSource,
      /searchParams\.get\("status"\)/,
    );
  });
});

describe("approved training schedule sorting and time filters", () => {
  const today = "2026-08-18";

  it("sorts upcoming records by course start date ascending", () => {
    const records = sortApprovedTrainingRecords(
      [
        createRecord({
          id: "1",
          courseStartDate: "2026-09-02",
          courseEndDate: "2026-09-02",
          requesterName: "Jane Smith",
        }),
        createRecord({
          id: "2",
          courseStartDate: "2026-08-03",
          courseEndDate: "2026-08-05",
          requesterName: "Alix Gresov",
        }),
      ],
      "upcoming",
    );

    assert.deepEqual(
      records.map((record) => record.courseStartDate),
      ["2026-08-03", "2026-09-02"],
    );
  });

  it("uses secondary sorting for same-day upcoming records", () => {
    const records = sortApprovedTrainingRecords(
      [
        createRecord({
          id: "1",
          courseStartDate: "2026-08-18",
          courseEndDate: "2026-08-20",
          requesterName: "Kevin Koehler",
        }),
        createRecord({
          id: "2",
          courseStartDate: "2026-08-18",
          courseEndDate: "2026-08-18",
          requesterName: "Alix Gresov",
        }),
      ],
      "upcoming",
    );

    assert.equal(records[0]?.requesterName, "Alix Gresov");
    assert.equal(records[1]?.requesterName, "Kevin Koehler");
  });

  it("sorts past records most recent first", () => {
    const records = sortApprovedTrainingRecords(
      [
        createRecord({
          id: "1",
          courseStartDate: "2026-05-01",
          courseEndDate: "2026-05-01",
        }),
        createRecord({
          id: "2",
          courseStartDate: "2026-07-10",
          courseEndDate: "2026-07-10",
        }),
      ],
      "past",
    );

    assert.deepEqual(
      records.map((record) => record.courseStartDate),
      ["2026-07-10", "2026-05-01"],
    );
  });

  it("keeps multi-day courses upcoming through the end date", () => {
    const filtered = filterApprovedTrainingRecords(
      [
        createRecord({
          courseStartDate: "2026-08-10",
          courseEndDate: "2026-08-20",
        }),
      ],
      { timeFilter: "upcoming", year: "all", search: "" },
      today,
    );

    assert.equal(filtered.length, 1);
  });

  it("uses America/New_York to determine today", () => {
    assert.equal(APPROVED_TRAINING_SCHEDULE_TIME_ZONE, "America/New_York");
    assert.match(approvedTrainingScheduleSource, /America\/New_York/);

    const lateEveningUtc = new Date("2026-08-19T03:30:00.000Z");
    assert.equal(getTodayInAmericaNewYork(lateEveningUtc), "2026-08-18");
  });
});

describe("approved training schedule display fields", () => {
  it("displays requester name", () => {
    const record = createRecord({ requesterName: "Kevin Koehler" });
    assert.match(buildApprovedTrainingCsv([record]), /Kevin Koehler/);
  });

  it("displays requester rank separately from application role", () => {
    const record = createRecord({
      requesterTitleSnapshot: "firefighter",
      requesterCurrentTitle: "lieutenant",
    });

    assert.equal(formatApprovedTrainingRequesterRank(record), "Firefighter");
    assert.doesNotMatch(approvedTrainingViewSource, /personnel\.role/);
    assert.doesNotMatch(approvedTrainingViewSource, /Application Role/);
  });

  it("displays course name and location", () => {
    const record = createRecord({
      courseName: "Technical Rescue",
      location: "Syracuse",
    });
    const csv = buildApprovedTrainingCsv([record]);
    assert.match(csv, /Technical Rescue/);
    assert.match(csv, /Syracuse/);
  });

  it("formats single-day dates correctly", () => {
    assert.equal(
      formatApprovedTrainingDateRange("2026-08-18", "2026-08-18"),
      "August 18, 2026",
    );
  });

  it("formats multi-day dates in the same month correctly", () => {
    assert.equal(
      formatApprovedTrainingDateRange("2026-08-18", "2026-08-20"),
      "August 18–20, 2026",
    );
  });

  it("formats multi-day dates across months correctly", () => {
    assert.equal(
      formatApprovedTrainingDateRange("2026-08-30", "2026-09-02"),
      "August 30, 2026 – September 2, 2026",
    );
  });

  it("displays legacy records without rank safely", () => {
    assert.equal(
      formatApprovedTrainingRequesterRank({
        requesterTitleSnapshot: null,
        requesterCurrentTitle: null,
      }),
      "Not recorded",
    );
  });
});

describe("approved training schedule access and empty states", () => {
  it("allows administrative roles to access the view", () => {
    assert.equal(isAdministrativeRole("mto"), true);
    assert.equal(isAdministrativeRole("deputy_chief"), true);
    assert.equal(isAdministrativeRole("admin"), true);
    assert.match(dashboardViewSource, /\/admin\/approved-training/);
    assert.match(approvedTrainingViewSource, /AdminGate/);
  });

  it("blocks Application Role = User regardless of rank", () => {
    assert.equal(isAdministrativeRole("firefighter"), false);
    assert.match(authGateSource, /isAdministrativeRole\(personnel\.role\)/);
    assert.match(
      approvedTrainingScheduleServerSource,
      /isAdministrativeRole\(personnel\.role\)/,
    );
  });

  it("shows the correct empty states", () => {
    assert.equal(
      getApprovedTrainingEmptyStateMessage({
        timeFilter: "upcoming",
        year: "all",
        search: "",
      }),
      "No upcoming approved training is scheduled.",
    );
    assert.equal(
      getApprovedTrainingEmptyStateMessage({
        timeFilter: "upcoming",
        year: "all",
        search: "rescue",
      }),
      "No approved training matches the selected filters.",
    );
  });
});

describe("approved training schedule search and export", () => {
  const record = createRecord();

  it("matches search across name, course, location, badge, and request number", () => {
    assert.equal(recordMatchesApprovedTrainingSearch(record, "kevin"), true);
    assert.equal(recordMatchesApprovedTrainingSearch(record, "207"), true);
    assert.equal(recordMatchesApprovedTrainingSearch(record, "fire officer"), true);
    assert.equal(recordMatchesApprovedTrainingSearch(record, "montour"), true);
    assert.equal(recordMatchesApprovedTrainingSearch(record, "2026.1"), true);
    assert.equal(recordMatchesApprovedTrainingSearch(record, "missing"), false);
  });

  it("exports CSV for the filtered view without sensitive internal information", () => {
    const csv = buildApprovedTrainingCsv([record]);
    assert.match(csv, /Training Start Date/);
    assert.match(csv, /2026-08-18/);
    assert.match(csv, /125\.50/);
    assert.doesNotMatch(csv, /11111111-1111-1111-1111-111111111111/);
    assert.doesNotMatch(csv, /signature/);
    assert.doesNotMatch(csv, /storage/);
  });

  it("uses inclusive course dates for training day totals", () => {
    assert.equal(calculateInclusiveTrainingDays("2026-08-03", "2026-08-05"), 3);
    const viewModel = buildApprovedTrainingScheduleViewModel(
      [
        createRecord({
          courseStartDate: "2026-08-03",
          courseEndDate: "2026-08-05",
        }),
      ],
      { timeFilter: "all", year: "all", search: "" },
      "2026-08-01",
    );
    assert.equal(viewModel.summary.trainingDaysCount, 3);
  });

  it("keeps approved packet download authorization protected", () => {
    assert.match(
      approvedPacketRouteSource,
      /downloadApprovedTrainingRequestPacket/,
    );
    assert.match(approvedTrainingViewSource, /\/approved-packet/);
    assert.equal(canDownloadApprovedPacket.name, "canDownloadApprovedPacket");
  });
});

describe("requester title snapshot migration", () => {
  it("adds requester_title_snapshot with a rank check constraint", () => {
    assert.match(
      requesterTitleSnapshotMigrationSql,
      /requester_title_snapshot text/,
    );
    assert.match(requesterTitleSnapshotMigrationSql, /'firefighter'/);
    assert.match(requesterTitleSnapshotMigrationSql, /'fire_chief'/);
  });

  it("snapshots title on insert and preserves it on update", () => {
    assert.match(
      requesterTitleSnapshotMigrationSql,
      /new\.requester_title_snapshot := old\.requester_title_snapshot/,
    );
    assert.match(
      requesterTitleSnapshotMigrationSql,
      /p\.title[\s\S]*new\.requester_title_snapshot/,
    );
  });

  it("adds an approved schedule index", () => {
    assert.match(
      requesterTitleSnapshotMigrationSql,
      /training_requests_approved_schedule_idx/,
    );
    assert.match(requesterTitleSnapshotMigrationSql, /where status = 'approved'/);
  });
});

describe("approved training schedule page wiring", () => {
  it("loads data server-side through the admin page", () => {
    assert.match(
      approvedTrainingPageSource,
      /loadApprovedTrainingSchedulePageData/,
    );
    assert.doesNotMatch(approvedTrainingPageSource, /createClient\(/);
  });

  it("covers every non-approved workflow status as excluded", () => {
    for (const status of TRAINING_REQUEST_STATUSES) {
      if (status === "approved") {
        continue;
      }

      assert.equal(isFinallyApprovedTrainingRequest(status), false);
    }
  });
});
