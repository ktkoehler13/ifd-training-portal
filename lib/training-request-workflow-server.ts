import { getAuthenticatedPersonnel } from "@/lib/auth/personnel";
import { generateApprovedPacketBytes } from "@/lib/pdf/generate-approved-packet";
import { verifyPngSignatureBytes } from "@/lib/personnel-signature-png";
import { mapTrainingRequestRow, getTrainingRequestErrorMessage } from "@/lib/training-requests";
import { mapTrainingRequestActionRow } from "@/lib/training-request-actions";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { buildTrainingRequestFilename } from "@/lib/training-request-filename";
import {
  buildSignatureSnapshotMetadata,
  getApprovedPacketStoragePath,
  mapWorkflowKindToExpectedAction,
  sha256Hex,
  SIGNATURE_REQUIRED_MESSAGE,
  TRAINING_REQUEST_PACKET_BUCKET,
  TRAINING_REQUEST_SIGNATURE_SNAPSHOT_BUCKET,
} from "@/lib/training-request-signature-snapshot";
import {
  assertSnapshotMetadataMatchesBucket,
  verifyUploadedSignatureSnapshot,
} from "@/lib/training-request-signature-verification";
import { validateSignatureWorkflowActionInput } from "@/lib/training-request-workflow-policy";
import {
  handleSignatureWorkflowCompletionFailure,
  reconcileSignatureWorkflowCompletion,
} from "@/lib/training-request-workflow-reconciliation";
import type { WorkflowActionKind } from "@/lib/training-request-workflow";
import type { TrainingRequestActionRow } from "@/types/training-request-action";
import type { TrainingRequestRow, TrainingRequestRecord } from "@/types/training-request";
import {
  PERSONNEL_SIGNATURE_MIME_TYPE,
} from "@/types/personnel-signature";
import type { PersonnelSignatureRow } from "@/types/personnel-signature";

export class TrainingRequestWorkflowAccessError extends Error {
  constructor(message = "Access denied.") {
    super(message);
    this.name = "TrainingRequestWorkflowAccessError";
  }
}

export class TrainingRequestWorkflowValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TrainingRequestWorkflowValidationError";
  }
}

export class TrainingRequestWorkflowAmbiguousError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TrainingRequestWorkflowAmbiguousError";
  }
}

function sanitizeWorkflowErrorMessage(error: unknown): string {
  return getTrainingRequestErrorMessage(error);
}

async function downloadStorageObject(bucket: string, storagePath: string): Promise<Uint8Array> {
  const service = createServiceRoleClient();
  const { data, error } = await service.storage.from(bucket).download(storagePath);

  if (error || !data) {
    throw new Error(error?.message ?? "Unable to download required storage object.");
  }

  return new Uint8Array(await data.arrayBuffer());
}

async function uploadSignatureSnapshot(input: {
  requestId: string;
  reservationId: string;
  pngBytes: Uint8Array;
}): Promise<void> {
  const metadata = buildSignatureSnapshotMetadata({
    requestId: input.requestId,
    actionId: input.reservationId,
    pngBytes: input.pngBytes,
  });
  const service = createServiceRoleClient();
  const { error } = await service.storage
    .from(TRAINING_REQUEST_SIGNATURE_SNAPSHOT_BUCKET)
    .upload(metadata.storagePath, input.pngBytes, {
      contentType: PERSONNEL_SIGNATURE_MIME_TYPE,
      upsert: false,
    });

  if (error) {
    throw new Error(error.message);
  }
}

async function downloadSnapshotObject(storagePath: string): Promise<Uint8Array> {
  return downloadStorageObject(TRAINING_REQUEST_SIGNATURE_SNAPSHOT_BUCKET, storagePath);
}

async function deleteSignatureSnapshot(storagePath: string): Promise<void> {
  const service = createServiceRoleClient();
  await service.storage
    .from(TRAINING_REQUEST_SIGNATURE_SNAPSHOT_BUCKET)
    .remove([storagePath]);
}

async function loadPersonnelSignaturePng(personnelId: string): Promise<Uint8Array> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("personnel_signatures")
    .select("*")
    .eq("personnel_id", personnelId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new TrainingRequestWorkflowValidationError(SIGNATURE_REQUIRED_MESSAGE);
  }

  const signature = data as PersonnelSignatureRow;
  return downloadStorageObject(signature.storage_bucket, signature.storage_path);
}

