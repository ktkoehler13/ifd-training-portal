import { createClient } from "@/lib/supabase/client";
import type {
  TrainingRequestPacketRecord,
  TrainingRequestPacketRow,
} from "@/types/training-request-packet";

export function mapTrainingRequestPacketRow(
  row: TrainingRequestPacketRow,
): TrainingRequestPacketRecord {
  return {
    id: row.id,
    requestId: row.request_id,
    storageBucket: row.storage_bucket,
    storagePath: row.storage_path,
    filename: row.filename,
    sha256: row.sha256,
    fileSizeBytes: row.file_size_bytes,
    status: row.status,
    generationAttempts: row.generation_attempts,
    lastError: row.last_error,
    generatedAt: row.generated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getTrainingRequestPacketByRequestId(
  requestId: string,
): Promise<TrainingRequestPacketRecord | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("training_request_packets")
    .select("*")
    .eq("request_id", requestId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data
    ? mapTrainingRequestPacketRow(data as TrainingRequestPacketRow)
    : null;
}

export async function retryApprovedPacketGeneration(
  requestId: string,
): Promise<{ ok: true }> {
  const response = await fetch(
    `/api/training-requests/${encodeURIComponent(requestId)}/approved-packet/retry`,
    { method: "POST" },
  );

  const payload = (await response.json()) as { error?: string };

  if (!response.ok) {
    throw new Error(payload.error ?? "Unable to retry approved packet generation.");
  }

  return { ok: true };
}
