import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  SIGNATURE_WORKFLOW_AMBIGUOUS_MESSAGE,
  handleSignatureWorkflowCompletionFailure,
  reconcileSignatureWorkflowCompletion,
} from "./training-request-workflow-reconciliation";
import type { TrainingRequestRecord } from "@/types/training-request";

const requestId = "11111111-1111-1111-1111-111111111111";
const reservationId = "22222222-2222-2222-2222-222222222222";
const snapshotPath = `${requestId}/${reservationId}/signature.png`;

function buildRequest(
  overrides: Partial<TrainingRequestRecord> = {},
): TrainingRequestRecord {
  return {
    id: requestId,
    requestNumber: "Koehler, K, Fire Officer I, 2026.1",
    requesterPersonnelId: "33333333-3333-3333-3333-333333333333",
    requesterBadgeNumber: "207",
    requesterEmail: "firefighter@ifd.example",
    requesterName: "Kevin Koehler",
    courseName: "Fire Officer I",
    courseNumber: "FO-1",
    trainingProvider: "Provider",
    courseDescription: "Description",
    location: "Montour Falls, NY",
    courseStartDate: "2026-08-01",
    courseEndDate: "2026-08-05",
    numberOfDaysOnDuty: 5,
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
    ...overrides,
  };
}

function createReconciliationDeps(overrides: {
  action?: { id: string } | null;
  reservation?: { consumed_at: string | null } | null;
  request?: TrainingRequestRecord | null;
  deleteSnapshot?: () => Promise<void>;
  generateApprovedPacket?: (requestId: string) => Promise<void>;
}) {
  let deleteCalls = 0;
  let packetGenerationCalls = 0;

  const deleteSnapshot =
    overrides.deleteSnapshot ??
    (async () => {
      deleteCalls += 1;
    });

  const generateApprovedPacket =
    overrides.generateApprovedPacket ??
    (async () => {
      packetGenerationCalls += 1;
    });

  return {
    deleteCalls: () => deleteCalls,
    packetGenerationCalls: () => packetGenerationCalls,
    deps: {
      findMatchingAction: async () => overrides.action ?? null,
      findReservation: async () => overrides.reservation ?? null,
      loadRequest: async () =>
        overrides.request === undefined ? buildRequest() : overrides.request,
      deleteSnapshot,
      generateApprovedPacket,
    },
  };
}

describe("reconcileSignatureWorkflowCompletion", () => {
  it("returns committed when the matching action row exists", async () => {
    const result = await reconcileSignatureWorkflowCompletion({
      requestId,
      reservationId,
      snapshotPath,
      findMatchingAction: async () => ({ id: reservationId }),
      findReservation: async () => ({ consumed_at: "2026-07-02T12:00:00.000Z" }),
      loadRequest: async () => buildRequest({ status: "pending_deputy_chief", currentActionRole: "deputy_chief" }),
    });

    assert.equal(result.status, "committed");
    if (result.status === "committed") {
      assert.equal(result.request.status, "pending_deputy_chief");
    }
  });

  it("returns ambiguous when the reservation is consumed but no action exists", async () => {
    const result = await reconcileSignatureWorkflowCompletion({
      requestId,
      reservationId,
      snapshotPath,
      findMatchingAction: async () => null,
      findReservation: async () => ({ consumed_at: "2026-07-02T12:00:00.000Z" }),
      loadRequest: async () => buildRequest(),
    });

    assert.equal(result.status, "ambiguous");
  });

  it("returns definitely_not_committed when no action exists and reservation is unconsumed", async () => {
    const result = await reconcileSignatureWorkflowCompletion({
      requestId,
      reservationId,
      snapshotPath,
      findMatchingAction: async () => null,
      findReservation: async () => ({ consumed_at: null }),
      loadRequest: async () => buildRequest(),
    });

    assert.equal(result.status, "definitely_not_committed");
  });
});

