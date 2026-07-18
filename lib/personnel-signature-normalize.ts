import {
  PERSONNEL_SIGNATURE_MAX_BYTES,
  PERSONNEL_SIGNATURE_MAX_HEIGHT,
  PERSONNEL_SIGNATURE_MAX_WIDTH,
  PERSONNEL_SIGNATURE_MIN_HEIGHT,
  PERSONNEL_SIGNATURE_MIN_WIDTH,
  PERSONNEL_SIGNATURE_MIME_TYPE,
} from "@/types/personnel-signature";

export const SIGNATURE_NORMALIZE_PADDING = 25;

export const SIGNATURE_NORMALIZE_USER_ERROR =
  "Your signature image could not be resized to the supported format. Try a simpler image or draw your signature instead.";

export interface SignatureScaleToFitResult {
  width: number;
  height: number;
  scale: number;
  scaledDown: boolean;
}

export interface SignatureOutputCanvasDimensions {
  width: number;
  height: number;
  contentWidth: number;
  contentHeight: number;
  trimmedWidth: number;
  trimmedHeight: number;
  scale: number;
  scaledDown: boolean;
  paddedToMinimum: boolean;
}

export interface SignatureNormalizationResult {
  blob: Blob;
  width: number;
  height: number;
  resized: boolean;
}

export interface TrimBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function calculateSignatureScaleToFit(
  width: number,
  height: number,
  maxWidth: number = PERSONNEL_SIGNATURE_MAX_WIDTH,
  maxHeight: number = PERSONNEL_SIGNATURE_MAX_HEIGHT,
): SignatureScaleToFitResult {
  if (width <= 0 || height <= 0) {
    return {
      width: 0,
      height: 0,
      scale: 1,
      scaledDown: false,
    };
  }

  const scale = Math.min(maxWidth / width, maxHeight / height, 1);
  const scaledDown = scale < 1;

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    scale,
    scaledDown,
  };
}

export function calculateSignatureOutputCanvasDimensions(
  trimmedWidth: number,
  trimmedHeight: number,
  options?: {
    padding?: number;
    minWidth?: number;
    minHeight?: number;
    maxWidth?: number;
    maxHeight?: number;
  },
): SignatureOutputCanvasDimensions {
  const padding = options?.padding ?? SIGNATURE_NORMALIZE_PADDING;
  const minWidth = options?.minWidth ?? PERSONNEL_SIGNATURE_MIN_WIDTH;
  const minHeight = options?.minHeight ?? PERSONNEL_SIGNATURE_MIN_HEIGHT;
  const maxWidth = options?.maxWidth ?? PERSONNEL_SIGNATURE_MAX_WIDTH;
  const maxHeight = options?.maxHeight ?? PERSONNEL_SIGNATURE_MAX_HEIGHT;

  const maxTrimmedWidth = Math.max(1, maxWidth - padding * 2);
  const maxTrimmedHeight = Math.max(1, maxHeight - padding * 2);
  const scaledTrimmed = calculateSignatureScaleToFit(
    trimmedWidth,
    trimmedHeight,
    maxTrimmedWidth,
    maxTrimmedHeight,
  );

  const contentWidth = scaledTrimmed.width + padding * 2;
  const contentHeight = scaledTrimmed.height + padding * 2;
  const paddedToMinimum =
    contentWidth < minWidth || contentHeight < minHeight;
  let width = Math.max(contentWidth, minWidth);
  let height = Math.max(contentHeight, minHeight);

  const overflowScale = Math.min(maxWidth / width, maxHeight / height, 1);
  const scale = scaledTrimmed.scale * overflowScale;
  const scaledDown = scale < 1;

  width = Math.max(1, Math.round(width * overflowScale));
  height = Math.max(1, Math.round(height * overflowScale));

  return {
    width,
    height,
    contentWidth: Math.round(contentWidth * overflowScale),
    contentHeight: Math.round(contentHeight * overflowScale),
    trimmedWidth: Math.max(1, Math.round(scaledTrimmed.width * overflowScale)),
    trimmedHeight: Math.max(
      1,
      Math.round(scaledTrimmed.height * overflowScale),
    ),
    scale,
    scaledDown,
    paddedToMinimum,
  };
}

