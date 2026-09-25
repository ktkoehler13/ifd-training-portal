import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { calculateExpenseSummaryFromDraft } from "@/lib/expenses";
import { resolveGsaMileageRate } from "@/lib/mileage";
import { resolveSubmissionGsaMileageRate } from "@/lib/training-request-gsa-mileage";

const newRequestPageSource = readFileSync(
  path.join(process.cwd(), "app/requests/new/page.tsx"),
  "utf8",
);
const submitRouteSource = readFileSync(
  path.join(process.cwd(), "app/api/training-requests/submit/route.ts"),
  "utf8",
);
const submitServerSource = readFileSync(
  path.join(process.cwd(), "lib/training-request-submit-server.ts"),
  "utf8",
);
const systemSettingsServerSource = readFileSync(
  path.join(process.cwd(), "lib/system-settings-server.ts"),
  "utf8",
);

describe("GSA mileage rate precedence", () => {
  it("prefers database rate 0.76 over env fallback 0.70", () => {
    assert.equal(
      resolveGsaMileageRate({ databaseRate: 0.76, envRate: 0.7 }),
      0.76,
    );
  });
});

describe("new training request page freshness", () => {
  it("forces dynamic rendering so build-time mileage rates are not reused", () => {
    assert.match(newRequestPageSource, /export const dynamic = "force-dynamic"/);
    assert.match(newRequestPageSource, /export const revalidate = 0/);
    assert.match(newRequestPageSource, /getCurrentGsaMileageRate/);
  });

  it("does not cache the current GSA mileage rate lookup across requests", () => {
    assert.match(systemSettingsServerSource, /unstable_noStore|noStore/);
    assert.match(systemSettingsServerSource, /getCurrentGsaMileageRate/);
  });
});

describe("submission mileage snapshots", () => {
  it("uses the current server-side rate for new requests", () => {
    const summary = calculateExpenseSummaryFromDraft(
      {
        requestDepartmentVehicle: false,
        totalReimbursableMiles: "100",
        registrationFee: "",
        lodging: "",
        airfare: "",
        rentalVehicle: "",
        foodExpenses: "",
        otherExpenses: "",
      },
      0.76,
    );
    assert.equal(summary.gsaMileageRate, 0.76);
    assert.equal(summary.mileageReimbursement, 76);
  });

  it("re-reads the current GSA rate server-side at final submission", () => {
    assert.match(submitServerSource, /getCurrentGsaMileageRate/);
    assert.match(submitServerSource, /calculateExpenseSummaryFromDraft/);
    assert.match(submitRouteSource, /force-dynamic/);
    assert.match(submitRouteSource, /submitTrainingRequestWithAuthoritativeGsaRate/);
  });

  it("preserves the original stored rate for returned-for-correction resubmits", () => {
    assert.equal(
      resolveSubmissionGsaMileageRate({
        mode: "returned",
        storedRequestGsaMileageRate: 0.67,
        currentServerRate: 0.76,
      }),
      0.67,
    );
  });

  it("uses the updated system rate for subsequent new submissions", () => {
    assert.equal(
      resolveSubmissionGsaMileageRate({
        mode: "create",
        storedRequestGsaMileageRate: null,
        currentServerRate: 0.76,
      }),
      0.76,
    );
  });
});
