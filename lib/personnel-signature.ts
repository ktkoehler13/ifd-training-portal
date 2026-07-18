import { createClient } from "@/lib/supabase/client";
import type { AuthenticatedPersonnel } from "@/lib/auth/personnel";
import { validateSignatureBlob } from "@/lib/personnel-signature-validation";
import type {
  PersonnelSignatureRecord,
  PersonnelSignatureRow,
} from "@/types/personnel-signature";
import {
  PERSONNEL_SIGNATURE_BUCKET,
  PERSONNEL_SIGNATURE_MIME_TYPE,
  PERSONNEL_SIGNATURE_OBJECT_NAME,
} from "@/types/personnel-signature";

const SIGNED_URL_TTL_SECONDS = 300;

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

export async function getOwnPersonnelSignature(
  personnelId: string,
): Promise<PersonnelSignatureRecord | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("personnel_signatures")
    .select("*")
    .eq("personnel_id", personnelId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ? mapPersonnelSignatureRow(data as PersonnelSignatureRow) : null;
}

export async function createPersonnelSignaturePreviewUrl(
  storagePath: string,
): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.storage
    .from(PERSONNEL_SIGNATURE_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    throw new Error(error?.message ?? "Unable to create signature preview URL.");
  }

  return data.signedUrl;
}

export async function savePersonnelSignature(input: {
  personnel: AuthenticatedPersonnel;
  blob: Blob;
  originalFilename?: string | null;
}): Promise<{
  signature: PersonnelSignatureRecord;
  previewUrl: string | null;
}> {
  const validation = await validateSignatureBlob(
    input.blob,
    input.originalFilename,
  );

  if (!validation.valid) {
    throw new Error(validation.error ?? "Invalid signature image.");
  }

  const supabase = createClient();
  const storagePath = getPersonnelSignatureStoragePath(input.personnel.id);
  let uploadedObject = false;

  const { error: uploadError } = await supabase.storage
    .from(PERSONNEL_SIGNATURE_BUCKET)
    .upload(storagePath, input.blob, {
      upsert: true,
      contentType: PERSONNEL_SIGNATURE_MIME_TYPE,
      cacheControl: "3600",
    });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  uploadedObject = true;

  const response = await fetch("/api/settings/signature", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fileSizeBytes: input.blob.size,
      imageWidth: validation.width ?? null,
      imageHeight: validation.height ?? null,
      originalFilename:
        input.originalFilename ?? PERSONNEL_SIGNATURE_OBJECT_NAME,
    }),
  });

  const payload = (await response.json()) as {
    signature?: PersonnelSignatureRecord;
    previewUrl?: string | null;
    error?: string;
  };

  if (!response.ok || !payload.signature) {
    if (uploadedObject) {
      await supabase.storage.from(PERSONNEL_SIGNATURE_BUCKET).remove([storagePath]);
    }

    throw new Error(payload.error ?? "Unable to save signature metadata.");
  }

  return {
    signature: payload.signature,
    previewUrl: payload.previewUrl ?? null,
  };
}
