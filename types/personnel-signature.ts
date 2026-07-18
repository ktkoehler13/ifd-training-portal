export const PERSONNEL_SIGNATURE_BUCKET = "personnel-signatures" as const;
export const PERSONNEL_SIGNATURE_OBJECT_NAME = "signature.png" as const;
export const PERSONNEL_SIGNATURE_MAX_BYTES = 1_048_576;
export const PERSONNEL_SIGNATURE_MIN_WIDTH = 150;
export const PERSONNEL_SIGNATURE_MIN_HEIGHT = 50;
export const PERSONNEL_SIGNATURE_MAX_WIDTH = 2000;
export const PERSONNEL_SIGNATURE_MAX_HEIGHT = 1000;
export const PERSONNEL_SIGNATURE_MIME_TYPE = "image/png" as const;

export interface PersonnelSignatureRow {
  id: string;
  personnel_id: string;
  storage_bucket: string;
  storage_path: string;
  original_filename: string | null;
  mime_type: typeof PERSONNEL_SIGNATURE_MIME_TYPE;
  file_size_bytes: number;
  image_width: number | null;
  image_height: number | null;
  certification_confirmed: boolean;
  certified_at: string;
  created_at: string;
  updated_at: string;
}

export interface PersonnelSignatureRecord {
  id: string;
  personnelId: string;
  storageBucket: string;
  storagePath: string;
  originalFilename: string | null;
  mimeType: typeof PERSONNEL_SIGNATURE_MIME_TYPE;
  fileSizeBytes: number;
  imageWidth: number | null;
  imageHeight: number | null;
  certificationConfirmed: boolean;
  certifiedAt: string;
  createdAt: string;
  updatedAt: string;
}

export type SignatureInputMethod = "draw" | "upload";

export interface SignatureValidationResult {
  valid: boolean;
  error?: string;
  width?: number;
  height?: number;
}

export interface SignatureUploadState {
  isSaving: boolean;
  isDeleting: boolean;
  isLoadingPreview: boolean;
  error: string | null;
  successMessage: string | null;
}
