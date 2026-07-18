import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isDenialWorkflowKind,
  isReturnWorkflowKind,
  isSignatureRequiredWorkflowKind,
  SIGNATURE_REQUIRED_MESSAGE,
  validateSignatureWorkflowActionInput,
} from "./training-request-workflow-policy";
import type { WorkflowActionKind } from "./training-request-workflow";
import {
  assertSnapshotMetadataMatchesBucket,
  verifyUploadedSignatureSnapshot,
} from "./training-request-signature-verification";
import { sha256Hex } from "./training-request-signature-snapshot";
import { VALID_SIGNATURE_TEST_PNG } from "./test-utils/build-test-png";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260718220000_approval_signature_snapshots_and_packets.sql",
);
const migrationSql = readFileSync(migrationPath, "utf8");
const workflowPolicySource = readFileSync(
  path.join(process.cwd(), "lib/training-request-workflow-policy.ts"),
  "utf8",
);

describe("Phase 2 workflow trust boundary migration", () => {
  it("does not grant completion RPC execution to authenticated users", () => {
    assert.match(
      migrationSql,
      /revoke execute on function public\.complete_training_request_signature_action[\s\S]*from authenticated;/,
    );
    assert.doesNotMatch(
      migrationSql,
      /grant execute on function public\.complete_training_request_signature_action[\s\S]*to authenticated;/,
    );
  });

  it("grants completion RPC execution to service_role only", () => {
    assert.match(
      migrationSql,
      /grant execute on function public\.complete_training_request_signature_action[\s\S]*to service_role;/,
    );
  });

  it("stores reservation actor identity snapshots at reservation time", () => {
    assert.match(migrationSql, /actor_name text not null,/);
    assert.match(migrationSql, /actor_badge_number text not null,/);
    assert.match(migrationSql, /actor_role text not null,/);
    assert.match(migrationSql, /actor_auth_user_id uuid,/);
    assert.match(migrationSql, /auth\.uid\(\)/);
  });

  it("derives completion actor identity from the reservation instead of auth.uid()", () => {
    const completeFunction = migrationSql.slice(
      migrationSql.indexOf("create or replace function public.complete_training_request_signature_action"),
      migrationSql.indexOf("alter table public.training_request_signature_action_reservations enable row level security"),
    );

    assert.doesNotMatch(completeFunction, /get_current_personnel_actor\(\)/);
    assert.match(completeFunction, /reservation_row\.actor_name/);
    assert.match(completeFunction, /reservation_row\.actor_badge_number/);
    assert.match(completeFunction, /reservation_row\.actor_role/);
  });
});

describe("signature workflow policy", () => {
  it("requires signatures for MTO and Deputy approve/deny actions", () => {
    const signatureActions: WorkflowActionKind[] = [
      "mto_approve",
      "mto_deny",
      "deputy_approve",
      "deputy_deny",
    ];

    for (const action of signatureActions) {
      assert.equal(isSignatureRequiredWorkflowKind(action), true);
    }
  });

  it("does not require signatures for return-for-correction actions", () => {
    assert.equal(isReturnWorkflowKind("mto_return"), true);
    assert.equal(isReturnWorkflowKind("deputy_return"), true);
    assert.equal(isSignatureRequiredWorkflowKind("mto_return"), false);
    assert.equal(isSignatureRequiredWorkflowKind("deputy_return"), false);
  });

  it("requires denial comments and electronic signature acknowledgment", () => {
    assert.throws(
      () =>
        validateSignatureWorkflowActionInput({
          action: "mto_deny",
          comments: "",
          electronicSignatureConfirmed: true,
        }),
      /Comments are required when denying a training request/,
    );

    assert.throws(
      () =>
        validateSignatureWorkflowActionInput({
          action: "deputy_deny",
          comments: "Denied for incomplete documentation.",
          electronicSignatureConfirmed: false,
        }),
      /Electronic signature acknowledgment is required/,
    );

    assert.doesNotThrow(() =>
      validateSignatureWorkflowActionInput({
        action: "mto_deny",
        comments: "Denied for incomplete documentation.",
        electronicSignatureConfirmed: true,
      }),
    );
  });

  it("uses the updated missing-signature message for approval and denial", () => {
    assert.equal(
      SIGNATURE_REQUIRED_MESSAGE,
      "You must save your signature before signing this training request action.",
    );
    assert.match(SIGNATURE_REQUIRED_MESSAGE, /signing this training request action/);
  });

  it("identifies denial workflow kinds separately from returns", () => {
    assert.equal(isDenialWorkflowKind("mto_deny"), true);
    assert.equal(isDenialWorkflowKind("deputy_deny"), true);
    assert.equal(isDenialWorkflowKind("mto_return"), false);
  });
});

describe("uploaded snapshot verification", () => {
  it("re-downloads snapshot bytes and derives metadata from the actual object", async () => {
    const requestId = "11111111-1111-1111-1111-111111111111";
    const reservationId = "22222222-2222-2222-2222-222222222222";

    const metadata = await verifyUploadedSignatureSnapshot({
      requestId,
      reservationId,
      downloadSnapshotBytes: async () => VALID_SIGNATURE_TEST_PNG,
    });

    assert.equal(metadata.sha256, sha256Hex(VALID_SIGNATURE_TEST_PNG));
    assert.equal(metadata.fileSizeBytes, VALID_SIGNATURE_TEST_PNG.byteLength);
    assertSnapshotMetadataMatchesBucket(metadata);
  });
});

describe("protected server workflow orchestration", () => {
  const workflowServerSource = readFileSync(
    path.join(process.cwd(), "lib/training-request-workflow-server.ts"),
    "utf8",
  );

  it("calls completion through the service-role client rather than the browser session", () => {
    assert.match(workflowServerSource, /createServiceRoleClient\(\)/);
    assert.match(
      workflowServerSource,
      /service\.rpc\(\s*\n\s*"complete_training_request_signature_action"/,
    );
    assert.match(workflowServerSource, /verifyUploadedSignatureSnapshot\(/);
    assert.doesNotMatch(
      workflowServerSource,
      /await supabase\.rpc\(\s*\n\s*"complete_training_request_signature_action"/,
    );
  });

  it("validates denial comments before reserving a signature action", () => {
    assert.match(workflowPolicySource, /Comments are required when denying a training request/);
    assert.match(workflowServerSource, /validateSignatureWorkflowActionInput\(/);
  });

  it("leaves the request approved and marks the packet failed when generation fails", () => {
    assert.match(workflowServerSource, /mark_training_request_packet_failed/);
    assert.match(
      workflowServerSource,
      /Approval remains successful even when packet generation fails/,
    );
  });

  it("reconciles snapshot cleanup only after the completion RPC is attempted", () => {
    assert.match(workflowServerSource, /completionAttempted/);
    assert.match(workflowServerSource, /handleSignatureWorkflowCompletionFailure\(/);
    assert.match(workflowServerSource, /tryReturnCommittedSignatureWorkflowAction\(/);
  });
});
