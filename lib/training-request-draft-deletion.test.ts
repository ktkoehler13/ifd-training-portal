import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildDeleteDraftDialogBody,
  canDeleteTrainingRequestDraft,
  DRAFT_DELETED_SUCCESS_MESSAGE,
  isDraftDeletionConfirmed,
  removeDeletedDraftFromList,
  shouldShowDeleteDraftButton,
} from "./training-request-draft-deletion";
import { getTrainingRequestErrorMessage } from "./training-requests";
import type { TrainingRequestRecord } from "@/types/training-request";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260718230000_delete_own_training_request_drafts.sql",
);
const migrationSql = readFileSync(migrationPath, "utf8");
const myRequestsSource = readFileSync(
  path.join(process.cwd(), "components/requests/MyRequestsView.tsx"),
  "utf8",
);
const deleteDraftDialogSource = readFileSync(
  path.join(process.cwd(), "components/requests/DeleteDraftDialog.tsx"),
  "utf8",
);
const trainingRequestsSource = readFileSync(
  path.join(process.cwd(), "lib/training-requests.ts"),
  "utf8",
);

const ownerId = "11111111-1111-1111-1111-111111111111";
const otherOwnerId = "22222222-2222-2222-2222-222222222222";

function makeRequest(
  overrides: Partial<TrainingRequestRecord>,
): TrainingRequestRecord {
  return {
    id: "33333333-3333-3333-3333-333333333333",
    requestNumber: null,
    requesterPersonnelId: ownerId,
    requesterBadgeNumber: "207",
    requesterEmail: "owner@ifd.example",
    requesterName: "Kevin Koehler",
    requesterTitleSnapshot: null,
    courseName: "Fire Officer I",
    courseNumber: "FO-1",
    trainingProvider: "Provider",
    courseDescription: "Description",
    location: "Montour Falls, NY",
    courseStartDate: "2026-08-01",
    courseEndDate: "2026-08-05",
    totalDaysIncludingTravel: null,
    numberOfDaysOnDuty: 5,
    onDutyDates: [],
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
    status: "draft",
    currentActionRole: null,
    submittedAt: null,
    createdAt: "2026-06-30T12:00:00.000Z",
    updatedAt: "2026-06-30T12:00:00.000Z",
    ...overrides,
  };
}

describe("delete_own_training_request_draft migration", () => {
  it("allows an owner to delete their own draft", () => {
    assert.match(migrationSql, /public\.current_personnel_id\(\)/);
    assert.match(
      migrationSql,
      /request_row\.requester_personnel_id <> personnel_id/,
    );
    assert.match(migrationSql, /request_row\.status <> 'draft'/);
    assert.match(migrationSql, /delete from public\.training_requests/);
  });

  it("rejects deleting another user's draft", () => {
    assert.match(
      migrationSql,
      /raise exception 'Only the requester may delete this draft training request'/,
    );
  });

  it("rejects deleting a submitted request", () => {
    assert.match(
      migrationSql,
      /raise exception 'Only draft training requests may be deleted'/,
    );
    assert.doesNotMatch(
      migrationSql,
      /grant delete on table public\.training_requests/i,
    );
  });

  it("rejects deleting a returned-for-correction request", () => {
    assert.match(migrationSql, /request_row\.status <> 'draft'/);
  });

  it("rejects deleting an approved request", () => {
    assert.match(migrationSql, /request_row\.status <> 'draft'/);
  });

  it("grants execute only to authenticated users", () => {
    assert.match(
      migrationSql,
      /revoke all on function public\.delete_own_training_request_draft\(uuid\) from public;/,
    );
    assert.match(
      migrationSql,
      /revoke all on function public\.delete_own_training_request_draft\(uuid\) from anon;/,
    );
    assert.match(
      migrationSql,
      /grant execute on function public\.delete_own_training_request_draft\(uuid\) to authenticated;/,
    );
    assert.doesNotMatch(
      migrationSql,
      /grant execute on function public\.delete_own_training_request_draft\(uuid\) to service_role;/,
    );
  });
});

describe("draft deletion authorization helpers", () => {
  it("allows an owner to delete their own draft", () => {
    assert.equal(
      canDeleteTrainingRequestDraft(makeRequest({ status: "draft" }), ownerId),
      true,
    );
  });

  it("blocks deleting another user's draft", () => {
    assert.equal(
      canDeleteTrainingRequestDraft(
        makeRequest({ requesterPersonnelId: otherOwnerId }),
        ownerId,
      ),
      false,
    );
  });

  it("blocks deleting a submitted request", () => {
    assert.equal(
      canDeleteTrainingRequestDraft(
        makeRequest({ status: "pending_mto", submittedAt: "2026-07-01T12:00:00.000Z" }),
        ownerId,
      ),
      false,
    );
  });

  it("blocks deleting a returned-for-correction request", () => {
    assert.equal(
      canDeleteTrainingRequestDraft(
        makeRequest({ status: "returned_for_correction" }),
        ownerId,
      ),
      false,
    );
  });

  it("blocks deleting an approved request", () => {
    assert.equal(
      canDeleteTrainingRequestDraft(makeRequest({ status: "approved" }), ownerId),
      false,
    );
  });
});

