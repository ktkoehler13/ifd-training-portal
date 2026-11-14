import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { mapTrainingRequestRow } from "@/lib/training-requests";
import { verifyPngSignatureBytes } from "@/lib/personnel-signature-png";
import { verifyUploadedSignatureSnapshot } from "@/lib/training-request-signature-verification";
import { getSignatureSnapshotStoragePath } from "@/lib/training-request-signature-snapshot";
import { createReconciliationQueries, deleteSignatureSnapshot, downloadSnapshotObject, loadPersonnelSignaturePng, uploadSignatureSnapshot } from "@/lib/training-request-workflow-server";
import { reconcileSignatureWorkflowCompletion, SIGNATURE_WORKFLOW_AMBIGUOUS_MESSAGE } from "@/lib/training-request-workflow-reconciliation";
import type { TrainingRequestRecord, TrainingRequestRow } from "@/types/training-request";

export async function loadRequesterSubmissionSignature(personnelId: string): Promise<Uint8Array> {
  const png = await loadPersonnelSignaturePng(personnelId);
  const verified = verifyPngSignatureBytes(png);
  if ("error" in verified) throw new Error(verified.error);
  return png;
}

export async function submitWithRequesterSignature(request: TrainingRequestRecord, pngBytes: Uint8Array): Promise<TrainingRequestRecord> {
  const db = await createClient();
  const { data: reservationId, error } = await db.rpc("reserve_requester_submission_signature", {
    p_request_id: request.id, p_expected_updated_at: request.updatedAt,
  });
  if (error || typeof reservationId !== "string") throw new Error(error?.message ?? "Unable to reserve requester signature.");
  const snapshotPath = getSignatureSnapshotStoragePath(request.id, reservationId);
  let completionAttempted = false;
  try {
    await uploadSignatureSnapshot({ requestId: request.id, reservationId, pngBytes });
    const metadata = await verifyUploadedSignatureSnapshot({ requestId: request.id, reservationId, downloadSnapshotBytes: downloadSnapshotObject });
    completionAttempted = true;
    const { data, error: completeError } = await createServiceRoleClient().rpc("complete_requester_submission_signature", {
      p_reservation_id: reservationId, p_electronic_signature_confirmed: true,
      p_signature_storage_bucket: metadata.storageBucket, p_signature_storage_path: metadata.storagePath,
      p_signature_sha256: metadata.sha256, p_signature_mime_type: metadata.mimeType,
      p_signature_file_size_bytes: metadata.fileSizeBytes,
    });
    if (completeError || !data) throw new Error(completeError?.message ?? "Unable to confirm submission.");
    return mapTrainingRequestRow(data as TrainingRequestRow);
  } catch (failure) {
    if (completionAttempted) {
      // Preserve the snapshot on uncertain outcomes; never delete a possibly
      // committed signature after a timeout or connection failure.
      const result = await reconcileSignatureWorkflowCompletion({
        requestId: request.id, reservationId, snapshotPath,
        ...createReconciliationQueries({ requestId: request.id, reservationId, snapshotPath }),
      }).catch(() => ({ status: "ambiguous" as const }));
      if (result.status === "committed") return result.request;
      throw new Error(result.status === "ambiguous" ? SIGNATURE_WORKFLOW_AMBIGUOUS_MESSAGE :
        failure instanceof Error ? failure.message : "Unable to submit the signed request.");
    }
    await deleteSignatureSnapshot(snapshotPath).catch(() => undefined);
    throw failure;
  }
}
