export const TRAINING_REQUEST_SIGNATURE_SNAPSHOT_BUCKET =
  "training-request-signature-snapshots" as const;
export const TRAINING_REQUEST_PACKET_BUCKET =
  "training-request-packets" as const;

export const TRAINING_REQUEST_PACKET_STATUSES = [
  "pending",
  "processing",
  "ready",
  "failed",
] as const;

export type TrainingRequestPacketStatus =
  (typeof TRAINING_REQUEST_PACKET_STATUSES)[number];

export const SIGNATURE_REQUIRED_WORKFLOW_ACTIONS = [
  "mto_approved",
  "mto_denied",
  "deputy_chief_approved",
  "deputy_chief_denied",
] as const;

export type SignatureRequiredWorkflowAction =
  (typeof SIGNATURE_REQUIRED_WORKFLOW_ACTIONS)[number];

export interface TrainingRequestPacketRow {
  id: string;
  request_id: string;
  storage_bucket: string;
  storage_path: string;
  filename: string;
  sha256: string | null;
  file_size_bytes: number | null;
  status: TrainingRequestPacketStatus;
  generation_attempts: number;
  last_error: string | null;
  generated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TrainingRequestPacketRecord {
  id: string;
  requestId: string;
  storageBucket: string;
  storagePath: string;
  filename: string;
  sha256: string | null;
  fileSizeBytes: number | null;
  status: TrainingRequestPacketStatus;
  generationAttempts: number;
  lastError: string | null;
  generatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SignatureSnapshotMetadata {
  storageBucket: typeof TRAINING_REQUEST_SIGNATURE_SNAPSHOT_BUCKET;
  storagePath: string;
  sha256: string;
  mimeType: "image/png";
  fileSizeBytes: number;
}
