import {
  PERSONNEL_SIGNATURE_MAX_BYTES,
  PERSONNEL_SIGNATURE_MAX_HEIGHT,
  PERSONNEL_SIGNATURE_MAX_WIDTH,
  PERSONNEL_SIGNATURE_MIME_TYPE,
  PERSONNEL_SIGNATURE_MIN_HEIGHT,
  PERSONNEL_SIGNATURE_MIN_WIDTH,
  type SignatureValidationResult,
} from "@/types/personnel-signature";

const REJECTED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/svg+xml",
  "image/gif",
  "application/pdf",
]);

function validateDimensions(
  width: number,
  height: number,
): SignatureValidationResult {
  if (width < PERSONNEL_SIGNATURE_MIN_WIDTH) {
    return {
      valid: false,
      error: `Signature width must be at least ${PERSONNEL_SIGNATURE_MIN_WIDTH}px.`,
    };
  }

  if (height < PERSONNEL_SIGNATURE_MIN_HEIGHT) {
    return {
      valid: false,
      error: `Signature height must be at least ${PERSONNEL_SIGNATURE_MIN_HEIGHT}px.`,
    };
  }

  if (width > PERSONNEL_SIGNATURE_MAX_WIDTH) {
    return {
      valid: false,
      error: `Signature width must be ${PERSONNEL_SIGNATURE_MAX_WIDTH}px or less.`,
    };
  }

  if (height > PERSONNEL_SIGNATURE_MAX_HEIGHT) {
    return {
      valid: false,
      error: `Signature height must be ${PERSONNEL_SIGNATURE_MAX_HEIGHT}px or less.`,
    };
  }

  return { valid: true, width, height };
}

async function readImageDimensions(
  blob: Blob,
): Promise<{ width: number; height: number }> {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(blob);
    const dimensions = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return dimensions;
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };

    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Unable to read signature image dimensions."));
    };

    image.src = url;
  });
}

export async function validateSignatureBlob(
  blob: Blob,
  originalFilename?: string | null,
): Promise<SignatureValidationResult> {
  if (!blob || blob.size === 0) {
    return { valid: false, error: "Signature file cannot be empty." };
  }

  if (blob.size > PERSONNEL_SIGNATURE_MAX_BYTES) {
    return {
      valid: false,
      error: "Signature file must be 1 MB or smaller.",
    };
  }

  if (blob.type !== PERSONNEL_SIGNATURE_MIME_TYPE) {
    if (REJECTED_MIME_TYPES.has(blob.type)) {
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

  if (originalFilename) {
    const lowerName = originalFilename.toLowerCase();
    if (!lowerName.endsWith(".png")) {
      return {
        valid: false,
        error: "Signature uploads must use a .png file extension.",
      };
    }
  }

  try {
    const { width, height } = await readImageDimensions(blob);
    const dimensionResult = validateDimensions(width, height);
    if (!dimensionResult.valid) {
      return dimensionResult;
    }

    return { valid: true, width, height };
  } catch {
    return {
      valid: false,
      error: "Unable to validate the signature image.",
    };
  }
}

export async function validateSignatureFile(
  file: File,
): Promise<SignatureValidationResult> {
  return validateSignatureBlob(file, file.name);
}
