import { randomUUID } from "node:crypto";
import { getAuthenticatedPersonnel } from "@/lib/auth/personnel";
import { isSignatureEligibleRole } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import {
  getPersonnelSignatureStoragePath,
  mapPersonnelSignatureRow,
} from "@/lib/personnel-signature";
import {
  CERTIFICATION_REQUIRED_MESSAGE,
  getPersonnelSignatureBackupPath,
  getPersonnelSignaturePendingPath,
  isStorageObjectNotFoundError,
  sanitizeOriginalFilename,
  verifyPngSignatureBytes,
} from "@/lib/personnel-signature-png";
import type {
  PersonnelSignatureRecord,
  PersonnelSignatureRow,
} from "@/types/personnel-signature";
import {
  PERSONNEL_SIGNATURE_BUCKET,
  PERSONNEL_SIGNATURE_MIME_TYPE,
} from "@/types/personnel-signature";

const SIGNED_URL_TTL_SECONDS = 300;

export class PersonnelSignatureAccessError extends Error {
  constructor(message = "Signature access denied.") {
    super(message);
    this.name = "PersonnelSignatureAccessError";
  }
}

export class PersonnelSignatureCertificationError extends Error {
  constructor(message = CERTIFICATION_REQUIRED_MESSAGE) {
    super(message);
    this.name = "PersonnelSignatureCertificationError";
  }
}

export class PersonnelSignatureValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PersonnelSignatureValidationError";
  }
}

async function requireSignatureEligiblePersonnel() {
  const personnel = await getAuthenticatedPersonnel();

  if (!personnel || !isSignatureEligibleRole(personnel.role)) {
    throw new PersonnelSignatureAccessError();
  }

  return personnel;
}

async function removeStorageObjects(paths: string[]) {
  if (paths.length === 0) {
    return;
  }

  const supabase = await createClient();
  await supabase.storage.from(PERSONNEL_SIGNATURE_BUCKET).remove(paths);
}

async function finalSignatureExists(finalPath: string): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(PERSONNEL_SIGNATURE_BUCKET)
    .download(finalPath);

  return !error && Boolean(data);
}

async function restoreFinalSignatureFromBackup(
  backupPath: string,
  finalPath: string,
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.storage
    .from(PERSONNEL_SIGNATURE_BUCKET)
    .copy(backupPath, finalPath);

  if (error) {
    throw new Error(
      `Unable to restore the previous signature after a failed replacement: ${error.message}`,
    );
  }
}

