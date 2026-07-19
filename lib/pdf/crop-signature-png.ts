import { deflateSync, inflateSync } from "node:zlib";

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset]! << 24) |
      (bytes[offset + 1]! << 16) |
      (bytes[offset + 2]! << 8) |
      bytes[offset + 3]!) >>>
    0
  );
}

function paethPredictor(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) {
    return a;
  }
  if (pb <= pc) {
    return b;
  }
  return c;
}

function decodeFilteredScanlines(
  filtered: Uint8Array,
  width: number,
  height: number,
  bytesPerPixel: number,
): Uint8Array {
  const stride = width * bytesPerPixel;
  const pixels = new Uint8Array(stride * height);
  let sourceOffset = 0;

  for (let row = 0; row < height; row += 1) {
    const filterType = filtered[sourceOffset]!;
    sourceOffset += 1;
    const rowStart = row * stride;
    const previousRowStart = rowStart - stride;

    for (let column = 0; column < stride; column += 1) {
      const raw = filtered[sourceOffset]!;
      sourceOffset += 1;
      const left = column >= bytesPerPixel ? pixels[rowStart + column - bytesPerPixel]! : 0;
      const up = row > 0 ? pixels[previousRowStart + column]! : 0;
      const upLeft =
        row > 0 && column >= bytesPerPixel
          ? pixels[previousRowStart + column - bytesPerPixel]!
          : 0;

      let value = raw;
      switch (filterType) {
        case 1:
          value = (raw + left) & 0xff;
          break;
        case 2:
          value = (raw + up) & 0xff;
          break;
        case 3:
          value = (raw + Math.floor((left + up) / 2)) & 0xff;
          break;
        case 4:
          value = (raw + paethPredictor(left, up, upLeft)) & 0xff;
          break;
        default:
          value = raw & 0xff;
          break;
      }

      pixels[rowStart + column] = value;
    }
  }

  return pixels;
}

function computePngChunkCrc(type: string, data: Uint8Array): number {
  const crcInput = new Uint8Array(4 + data.length);
  crcInput[0] = type.charCodeAt(0);
  crcInput[1] = type.charCodeAt(1);
  crcInput[2] = type.charCodeAt(2);
  crcInput[3] = type.charCodeAt(3);
  crcInput.set(data, 4);

  let crc = 0xffffffff;
  for (let index = 0; index < crcInput.length; index += 1) {
    crc ^= crcInput[index]!;
    for (let bit = 0; bit < 8; bit += 1) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function appendPngChunk(chunks: number[], type: string, data: Uint8Array): void {
  const lengthBytes = new Uint8Array(4);
  new DataView(lengthBytes.buffer).setUint32(0, data.length, false);
  const typeBytes = Uint8Array.from(type, (char) => char.charCodeAt(0));
  const crcBytes = new Uint8Array(4);
  new DataView(crcBytes.buffer).setUint32(0, computePngChunkCrc(type, data), false);
  chunks.push(...lengthBytes, ...typeBytes, ...data, ...crcBytes);
}

function encodePngRgba(
  width: number,
  height: number,
  rgba: Uint8Array,
): Uint8Array {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const chunks: number[] = [...signature];

  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, width, false);
  ihdrView.setUint32(4, height, false);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  appendPngChunk(chunks, "IHDR", ihdr);

  const stride = width * 4;
  const filtered = new Uint8Array((stride + 1) * height);
  for (let row = 0; row < height; row += 1) {
    const rowOffset = row * (stride + 1);
    filtered[rowOffset] = 0;
    filtered.set(rgba.subarray(row * stride, row * stride + stride), rowOffset + 1);
  }

  const compressed = deflateSync(filtered);

  appendPngChunk(chunks, "IDAT", compressed);
  appendPngChunk(chunks, "IEND", new Uint8Array(0));
  return Uint8Array.from(chunks);
}

function decodePngRgba(bytes: Uint8Array): {
  width: number;
  height: number;
  rgba: Uint8Array;
} | null {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let index = 0; index < signature.length; index += 1) {
    if (bytes[index] !== signature[index]) {
      return null;
    }
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  const idatChunks: Uint8Array[] = [];

  while (offset + 8 <= bytes.length) {
    const length = readUint32BE(bytes, offset);
    const type = String.fromCharCode(
      bytes[offset + 4]!,
      bytes[offset + 5]!,
      bytes[offset + 6]!,
      bytes[offset + 7]!,
    );
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;

    if (type === "IHDR") {
      width = readUint32BE(data, 0);
      height = readUint32BE(data, 4);
      colorType = data[9]!;
    } else if (type === "IDAT") {
      idatChunks.push(data);
    } else if (type === "IEND") {
      break;
    }
  }

  if (!width || !height || idatChunks.length === 0) {
    return null;
  }

  const compressedLength = idatChunks.reduce((total, chunk) => total + chunk.length, 0);
  const compressed = new Uint8Array(compressedLength);
  let writeOffset = 0;
  for (const chunk of idatChunks) {
    compressed.set(chunk, writeOffset);
    writeOffset += chunk.length;
  }

  let filtered: Uint8Array;
  try {
    filtered = inflateSync(compressed);
  } catch {
    return null;
  }
  const bytesPerPixel = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  if (!bytesPerPixel) {
    return null;
  }

  const raw = decodeFilteredScanlines(filtered, width, height, bytesPerPixel);
  const rgba = new Uint8Array(width * height * 4);

  for (let index = 0; index < width * height; index += 1) {
    if (bytesPerPixel === 4) {
      rgba.set(raw.subarray(index * 4, index * 4 + 4), index * 4);
    } else {
      rgba[index * 4] = raw[index * 3]!;
      rgba[index * 4 + 1] = raw[index * 3 + 1]!;
      rgba[index * 4 + 2] = raw[index * 3 + 2]!;
      rgba[index * 4 + 3] = 255;
    }
  }

  return { width, height, rgba };
}

/** Removes transparent margins so handwritten signatures scale to the target box. */
export function cropSignaturePngTransparentMargins(pngBytes: Uint8Array): Uint8Array {
  try {
    const decoded = decodePngRgba(pngBytes);
    if (!decoded) {
      return pngBytes;
    }

    const { width, height, rgba } = decoded;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const alpha = rgba[(y * width + x) * 4 + 3]!;
        if (alpha > 16) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
    }

    if (maxX < minX || maxY < minY) {
      return pngBytes;
    }

    const croppedWidth = maxX - minX + 1;
    const croppedHeight = maxY - minY + 1;
    const cropped = new Uint8Array(croppedWidth * croppedHeight * 4);

    for (let y = 0; y < croppedHeight; y += 1) {
      for (let x = 0; x < croppedWidth; x += 1) {
        const sourceIndex = ((y + minY) * width + (x + minX)) * 4;
        const targetIndex = (y * croppedWidth + x) * 4;
        cropped.set(rgba.subarray(sourceIndex, sourceIndex + 4), targetIndex);
      }
    }

    if (croppedWidth === width && croppedHeight === height) {
      return pngBytes;
    }

    return encodePngRgba(croppedWidth, croppedHeight, cropped);
  } catch {
    return pngBytes;
  }
}
