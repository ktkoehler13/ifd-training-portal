import {
  PERSONNEL_SIGNATURE_MAX_BYTES,
  PERSONNEL_SIGNATURE_MIME_TYPE,
  type SignatureValidationResult,
} from "@/types/personnel-signature";

const REJECTED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/svg+xml",
  "image/gif",
  "application/pdf",
]);

async function canDecodeSignatureImage(file: Blob): Promise<boolean> {
  try {
    if (typeof createImageBitmap === "function") {
      const bitmap = await createImageBitmap(file);
      bitmap.close();
      return true;
    }

    return await new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const image = new Image();

      image.onload = () => {
        URL.revokeObjectURL(url);
        resolve(true);
      };

      image.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(false);
      };

      image.src = url;
    });
  } catch {
    return false;
  }
}

export async function validateSignatureFileForUpload(
  file: File,
): Promise<SignatureValidationResult> {
  if (!file || file.size === 0) {
    return { valid: false, error: "Signature file cannot be empty." };
  }

  if (file.size > PERSONNEL_SIGNATURE_MAX_BYTES * 4) {
    return {
      valid: false,
      error: "Signature file is too large to process. Try a smaller PNG.",
    };
  }

  if (file.type !== PERSONNEL_SIGNATURE_MIME_TYPE) {
    if (REJECTED_MIME_TYPES.has(file.type)) {
      return {
        valid: false,
        error: "Only PNG signature files are supported.",
      };
    }

    return {
      valid: false,
      error: "Signature file must be a PNG image.",
    };
  }

  if (!file.name.toLowerCase().endsWith(".png")) {
    return {
      valid: false,
      error: "Signature uploads must use a .png file extension.",
    };
  }

  const decodable = await canDecodeSignatureImage(file);
  if (!decodable) {
    return {
      valid: false,
      error: "Unable to read the uploaded signature image.",
    };
  }

  return { valid: true };
}
