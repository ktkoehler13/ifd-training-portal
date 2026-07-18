import { verifyPngSignatureBytes } from "@/lib/personnel-signature-png";
import {
  buildSignatureSnapshotMetadata,
  getSignatureSnapshotStoragePath,
  TRAINING_REQUEST_SIGNATURE_SNAPSHOT_BUCKET,
} from "@/lib/training-request-signature-snapshot";
import type { SignatureSnapshotMetadata } from "@/types/training-request-packet";

export class SignatureSnapshotVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SignatureSnapshotVerificationError";
  }
}

export async function verifyUploadedSignatureSnapshot(input: {
  requestId: string;
  reservationId: string;
  downloadSnapshotBytes: (storagePath: string) => Promise<Uint8Array>;
}): Promise<SignatureSnapshotMetadata> {
  const storagePath = getSignatureSnapshotStoragePath(
    input.requestId,
    input.reservationId,
  );
  const downloadedBytes = await input.downloadSnapshotBytes(storagePath);
  const verified = verifyPngSignatureBytes(downloadedBytes);

  if ("error" in verified) {
    throw new SignatureSnapshotVerificationError(verified.error);
  }

  return buildSignatureSnapshotMetadata({
    requestId: input.requestId,
    actionId: input.reservationId,
    pngBytes: downloadedBytes,
  });
}

export function assertSnapshotMetadataMatchesBucket(
  metadata: SignatureSnapshotMetadata,
): void {
  if (metadata.storageBucket !== TRAINING_REQUEST_SIGNATURE_SNAPSHOT_BUCKET) {
    throw new SignatureSnapshotVerificationError("Snapshot metadata bucket mismatch.");
  }
}
