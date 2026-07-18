import { computePngChunkCrc } from "@/lib/personnel-signature-png";

function writeUint32BE(view: DataView, offset: number, value: number) {
  view.setUint32(offset, value, false);
}

function appendChunk(chunks: number[], type: string, data: Uint8Array) {
  const typeBytes = Uint8Array.from(type, (char) => char.charCodeAt(0));
  const crc = computePngChunkCrc(type, data);

  const lengthBytes = new Uint8Array(4);
  new DataView(lengthBytes.buffer).setUint32(0, data.length, false);

  const crcBytes = new Uint8Array(4);
  new DataView(crcBytes.buffer).setUint32(0, crc, false);

  chunks.push(...lengthBytes, ...typeBytes, ...data, ...crcBytes);
}

function buildIhdrData(width: number, height: number): Uint8Array {
  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  writeUint32BE(ihdrView, 0, width);
  writeUint32BE(ihdrView, 4, height);
  ihdr[8] = 8;
  ihdr[9] = 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return ihdr;
}

export function buildTestPng(width: number, height: number): Uint8Array {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const chunks: number[] = [...signature];
  appendChunk(chunks, "IHDR", buildIhdrData(width, height));
  appendChunk(chunks, "IDAT", new Uint8Array([0x78, 0x9c, 0x62, 0x00, 0x00]));
  appendChunk(chunks, "IEND", new Uint8Array(0));
  return Uint8Array.from(chunks);
}

/** Valid personnel-signature-sized PNG for snapshot verification tests. */
export const VALID_SIGNATURE_TEST_PNG = buildTestPng(150, 50);