export function findTrimBounds(
  width: number,
  height: number,
  data: Uint8ClampedArray,
): TrimBounds | null {
  let top = height;
  let left = width;
  let right = 0;
  let bottom = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const alpha = data[index + 3]!;
      const red = data[index]!;
      const green = data[index + 1]!;
      const blue = data[index + 2]!;
      const isStroke =
        alpha > 0 && !(red === 255 && green === 255 && blue === 255);

      if (isStroke) {
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
        left = Math.min(left, x);
        right = Math.max(right, x);
      }
    }
  }

  if (right < left || bottom < top) {
    return null;
  }

  return {
    left,
    top,
    width: right - left + 1,
    height: bottom - top + 1,
  };
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((value) => {
      if (!value) {
        reject(new Error(SIGNATURE_NORMALIZE_USER_ERROR));
        return;
      }

      resolve(value);
    }, PERSONNEL_SIGNATURE_MIME_TYPE);
  });
}

async function exportCanvasWithinSizeLimit(
  canvas: HTMLCanvasElement,
): Promise<Blob> {
  let blob = await canvasToBlob(canvas);

  if (blob.size <= PERSONNEL_SIGNATURE_MAX_BYTES) {
    return blob;
  }

  let scale = Math.sqrt(PERSONNEL_SIGNATURE_MAX_BYTES / blob.size) * 0.95;
  const workingCanvas = document.createElement("canvas");
  const context = workingCanvas.getContext("2d");

  if (!context) {
    throw new Error(SIGNATURE_NORMALIZE_USER_ERROR);
  }

  while (scale > 0.2) {
    workingCanvas.width = Math.max(1, Math.floor(canvas.width * scale));
    workingCanvas.height = Math.max(1, Math.floor(canvas.height * scale));
    context.clearRect(0, 0, workingCanvas.width, workingCanvas.height);
    context.drawImage(
      canvas,
      0,
      0,
      workingCanvas.width,
      workingCanvas.height,
    );

    blob = await canvasToBlob(workingCanvas);

    if (blob.size <= PERSONNEL_SIGNATURE_MAX_BYTES) {
      return blob;
    }

    scale *= 0.85;
  }

  throw new Error(SIGNATURE_NORMALIZE_USER_ERROR);
}

export function renderNormalizedSignatureCanvas(input: {
  source: CanvasImageSource;
  sourceWidth: number;
  sourceHeight: number;
  trimBounds: TrimBounds;
}): {
  canvas: HTMLCanvasElement;
  dimensions: SignatureOutputCanvasDimensions;
} {
  const output = calculateSignatureOutputCanvasDimensions(
    input.trimBounds.width,
    input.trimBounds.height,
  );
  const canvas = document.createElement("canvas");
  canvas.width = output.width;
  canvas.height = output.height;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error(SIGNATURE_NORMALIZE_USER_ERROR);
  }

  context.clearRect(0, 0, canvas.width, canvas.height);
  const drawX = Math.round((output.width - output.trimmedWidth) / 2);
  const drawY = Math.round((output.height - output.trimmedHeight) / 2);

  context.drawImage(
    input.source,
    input.trimBounds.left,
    input.trimBounds.top,
    input.trimBounds.width,
    input.trimBounds.height,
    drawX,
    drawY,
    output.trimmedWidth,
    output.trimmedHeight,
  );

  return { canvas, dimensions: output };
}

