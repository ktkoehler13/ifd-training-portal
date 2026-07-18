import type {
  PersonnelSignatureRecord,
  PersonnelSignatureRow,
} from "@/types/personnel-signature";
import {
  PERSONNEL_SIGNATURE_OBJECT_NAME,
} from "@/types/personnel-signature";

export function getPersonnelSignatureStoragePath(personnelId: string): string {
  return `${personnelId}/${PERSONNEL_SIGNATURE_OBJECT_NAME}`;
}

export function mapPersonnelSignatureRow(
  row: PersonnelSignatureRow,
): PersonnelSignatureRecord {
  return {
    id: row.id,
    personnelId: row.personnel_id,
    storageBucket: row.storage_bucket,
    storagePath: row.storage_path,
    originalFilename: row.original_filename,
    mimeType: row.mime_type,
    fileSizeBytes: row.file_size_bytes,
    imageWidth: row.image_width,
    imageHeight: row.image_height,
    certificationConfirmed: row.certification_confirmed,
    certifiedAt: row.certified_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function savePersonnelSignature(input: {
  blob: Blob;
  originalFilename?: string | null;
  certificationConfirmed: boolean;
}): Promise<{
  signature: PersonnelSignatureRecord;
  previewUrl: string | null;
}> {
  const formData = new FormData();
  formData.append(
    "file",
    input.blob,
    input.originalFilename ?? PERSONNEL_SIGNATURE_OBJECT_NAME,
  );
  formData.append(
    "certificationConfirmed",
    input.certificationConfirmed ? "true" : "false",
  );

  if (input.originalFilename) {
    formData.append("originalFilename", input.originalFilename);
  }

  const response = await fetch("/api/settings/signature", {
    method: "POST",
    body: formData,
  });

  const payload = (await response.json()) as {
    signature?: PersonnelSignatureRecord;
    previewUrl?: string | null;
    error?: string;
  };

  if (!response.ok || !payload.signature) {
    throw new Error(payload.error ?? "Unable to save your signature.");
  }

  return {
    signature: payload.signature,
    previewUrl: payload.previewUrl ?? null,
  };
}