function findLatestAction(
  actions: ReturnType<typeof mapTrainingRequestActionRow>[],
  actionType: "mto_approved" | "deputy_chief_approved",
) {
  for (let index = actions.length - 1; index >= 0; index -= 1) {
    if (actions[index].action === actionType) {
      return actions[index];
    }
  }

  return null;
}

function createReconciliationQueries(input: {
  requestId: string;
  reservationId: string;
  snapshotPath: string;
}) {
  const service = createServiceRoleClient();

  return {
    async findMatchingAction() {
      const { data, error } = await service
        .from("training_request_actions")
        .select("id")
        .eq("id", input.reservationId)
        .eq("training_request_id", input.requestId)
        .eq("signature_storage_path", input.snapshotPath)
        .maybeSingle();

      if (error) {
        throw new Error(error.message);
      }

      return data;
    },
    async findReservation() {
      const { data, error } = await service
        .from("training_request_signature_action_reservations")
        .select("consumed_at")
        .eq("id", input.reservationId)
        .maybeSingle();

      if (error) {
        throw new Error(error.message);
      }

      return data;
    },
    async loadRequest() {
      const { data, error } = await service
        .from("training_requests")
        .select("*")
        .eq("id", input.requestId)
        .maybeSingle();

      if (error) {
        throw new Error(error.message);
      }

      return data ? mapTrainingRequestRow(data as TrainingRequestRow) : null;
    },
  };
}

async function tryReturnCommittedSignatureWorkflowAction(input: {
  requestId: string;
  reservationId: string;
  snapshotPath: string;
  action: WorkflowActionKind;
}): Promise<TrainingRequestRecord | null> {
  const reconciliation = await reconcileSignatureWorkflowCompletion({
    requestId: input.requestId,
    reservationId: input.reservationId,
    snapshotPath: input.snapshotPath,
    ...createReconciliationQueries(input),
  });

  if (reconciliation.status !== "committed") {
    return null;
  }

  if (
    input.action === "deputy_approve" &&
    reconciliation.request.status === "approved"
  ) {
    try {
      await generateApprovedTrainingRequestPacket(input.requestId);
    } catch {
      // Approval remains successful even when packet generation fails.
    }
  }

  return reconciliation.request;
}