describe("handleSignatureWorkflowCompletionFailure", () => {
  it("deletes the snapshot and rethrows when completion failed before database commit", async () => {
    const { deleteCalls, deps } = createReconciliationDeps({
      action: null,
      reservation: { consumed_at: null },
    });
    const originalError = new Error("Completion RPC rejected the snapshot metadata.");

    await assert.rejects(
      () =>
        handleSignatureWorkflowCompletionFailure({
          requestId,
          reservationId,
          snapshotPath,
          action: "mto_approve",
          originalError,
          ...deps,
        }),
      originalError,
    );

    assert.equal(deleteCalls(), 1);
  });

  it("preserves the snapshot and returns the updated request when the action committed but the response was lost", async () => {
    const approvedRequest = buildRequest();
    const { deleteCalls, deps } = createReconciliationDeps({
      action: { id: reservationId },
      reservation: { consumed_at: "2026-07-02T12:00:00.000Z" },
      request: approvedRequest,
    });

    const result = await handleSignatureWorkflowCompletionFailure({
      requestId,
      reservationId,
      snapshotPath,
      action: "deputy_approve",
      originalError: new Error("Network error while reading RPC response."),
      ...deps,
    });

    assert.deepEqual(result, approvedRequest);
    assert.equal(deleteCalls(), 0);
  });

  it("preserves the snapshot and returns an ambiguous reconciliation error when reservation is consumed without an action row", async () => {
    const { deleteCalls, deps } = createReconciliationDeps({
      action: null,
      reservation: { consumed_at: "2026-07-02T12:00:00.000Z" },
    });

    await assert.rejects(
      () =>
        handleSignatureWorkflowCompletionFailure({
          requestId,
          reservationId,
          snapshotPath,
          action: "mto_deny",
          originalError: new Error("Completion RPC timed out."),
          ...deps,
        }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message, SIGNATURE_WORKFLOW_AMBIGUOUS_MESSAGE);
        return true;
      },
    );

    assert.equal(deleteCalls(), 0);
  });

  it("keeps Deputy Chief approval successful when packet generation fails after a committed action", async () => {
    let packetGenerationCalls = 0;
    let packetMarkedFailed = false;
    const approvedRequest = buildRequest();
    const { deleteCalls, deps } = createReconciliationDeps({
      action: { id: reservationId },
      reservation: { consumed_at: "2026-07-02T12:00:00.000Z" },
      request: approvedRequest,
      generateApprovedPacket: async () => {
        packetGenerationCalls += 1;
        packetMarkedFailed = true;
        throw new Error("PDF generation failed.");
      },
    });

    const result = await handleSignatureWorkflowCompletionFailure({
      requestId,
      reservationId,
      snapshotPath,
      action: "deputy_approve",
      originalError: new Error("Network error while reading RPC response."),
      ...deps,
    });

    assert.equal(result.status, "approved");
    assert.equal(deleteCalls(), 0);
    assert.equal(packetGenerationCalls, 1);
    assert.equal(packetMarkedFailed, true);
  });

  it("preserves denial actions when completion commits but the response is lost", async () => {
    const deniedRequest = buildRequest({ status: "denied" });
    const { deleteCalls, deps } = createReconciliationDeps({
      action: { id: reservationId },
      reservation: { consumed_at: "2026-07-02T12:00:00.000Z" },
      request: deniedRequest,
    });

    const result = await handleSignatureWorkflowCompletionFailure({
      requestId,
      reservationId,
      snapshotPath,
      action: "mto_deny",
      originalError: new Error("Network error while reading RPC response."),
      ...deps,
    });

    assert.equal(result.status, "denied");
    assert.equal(deleteCalls(), 0);
  });

  it("does not delete the snapshot when reconciliation finds an already committed action", async () => {
    const committedRequest = buildRequest({ status: "pending_deputy_chief", currentActionRole: "deputy_chief" });
    const { deleteCalls, deps } = createReconciliationDeps({
      action: { id: reservationId },
      reservation: { consumed_at: "2026-07-02T12:00:00.000Z" },
      request: committedRequest,
    });

    const first = await handleSignatureWorkflowCompletionFailure({
      requestId,
      reservationId,
      snapshotPath,
      action: "mto_approve",
      originalError: new Error("Network error while reading RPC response."),
      ...deps,
    });

    const second = await handleSignatureWorkflowCompletionFailure({
      requestId,
      reservationId,
      snapshotPath,
      action: "mto_approve",
      originalError: new Error("Network error while reading RPC response."),
      ...deps,
    });

    assert.deepEqual(first, committedRequest);
    assert.deepEqual(second, committedRequest);
    assert.equal(deleteCalls(), 0);
  });
});