describe("My Requests draft deletion UI", () => {
  it("shows the delete button only for draft rows", () => {
    assert.equal(shouldShowDeleteDraftButton("draft"), true);
    assert.equal(shouldShowDeleteDraftButton("pending_mto"), false);
    assert.equal(shouldShowDeleteDraftButton("returned_for_correction"), false);
    assert.equal(shouldShowDeleteDraftButton("approved"), false);

    assert.match(myRequestsSource, /shouldShowDeleteDraftButton\(request\.status\)/);
    assert.match(myRequestsSource, /Delete Draft/);
    assert.match(myRequestsSource, /request\.status === "draft"/);
  });

  it("requires confirmation before deleting a draft", () => {
    assert.match(myRequestsSource, /DeleteDraftDialog/);
    assert.match(myRequestsSource, /onClick=\{\(\) => setDraftToDelete\(request\)\}/);
    assert.doesNotMatch(
      myRequestsSource,
      /onClick=\{[\s\S]*deleteOwnTrainingRequestDraft/,
    );
    assert.match(deleteDraftDialogSource, /role="dialog"/);
    assert.match(deleteDraftDialogSource, /aria-modal="true"/);
    assert.match(deleteDraftDialogSource, /Cancel/);
    assert.doesNotMatch(
      deleteDraftDialogSource,
      /useEffect[\s\S]*deleteOwnTrainingRequestDraft/,
    );
    assert.equal(isDraftDeletionConfirmed(false), false);
    assert.equal(isDraftDeletionConfirmed(true), true);
  });

  it("removes a successfully deleted draft from the current list", () => {
    const draft = makeRequest({ id: "aaaa-aaaa" });
    const other = makeRequest({
      id: "bbbb-bbbb",
      courseName: "Other Course",
    });

    const next = removeDeletedDraftFromList([draft, other], draft.id);

    assert.equal(next.length, 1);
    assert.equal(next[0]?.id, other.id);
    assert.match(myRequestsSource, /removeDeletedDraftFromList/);
    assert.match(myRequestsSource, /DRAFT_DELETED_SUCCESS_MESSAGE/);
    assert.equal(DRAFT_DELETED_SUCCESS_MESSAGE, "Draft deleted.");
  });

  it("preserves the draft in the list when deletion fails", () => {
    const catchBlock = deleteDraftDialogSource.slice(
      deleteDraftDialogSource.indexOf("catch (deleteError)"),
      deleteDraftDialogSource.indexOf("} finally {"),
    );
    const confirmHandler = myRequestsSource.slice(
      myRequestsSource.indexOf("async function handleConfirmDeleteDraft"),
      myRequestsSource.indexOf(
        "return (",
        myRequestsSource.indexOf("async function handleConfirmDeleteDraft"),
      ),
    );

    assert.match(deleteDraftDialogSource, /role="alert"/);
    assert.doesNotMatch(catchBlock, /onClose\(\)/);
    assert.doesNotMatch(confirmHandler, /catch/);
    assert.match(confirmHandler, /await deleteOwnTrainingRequestDraft/);
    assert.match(confirmHandler, /removeDeletedDraftFromList/);
  });

  it("prevents duplicate delete submissions while deleting", () => {
    assert.match(deleteDraftDialogSource, /if \(isSubmitting\)/);
    assert.match(deleteDraftDialogSource, /disabled=\{isSubmitting\}/);
    assert.match(deleteDraftDialogSource, /Deleting…/);
  });
});

describe("deleteOwnTrainingRequestDraft client function", () => {
  it("calls the secure RPC without accepting a personnel ID from the browser", () => {
    assert.match(
      trainingRequestsSource,
      /export async function deleteOwnTrainingRequestDraft\([\s\S]*supabase\.rpc\("delete_own_training_request_draft"/,
    );
    assert.doesNotMatch(
      trainingRequestsSource,
      /deleteOwnTrainingRequestDraft\([\s\S]*personnelId/,
    );
    assert.match(trainingRequestsSource, /getTrainingRequestErrorMessage\(error\)/);
  });

  it("sanitizes missing draft save errors without exposing raw SQL details", () => {
    assert.equal(
      getTrainingRequestErrorMessage({ code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" }),
      "This draft no longer exists.",
    );
  });
});

describe("delete draft dialog copy", () => {
  it("includes the course name in the confirmation body", () => {
    assert.match(
      buildDeleteDraftDialogBody("Fire Officer I"),
      /Fire Officer I/,
    );
    assert.match(buildDeleteDraftDialogBody("Fire Officer I"), /cannot be undone/);
  });
});
