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

const PNG_INVALID_STRUCTURE_MESSAGE =
  "Signature file is not a valid PNG image.";

export interface VerifiedPngSignature {
  fileSizeBytes: number;
  imageWidth: number;
  imageHeight: number;
  mimeType: typeof PERSONNEL_SIGNATURE_MIME_TYPE;
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset]! << 24) |
      (bytes[offset + 1]! << 16) |
      (bytes[offset + 2]! << 8) |
      bytes[offset + 3]!) >>>
    0
  );
}

export function computePngChunkCrc(type: string, data: Uint8Array): number {
  const crcInput = new Uint8Array(4 + data.length);
  crcInput[0] = type.charCodeAt(0);
  crcInput[1] = type.charCodeAt(1);
  crcInput[2] = type.charCodeAt(2);
  crcInput[3] = type.charCodeAt(3);
  crcInput.set(data, 4);
  return crc32(crcInput);
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;

  for (let index = 0; index < data.length; index += 1) {
    crc ^= data[index]!;
    for (let bit = 0; bit < 8; bit += 1) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function validateImageDimensions(
  imageWidth: number,
  imageHeight: number,
): VerifiedPngSignature | { error: string } {
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
    fileSizeBytes: 0,
    imageWidth,
    imageHeight,
    mimeType: PERSONNEL_SIGNATURE_MIME_TYPE,
  };
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
    return { error: PNG_INVALID_STRUCTURE_MESSAGE };
  }

  let offset = PNG_FILE_SIGNATURE.length;
  let imageWidth = 0;
  let imageHeight = 0;
  let idatCount = 0;
  let iendCount = 0;
  let chunkIndex = 0;
  let finished = false;

  while (offset <= bytes.byteLength) {
    if (finished) {
      if (offset !== bytes.byteLength) {
        return { error: PNG_INVALID_STRUCTURE_MESSAGE };
      }

      break;
    }

    if (offset + 12 > bytes.byteLength) {
      return { error: PNG_INVALID_STRUCTURE_MESSAGE };
    }

    const chunkLength = readUint32BE(bytes, offset);
    const remainingAfterHeader = bytes.byteLength - offset - 12;

    if (chunkLength > remainingAfterHeader) {
      return { error: PNG_INVALID_STRUCTURE_MESSAGE };
    }

    const chunkType = String.fromCharCode(
      bytes[offset + 4]!,
      bytes[offset + 5]!,
      bytes[offset + 6]!,
      bytes[offset + 7]!,
    );
    const chunkDataStart = offset + 8;
    const chunkDataEnd = chunkDataStart + chunkLength;
    const crcOffset = chunkDataEnd;

    if (crcOffset + 4 > bytes.byteLength) {
      return { error: PNG_INVALID_STRUCTURE_MESSAGE };
    }

    const declaredCrc = readUint32BE(bytes, crcOffset);
    const crcInput = bytes.subarray(offset + 4, crcOffset);
    const computedCrc = crc32(crcInput);

    if (computedCrc !== declaredCrc) {
      return { error: PNG_INVALID_STRUCTURE_MESSAGE };
    }

    if (chunkIndex === 0) {
      if (chunkType !== "IHDR" || chunkLength !== 13) {
        return { error: PNG_INVALID_STRUCTURE_MESSAGE };
      }

      const chunkData = bytes.subarray(chunkDataStart, chunkDataEnd);
      imageWidth = readUint32BE(chunkData, 0);
      imageHeight = readUint32BE(chunkData, 4);

      if (
        imageWidth <= 0 ||
        imageHeight <= 0 ||
        !Number.isInteger(imageWidth) ||
        !Number.isInteger(imageHeight)
      ) {
        return { error: PNG_INVALID_STRUCTURE_MESSAGE };
      }
    }

    if (chunkType === "IDAT") {
      idatCount += 1;
    }

    if (chunkType === "IEND") {
      iendCount += 1;

      if (chunkLength !== 0) {
        return { error: PNG_INVALID_STRUCTURE_MESSAGE };
      }

      finished = true;
    }

    offset = crcOffset + 4;
    chunkIndex += 1;
  }

  if (chunkIndex === 0 || idatCount < 1 || iendCount !== 1) {
    return { error: PNG_INVALID_STRUCTURE_MESSAGE };
  }

  const dimensionResult = validateImageDimensions(imageWidth, imageHeight);
  if ("error" in dimensionResult) {
    return dimensionResult;
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
