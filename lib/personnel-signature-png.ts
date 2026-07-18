import {
  PERSONNEL_SIGNATURE_MAX_BYTES,
  PERSONNEL_SIGNATURE_MAX_HEIGHT,
  PERSONNEL_SIGNATURE_MAX_WIDTH,
  PERSONNEL_SIGNATURE_MIME_TYPE,
  PERSONNEL_SIGNATURE_MIN_HEIGHT,
  PERSONNEL_SIGNATURE_MIN_WIDTH,
} from "@/types/personnel-signature";

const PNG_FILE_SIGNATURE = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

export interface VerifiedPngSignature {
  fileSizeBytes: number;
  imageWidth: number;
  imageHeight: number;
  mimeType: typeof PERSONNEL_SIGNATURE_MIME_TYPE;
}

export function verifyPngSignatureBytes(
  bytes: Uint8Array,
): VerifiedPngSignature | { error: string } {
  if (!bytes || bytes.byteLength === 0) {
    return { error: "Signature file cannot be empty." };
  }

  if (bytes.byteLength > PERSONNEL_SIGNATURE_MAX_BYTES) {
    return { error: "Signature file must be 1 MB or smaller." };
  }

  for (let index = 0; index < PNG_FILE_SIGNATURE.length; index += 1) {
    if (bytes[index] !== PNG_FILE_SIGNATURE[index]) {
      return { error: "Signature file must be a PNG image." };
    }
  }

  if (bytes.byteLength < 33) {
    return { error: "Signature file is not a valid PNG image." };
  }

  const ihdrLength =
    (bytes[8]! << 24) |
    (bytes[9]! << 16) |
    (bytes[10]! << 8) |
    bytes[11]!;

  if (ihdrLength !== 13) {
    return { error: "Signature file is not a valid PNG image." };
  }

  const chunkType = String.fromCharCode(
    bytes[12]!,
    bytes[13]!,
    bytes[14]!,
    bytes[15]!,
  );

  if (chunkType !== "IHDR") {
    return { error: "Signature file is not a valid PNG image." };
  }

  const imageWidth =
    (bytes[16]! << 24) |
    (bytes[17]! << 16) |
    (bytes[18]! << 8) |
    bytes[19]!;
  const imageHeight =
    (bytes[20]! << 24) |
    (bytes[21]! << 16) |
    (bytes[22]! << 8) |
    bytes[23]!;

  if (
    imageWidth <= 0 ||
    imageHeight <= 0 ||
    !Number.isInteger(imageWidth) ||
    !Number.isInteger(imageHeight)
  ) {
    return { error: "Signature file is not a valid PNG image." };
  }

  const minimumIhdrEnd = 8 + 4 + 4 + 13 + 4;
  if (bytes.byteLength < minimumIhdrEnd) {
    return { error: "Signature file is not a valid PNG image." };
  }

  if (imageWidth < PERSONNEL_SIGNATURE_MIN_WIDTH) {
    return {
      error: `Signature width must be at least ${PERSONNEL_SIGNATURE_MIN_WIDTH}px.`,
    };
  }

  if (imageHeight < PERSONNEL_SIGNATURE_MIN_HEIGHT) {
    return {
      error: `Signature height must be at least ${PERSONNEL_SIGNATURE_MIN_HEIGHT}px.`,
    };
  }

  if (imageWidth > PERSONNEL_SIGNATURE_MAX_WIDTH) {
    return {
      error: `Signature width must be ${PERSONNEL_SIGNATURE_MAX_WIDTH}px or less.`,
    };
  }

  if (imageHeight > PERSONNEL_SIGNATURE_MAX_HEIGHT) {
    return {
      error: `Signature height must be ${PERSONNEL_SIGNATURE_MAX_HEIGHT}px or less.`,
    };
  }

  return {
    fileSizeBytes: bytes.byteLength,
    imageWidth,
    imageHeight,
    mimeType: PERSONNEL_SIGNATURE_MIME_TYPE,
  };
}

export const CERTIFICATION_REQUIRED_MESSAGE =
  "Signature certification acknowledgment is required.";

export function parseCertificationConfirmedFormValue(
  value: FormDataEntryValue | null,
): boolean {
  return value === "true";
}

export function sanitizeOriginalFilename(
  value: FormDataEntryValue | string | null | undefined,
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const basename = value.split(/[/\\]/).pop()?.trim() ?? "";
  const sanitized = basename
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[^\w.\-() ]+/g, "")
    .slice(0, 255);

  return sanitized.length > 0 ? sanitized : null;
}

export function getPersonnelSignaturePendingPath(
  personnelId: string,
  pendingId: string,
): string {
  return `${personnelId}/pending/${pendingId}.png`;
}

export function getPersonnelSignatureBackupPath(
  personnelId: string,
  backupId: string,
): string {
  return `${personnelId}/pending/backup-${backupId}.png`;
}

export function isStorageObjectNotFoundError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("not found") ||
    normalized.includes("object not found") ||
    normalized.includes("does not exist")
  );
}