export async function generateApprovedTrainingRequestPacket(
  requestId: string,
): Promise<void> {
  const service = createServiceRoleClient();

  const { error: processingError } = await service.rpc(
    "mark_training_request_packet_processing",
    { p_request_id: requestId },
  );

  if (processingError) {
    throw new Error(processingError.message);
  }

  try {
    const { data: requestData, error: requestError } = await service
      .from("training_requests")
      .select("*")
      .eq("id", requestId)
      .maybeSingle();

    if (requestError || !requestData) {
      throw new Error(requestError?.message ?? "Training request not found.");
    }

    const request = mapTrainingRequestRow(requestData as TrainingRequestRow);

    if (request.status !== "approved") {
      throw new Error("Approved packets may only be generated for approved requests.");
    }

    const { data: actionRows, error: actionsError } = await service
      .from("training_request_actions")
      .select("*")
      .eq("training_request_id", requestId)
      .order("created_at", { ascending: true });

    if (actionsError) {
      throw new Error(actionsError.message);
    }

    const actions = (actionRows as TrainingRequestActionRow[]).map(
      mapTrainingRequestActionRow,
    );
    const mtoAction = findLatestAction(actions, "mto_approved");
    const deputyAction = findLatestAction(actions, "deputy_chief_approved");

    if (!mtoAction?.signatureStoragePath || !deputyAction?.signatureStoragePath) {
      throw new Error("Approval signature snapshots are missing for packet generation.");
    }

    const [mtoSignaturePng, deputySignaturePng] = await Promise.all([
      downloadStorageObject(
        mtoAction.signatureStorageBucket ?? TRAINING_REQUEST_SIGNATURE_SNAPSHOT_BUCKET,
        mtoAction.signatureStoragePath,
      ),
      downloadStorageObject(
        deputyAction.signatureStorageBucket ?? TRAINING_REQUEST_SIGNATURE_SNAPSHOT_BUCKET,
        deputyAction.signatureStoragePath,
      ),
    ]);

    const pdfBytes = await generateApprovedPacketBytes({
      request,
      mtoAction,
      deputyAction,
      mtoSignaturePng,
      deputySignaturePng,
    });

    const storagePath = getApprovedPacketStoragePath(requestId);
    const { error: uploadError } = await service.storage
      .from(TRAINING_REQUEST_PACKET_BUCKET)
      .upload(storagePath, pdfBytes, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadError) {
      throw new Error(uploadError.message);
    }

    const { error: readyError } = await service.rpc(
      "mark_training_request_packet_ready",
      {
        p_request_id: requestId,
        p_sha256: sha256Hex(pdfBytes),
        p_file_size_bytes: pdfBytes.byteLength,
      },
    );

    if (readyError) {
      throw new Error(readyError.message);
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Approved packet generation failed.";

    await service.rpc("mark_training_request_packet_failed", {
      p_request_id: requestId,
      p_last_error: message,
    });

    throw error instanceof Error ? error : new Error(message);
  }
}

export async function executeSignatureWorkflowAction(input: {
  requestId: string;
  action: WorkflowActionKind;
  comments: string | null;
  electronicSignatureConfirmed: boolean;
}) {
  const expectedAction = mapWorkflowKindToExpectedAction(input.action);

  if (!expectedAction) {
    throw new TrainingRequestWorkflowValidationError("Unsupported workflow action.");
  }

  try {
    validateSignatureWorkflowActionInput(input);
  } catch (error) {
    throw new TrainingRequestWorkflowValidationError(
      error instanceof Error ? error.message : "Invalid workflow action input.",
    );
  }

  const personnel = await getAuthenticatedPersonnel();
  if (!personnel) {
    throw new TrainingRequestWorkflowAccessError();
  }

  const supabase = await createClient();
  const { data: reservationId, error: reserveError } = await supabase.rpc(
    "reserve_training_request_signature_action",
    {
      p_request_id: input.requestId,
      p_expected_action: expectedAction,
    },
  );

  if (reserveError) {
    throw new Error(sanitizeWorkflowErrorMessage(reserveError));
  }

  if (!reservationId || typeof reservationId !== "string") {
    throw new Error("Unable to reserve a signature workflow action.");
  }

  let snapshotPath: string | null = null;
  let completionAttempted = false;

  try {
    const pngBytes = await loadPersonnelSignaturePng(personnel.id);
    const verified = verifyPngSignatureBytes(pngBytes);

    if ("error" in verified) {
      throw new TrainingRequestWorkflowValidationError(verified.error);
    }

    await uploadSignatureSnapshot({
      requestId: input.requestId,
      reservationId,
      pngBytes,
    });

    const snapshotMetadata = await verifyUploadedSignatureSnapshot({
      requestId: input.requestId,
      reservationId,
      downloadSnapshotBytes: downloadSnapshotObject,
    });
    assertSnapshotMetadataMatchesBucket(snapshotMetadata);
    snapshotPath = snapshotMetadata.storagePath;

    const existingCommittedRequest = await tryReturnCommittedSignatureWorkflowAction({
      requestId: input.requestId,
      reservationId,
      snapshotPath,
      action: input.action,
    });

    if (existingCommittedRequest) {
      return existingCommittedRequest;
    }

    completionAttempted = true;
    const service = createServiceRoleClient();
    const { data, error: completeError } = await service.rpc(
      "complete_training_request_signature_action",
      {
        p_reservation_id: reservationId,
        p_comments: input.comments?.trim() || null,
        p_electronic_signature_confirmed: true,
        p_signature_storage_bucket: snapshotMetadata.storageBucket,
        p_signature_storage_path: snapshotMetadata.storagePath,
        p_signature_sha256: snapshotMetadata.sha256,
        p_signature_mime_type: snapshotMetadata.mimeType,
        p_signature_file_size_bytes: snapshotMetadata.fileSizeBytes,
      },
    );

    if (completeError) {
      throw new Error(sanitizeWorkflowErrorMessage(completeError));
    }

    if (!data) {
      throw new Error("Workflow action did not return an updated request.");
    }

    const updatedRequest = mapTrainingRequestRow(data as TrainingRequestRow);

    if (input.action === "deputy_approve" && updatedRequest.status === "approved") {
      try {
        await generateApprovedTrainingRequestPacket(input.requestId);
      } catch {
        // Approval remains successful even when packet generation fails.
      }
    }

    return updatedRequest;
  } catch (error) {
    if (snapshotPath && completionAttempted) {
      return handleSignatureWorkflowCompletionFailure({
        requestId: input.requestId,
        reservationId,
        snapshotPath,
        action: input.action,
        originalError: error,
        ...createReconciliationQueries({
          requestId: input.requestId,
          reservationId,
          snapshotPath,
        }),
        deleteSnapshot: deleteSignatureSnapshot,
        generateApprovedPacket: generateApprovedTrainingRequestPacket,
        createAmbiguousError: (message) =>
          new TrainingRequestWorkflowAmbiguousError(message),
      });
    }

    if (snapshotPath) {
      await deleteSignatureSnapshot(snapshotPath).catch(() => undefined);
    }

    throw error;
  }
}

export async function retryApprovedTrainingRequestPacket(
  requestId: string,
): Promise<void> {
  const personnel = await getAuthenticatedPersonnel();
  if (!personnel) {
    throw new TrainingRequestWorkflowAccessError();
  }

  const supabase = await createClient();
  const { data: requestData, error: requestError } = await supabase
    .from("training_requests")
    .select("*")
    .eq("id", requestId)
    .maybeSingle();

  if (requestError || !requestData) {
    throw new Error(requestError?.message ?? "Training request not found.");
  }

  const request = mapTrainingRequestRow(requestData as TrainingRequestRow);

  if (request.status !== "approved") {
    throw new TrainingRequestWorkflowValidationError(
      "Approved packet generation can only be retried for approved requests.",
    );
  }

  const service = createServiceRoleClient();
  const { error: pendingError } = await service.rpc(
    "upsert_training_request_packet_pending",
    { p_request_id: requestId },
  );

  if (pendingError) {
    throw new Error(pendingError.message);
  }

  await generateApprovedTrainingRequestPacket(requestId);
}

export async function downloadApprovedTrainingRequestPacket(input: {
  requestId: string;
}): Promise<{
  bytes: Uint8Array;
  filename: string;
}> {
  const personnel = await getAuthenticatedPersonnel();
  if (!personnel) {
    throw new TrainingRequestWorkflowAccessError();
  }

  const supabase = await createClient();
  const { data: requestData, error: requestError } = await supabase
    .from("training_requests")
    .select("*")
    .eq("id", input.requestId)
    .maybeSingle();

  if (requestError || !requestData) {
    throw new Error(requestError?.message ?? "Training request not found.");
  }

  const request = mapTrainingRequestRow(requestData as TrainingRequestRow);
  const isOwner = request.requesterPersonnelId === personnel.id;
  const isAdmin =
    personnel.role === "mto" ||
    personnel.role === "deputy_chief" ||
    personnel.role === "admin";

  if (!isOwner && !isAdmin) {
    throw new TrainingRequestWorkflowAccessError();
  }

  if (request.status !== "approved") {
    throw new TrainingRequestWorkflowValidationError(
      "Approved packets are only available after final approval.",
    );
  }

  const { data: packetData, error: packetError } = await supabase
    .from("training_request_packets")
    .select("*")
    .eq("request_id", input.requestId)
    .maybeSingle();

  if (packetError) {
    throw new Error(packetError.message);
  }

  if (!packetData || packetData.status !== "ready") {
    throw new TrainingRequestWorkflowValidationError(
      "Approved packet is not ready for download.",
    );
  }

  const service = createServiceRoleClient();
  const { data: pdfBlob, error: downloadError } = await service.storage
    .from(TRAINING_REQUEST_PACKET_BUCKET)
    .download(packetData.storage_path);

  if (downloadError || !pdfBlob) {
    throw new Error(downloadError?.message ?? "Unable to download approved packet.");
  }

  return {
    bytes: new Uint8Array(await pdfBlob.arrayBuffer()),
    filename: packetData.filename || buildTrainingRequestFilename(request),
  };
}
