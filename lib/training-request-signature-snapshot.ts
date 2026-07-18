import { createHash } from "node:crypto";
import {
  TRAINING_REQUEST_SIGNATURE_SNAPSHOT_BUCKET,
  TRAINING_REQUEST_PACKET_BUCKET,
  type SignatureSnapshotMetadata,
} from "@/types/training-request-packet";

export const SIGNATURE_REQUIRED_MESSAGE =
  "You must save your signature before approving a training request.";

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function getSignatureSnapshotStoragePath(
  requestId: string,
  actionId: string,
): string {
  return `${requestId}/${actionId}/signature.png`;
}

export function getApprovedPacketStoragePath(requestId: string): string {
  return `${requestId}/approved-packet.pdf`;
}

export function isValidSignatureSnapshotPath(
  requestId: string,
  actionId: string,
  storagePath: string,
): boolean {
  return (
    storagePath === getSignatureSnapshotStoragePath(requestId, actionId)
  );
}

export function buildSignatureSnapshotMetadata(input: {
  requestId: string;
  actionId: string;
  pngBytes: Uint8Array;
}): SignatureSnapshotMetadata {
  return {
    storageBucket: TRAINING_REQUEST_SIGNATURE_SNAPSHOT_BUCKET,
    storagePath: getSignatureSnapshotStoragePath(input.requestId, input.actionId),
    sha256: sha256Hex(input.pngBytes),
    mimeType: "image/png",
    fileSizeBytes: input.pngBytes.byteLength,
  };
}

export function mapWorkflowKindToExpectedAction(action: string): string | null {
  switch (action) {
    case "mto_approve":
      return "mto_approved";
    case "mto_deny":
      return "mto_denied";
    case "deputy_approve":
      return "deputy_chief_approved";
    case "deputy_deny":
      return "deputy_chief_denied";
    default:
      return null;
  }
}

export function isSignatureRequiredWorkflowKind(action: string): boolean {
  return mapWorkflowKindToExpectedAction(action) !== null;
}

export { TRAINING_REQUEST_SIGNATURE_SNAPSHOT_BUCKET, TRAINING_REQUEST_PACKET_BUCKET };
