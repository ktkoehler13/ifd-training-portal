import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CERTIFICATION_REQUIRED_MESSAGE,
  getPersonnelSignatureBackupPath,
  getPersonnelSignaturePendingPath,
  parseCertificationConfirmedFormValue,
  sanitizeOriginalFilename,
  verifyPngSignatureBytes,
} from "./personnel-signature-png";
import {
  PERSONNEL_SIGNATURE_MAX_BYTES,
  PERSONNEL_SIGNATURE_MIN_HEIGHT,
  PERSONNEL_SIGNATURE_MIN_WIDTH,
} from "@/types/personnel-signature";

function writeUint32BE(view: DataView, offset: number, value: number) {
  view.setUint32(offset, value, false);
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

function appendChunk(chunks: number[], type: string, data: Uint8Array) {
  const typeBytes = Uint8Array.from(type, (char) => char.charCodeAt(0));
  const crcInput = new Uint8Array(typeBytes.length + data.length);
  crcInput.set(typeBytes, 0);
  crcInput.set(data, typeBytes.length);
  const crc = crc32(crcInput);

  writeUint32BE(new DataView(new ArrayBuffer(4)), 0, data.length);
  const lengthBytes = new Uint8Array(4);
  new DataView(lengthBytes.buffer).setUint32(0, data.length, false);

  const crcBytes = new Uint8Array(4);
  new DataView(crcBytes.buffer).setUint32(0, crc, false);

  chunks.push(
    ...lengthBytes,
    ...typeBytes,
    ...data,
    ...crcBytes,
  );
}

function buildTestPng(width: number, height: number): Uint8Array {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  writeUint32BE(ihdrView, 0, width);
  writeUint32BE(ihdrView, 4, height);
  ihdr[8] = 8;
  ihdr[9] = 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const chunks: number[] = [...signature];
  appendChunk(chunks, "IHDR", ihdr);
  appendChunk(chunks, "IEND", new Uint8Array(0));

  return Uint8Array.from(chunks);
}

describe("verifyPngSignatureBytes", () => {
  it("accepts a valid PNG within dimension limits", () => {
    const png = buildTestPng(PERSONNEL_SIGNATURE_MIN_WIDTH, PERSONNEL_SIGNATURE_MIN_HEIGHT);
    const result = verifyPngSignatureBytes(png);
    assert.equal("error" in result, false);

    if ("error" in result) {
      return;
    }

    assert.equal(result.mimeType, "image/png");
    assert.equal(result.imageWidth, PERSONNEL_SIGNATURE_MIN_WIDTH);
    assert.equal(result.imageHeight, PERSONNEL_SIGNATURE_MIN_HEIGHT);
    assert.equal(result.fileSizeBytes, png.byteLength);
  });

  it("rejects a renamed JPEG with image/png content type semantics", () => {
    const jpeg = new Uint8Array(40);
    jpeg.set([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10], 0);
    const result = verifyPngSignatureBytes(jpeg);
    assert.deepEqual(result, {
      error: "Signature file must be a PNG image.",
    });
  });

  it("rejects malformed PNG files", () => {
    const malformed = Uint8Array.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    ]);
    const result = verifyPngSignatureBytes(malformed);
    assert.equal("error" in result, true);
  });

  it("rejects PNG files over 1 MB", () => {
    const png = buildTestPng(PERSONNEL_SIGNATURE_MIN_WIDTH, PERSONNEL_SIGNATURE_MIN_HEIGHT);
    const oversized = new Uint8Array(PERSONNEL_SIGNATURE_MAX_BYTES + 1);
    oversized.set(png, 0);
    const result = verifyPngSignatureBytes(oversized);
    assert.deepEqual(result, {
      error: "Signature file must be 1 MB or smaller.",
    });
  });

  it("rejects invalid dimensions from IHDR", () => {
    const png = buildTestPng(PERSONNEL_SIGNATURE_MIN_WIDTH - 1, PERSONNEL_SIGNATURE_MIN_HEIGHT);
    const result = verifyPngSignatureBytes(png);
    assert.equal("error" in result, true);
  });
});

describe("parseCertificationConfirmedFormValue", () => {
  it("accepts only literal true", () => {
    assert.equal(parseCertificationConfirmedFormValue("true"), true);
  });

  it("rejects missing, false, and invalid certification values", () => {
    assert.equal(parseCertificationConfirmedFormValue(null), false);
    assert.equal(parseCertificationConfirmedFormValue("false"), false);
    assert.equal(parseCertificationConfirmedFormValue("on"), false);
    assert.equal(parseCertificationConfirmedFormValue("1"), false);
  });
});

describe("sanitizeOriginalFilename", () => {
  it("removes path traversal segments and unsafe characters", () => {
    assert.equal(
      sanitizeOriginalFilename("../../etc/passwd.png"),
      "passwd.png",
    );
    assert.equal(
      sanitizeOriginalFilename("C:\\Users\\signatures\\mine.png"),
      "mine.png",
    );
  });
});

describe("pending storage paths", () => {
  it("builds owner-scoped pending and backup paths", () => {
    const personnelId = "11111111-1111-1111-1111-111111111111";
    const pendingId = "22222222-2222-2222-2222-222222222222";
    assert.equal(
      getPersonnelSignaturePendingPath(personnelId, pendingId),
      `${personnelId}/pending/${pendingId}.png`,
    );
    assert.equal(
      getPersonnelSignatureBackupPath(personnelId, pendingId),
      `${personnelId}/pending/backup-${pendingId}.png`,
    );
  });
});

describe("certification message", () => {
  it("uses the required server rejection message", () => {
    assert.equal(
      CERTIFICATION_REQUIRED_MESSAGE,
      "Signature certification acknowledgment is required.",
    );
  });
});

describe("service role key exposure", () => {
  it("does not reference service-role keys in client modules", async () => {
    const clientModules = [
      "../lib/personnel-signature.ts",
      "../components/signature/MySignatureView.tsx",
    ];

    for (const modulePath of clientModules) {
      const moduleUrl = new URL(modulePath, import.meta.url);
      const source = await import("node:fs/promises").then((fs) =>
        fs.readFile(moduleUrl, "utf8"),
      );
      assert.equal(source.includes("SERVICE_ROLE"), false);
      assert.equal(source.includes("service_role"), false);
    }
  });
});
