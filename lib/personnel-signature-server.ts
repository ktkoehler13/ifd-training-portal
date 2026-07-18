import { getAuthenticatedPersonnel } from "@/lib/auth/personnel";
import { isSignatureEligibleRole } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import {
  getPersonnelSignatureStoragePath,
  mapPersonnelSignatureRow,
} from "@/lib/personnel-signature";
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

async function requireSignatureEligiblePersonnel() {
  const personnel = await getAuthenticatedPersonnel();

  if (!personnel || !isSignatureEligibleRole(personnel.role)) {
    throw new PersonnelSignatureAccessError();
  }

  return personnel;
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

export async function createOwnPersonnelSignaturePreviewUrl(
  storagePath: string,
): Promise<string> {
  await requireSignatureEligiblePersonnel();
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(PERSONNEL_SIGNATURE_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    throw new Error(error?.message ?? "Unable to create signature preview URL.");
  }

  return data.signedUrl;
}

export async function saveOwnPersonnelSignatureMetadata(input: {
  fileSizeBytes: number;
  imageWidth: number | null;
  imageHeight: number | null;
  originalFilename?: string | null;
}): Promise<PersonnelSignatureRecord> {
  const personnel = await requireSignatureEligiblePersonnel();
  const supabase = await createClient();
  const storagePath = getPersonnelSignatureStoragePath(personnel.id);

  const { data, error } = await supabase
    .from("personnel_signatures")
    .upsert(
      {
        personnel_id: personnel.id,
        storage_bucket: PERSONNEL_SIGNATURE_BUCKET,
        storage_path: storagePath,
        original_filename: input.originalFilename ?? "signature.png",
        mime_type: PERSONNEL_SIGNATURE_MIME_TYPE,
        file_size_bytes: input.fileSizeBytes,
        image_width: input.imageWidth,
        image_height: input.imageHeight,
        certification_confirmed: true,
      },
      { onConflict: "personnel_id" },
    )
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return mapPersonnelSignatureRow(data as PersonnelSignatureRow);
}

export async function deleteOwnPersonnelSignature(): Promise<void> {
  const personnel = await requireSignatureEligiblePersonnel();
  const supabase = await createClient();
  const storagePath = getPersonnelSignatureStoragePath(personnel.id);

  const { error: storageError } = await supabase.storage
    .from(PERSONNEL_SIGNATURE_BUCKET)
    .remove([storagePath]);

  if (storageError) {
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
      `Signature image deleted, but metadata removal failed: ${metadataError.message}`,
    );
  }
}