export async function getOwnPersonnelSignatureServer(): Promise<PersonnelSignatureRecord | null> {
  const personnel = await requireSignatureEligiblePersonnel();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("personnel_signatures")
    .select("*")
    .eq("personnel_id", personnel.id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ? mapPersonnelSignatureRow(data as PersonnelSignatureRow) : null;
}

export async function createOwnPersonnelSignaturePreviewUrl(): Promise<string> {
  const personnel = await requireSignatureEligiblePersonnel();
  const storagePath = getPersonnelSignatureStoragePath(personnel.id);
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(PERSONNEL_SIGNATURE_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    throw new Error(error?.message ?? "Unable to create signature preview URL.");
  }

  return data.signedUrl;
}

export async function saveOwnPersonnelSignature(input: {
  pngBytes: Uint8Array;
  originalFilename?: string | null;
  certificationConfirmed: boolean;
}): Promise<PersonnelSignatureRecord> {
  if (input.certificationConfirmed !== true) {
    throw new PersonnelSignatureCertificationError();
  }

  const verified = verifyPngSignatureBytes(input.pngBytes);
  if ("error" in verified) {
    throw new PersonnelSignatureValidationError(verified.error);
  }

  const personnel = await requireSignatureEligiblePersonnel();
  const supabase = await createClient();
  const finalPath = getPersonnelSignatureStoragePath(personnel.id);
  const pendingId = randomUUID();
  const backupId = randomUUID();
  const pendingPath = getPersonnelSignaturePendingPath(personnel.id, pendingId);
  const backupPath = getPersonnelSignatureBackupPath(personnel.id, backupId);
  const cleanupPaths: string[] = [];
  let backupCreated = false;
  let pendingUploaded = false;
  let finalPromoted = false;
  const hadExistingFinal = await finalSignatureExists(finalPath);

  try {
    if (hadExistingFinal) {
      const { error: backupError } = await supabase.storage
        .from(PERSONNEL_SIGNATURE_BUCKET)
        .copy(finalPath, backupPath);

      if (backupError) {
        throw new Error(
          `Unable to back up the current signature before replacement: ${backupError.message}`,
        );
      }

      backupCreated = true;
      cleanupPaths.push(backupPath);
    }

    const { error: pendingUploadError } = await supabase.storage
      .from(PERSONNEL_SIGNATURE_BUCKET)
      .upload(pendingPath, input.pngBytes, {
        contentType: PERSONNEL_SIGNATURE_MIME_TYPE,
        upsert: false,
      });

    if (pendingUploadError) {
      throw new Error(pendingUploadError.message);
    }

    pendingUploaded = true;
    cleanupPaths.push(pendingPath);

    const { data: pendingObject, error: pendingDownloadError } =
      await supabase.storage.from(PERSONNEL_SIGNATURE_BUCKET).download(pendingPath);

    if (pendingDownloadError || !pendingObject) {
      throw new Error(
        pendingDownloadError?.message ??
          "Unable to confirm the staged signature upload.",
      );
    }

    const { error: promoteError } = await supabase.storage
      .from(PERSONNEL_SIGNATURE_BUCKET)
      .upload(finalPath, pendingObject, {
        contentType: PERSONNEL_SIGNATURE_MIME_TYPE,
        upsert: true,
      });

    if (promoteError) {
      throw new Error(
        `Unable to promote the staged signature: ${promoteError.message}`,
      );
    }

    finalPromoted = true;

    const { data, error } = await supabase
      .from("personnel_signatures")
      .upsert(
        {
          personnel_id: personnel.id,
          storage_bucket: PERSONNEL_SIGNATURE_BUCKET,
          storage_path: finalPath,
          original_filename: sanitizeOriginalFilename(input.originalFilename) ??
            "signature.png",
          mime_type: verified.mimeType,
          file_size_bytes: verified.fileSizeBytes,
          image_width: verified.imageWidth,
          image_height: verified.imageHeight,
          certification_confirmed: true,
        },
        { onConflict: "personnel_id" },
      )
      .select("*")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    await removeStorageObjects(cleanupPaths);

    return mapPersonnelSignatureRow(data as PersonnelSignatureRow);
  } catch (error) {
    if (finalPromoted && backupCreated) {
      try {
        await restoreFinalSignatureFromBackup(backupPath, finalPath);
      } catch (restoreError) {
        throw new Error(
          restoreError instanceof Error
            ? restoreError.message
            : "Unable to restore the previous signature after a failed replacement.",
        );
      }
    } else if (finalPromoted && !hadExistingFinal) {
      await removeStorageObjects([finalPath]);
    }

    if (pendingUploaded) {
      await removeStorageObjects([pendingPath]);
    }

    if (backupCreated) {
      await removeStorageObjects([backupPath]);
    }

    throw error instanceof Error
      ? error
      : new Error("Unable to save the personnel signature.");
  }
}

export async function deleteOwnPersonnelSignature(): Promise<void> {
  const personnel = await requireSignatureEligiblePersonnel();
  const supabase = await createClient();
  const storagePath = getPersonnelSignatureStoragePath(personnel.id);

  const { error: storageError } = await supabase.storage
    .from(PERSONNEL_SIGNATURE_BUCKET)
    .remove([storagePath]);

  if (
    storageError &&
    !isStorageObjectNotFoundError(storageError.message ?? "")
  ) {
    throw new Error(
      `Unable to delete the signature image: ${storageError.message}`,
    );
  }

  const { error: metadataError } = await supabase
    .from("personnel_signatures")
    .delete()
    .eq("personnel_id", personnel.id);

  if (metadataError) {
    throw new Error(
      `Unable to delete signature metadata: ${metadataError.message}`,
    );
  }
}