export async function normalizeSignatureCanvas(
  sourceCanvas: HTMLCanvasElement,
): Promise<SignatureNormalizationResult> {
  const context = sourceCanvas.getContext("2d");
  if (!context) {
    throw new Error(SIGNATURE_NORMALIZE_USER_ERROR);
  }

  const imageData = context.getImageData(
    0,
    0,
    sourceCanvas.width,
    sourceCanvas.height,
  );
  const trimBounds = findTrimBounds(
    sourceCanvas.width,
    sourceCanvas.height,
    imageData.data,
  );

  if (!trimBounds) {
    throw new Error("Draw your signature before saving.");
  }

  const { canvas, dimensions } = renderNormalizedSignatureCanvas({
    source: sourceCanvas,
    sourceWidth: sourceCanvas.width,
    sourceHeight: sourceCanvas.height,
    trimBounds,
  });
  const blob = await exportCanvasWithinSizeLimit(canvas);

  return {
    blob,
    width: canvas.width,
    height: canvas.height,
    resized:
      dimensions.scaledDown ||
      dimensions.paddedToMinimum ||
      trimBounds.width !== canvas.width ||
      trimBounds.height !== canvas.height,
  };
}

export async function normalizeSignatureFile(
  file: File,
): Promise<SignatureNormalizationResult> {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file);
    return normalizeSignatureImageBitmap(bitmap);
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(url);

      const sourceCanvas = document.createElement("canvas");
      sourceCanvas.width = image.naturalWidth;
      sourceCanvas.height = image.naturalHeight;
      const context = sourceCanvas.getContext("2d");

      if (!context) {
        reject(new Error(SIGNATURE_NORMALIZE_USER_ERROR));
        return;
      }

      context.drawImage(image, 0, 0);
      void normalizeSignatureCanvas(sourceCanvas).then(resolve).catch(reject);
    };

    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(SIGNATURE_NORMALIZE_USER_ERROR));
    };

    image.src = url;
  });
}

export async function normalizeSignatureImageBitmap(
  bitmap: ImageBitmap,
): Promise<SignatureNormalizationResult> {
  const originalWidth = bitmap.width;
  const originalHeight = bitmap.height;
  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = originalWidth;
  sourceCanvas.height = originalHeight;

  const context = sourceCanvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error(SIGNATURE_NORMALIZE_USER_ERROR);
  }

  context.drawImage(bitmap, 0, 0);
  bitmap.close();

  const imageData = context.getImageData(
    0,
    0,
    sourceCanvas.width,
    sourceCanvas.height,
  );
  const trimBounds = findTrimBounds(
    sourceCanvas.width,
    sourceCanvas.height,
    imageData.data,
  );

  if (!trimBounds) {
    throw new Error(SIGNATURE_NORMALIZE_USER_ERROR);
  }

  const { canvas, dimensions } = renderNormalizedSignatureCanvas({
    source: sourceCanvas,
    sourceWidth: sourceCanvas.width,
    sourceHeight: sourceCanvas.height,
    trimBounds,
  });
  const blob = await exportCanvasWithinSizeLimit(canvas);

  return {
    blob,
    width: canvas.width,
    height: canvas.height,
    resized:
      dimensions.scaledDown ||
      originalWidth !== canvas.width ||
      originalHeight !== canvas.height,
  };
}

export function mapSignatureErrorForUser(error: unknown): string {
  if (!(error instanceof Error)) {
    return SIGNATURE_NORMALIZE_USER_ERROR;
  }

  if (error.message === "Draw your signature before saving.") {
    return error.message;
  }

  if (
    error.message.includes("Signature width must be") ||
    error.message.includes("Signature height must be") ||
    error.message.includes("Signature file must be 1 MB") ||
    error.message.includes("Signature file is not a valid PNG") ||
    error.message.includes("Signature file must be a PNG") ||
    error.message.includes("Unable to save") ||
    error.message.includes("Unable to validate")
  ) {
    if (process.env.NODE_ENV === "development") {
      console.error("[personnel-signature]", error.message);
    }

    return SIGNATURE_NORMALIZE_USER_ERROR;
  }

  return error.message;
}
