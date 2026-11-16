export const SIGNATURE_NAME_MAX_LENGTH = 100;
export const SIGNATURE_TEXT_FONT = '"Brush Script MT", "Segoe Script", cursive';

export function normalizeSignatureName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function drawTypedSignature(canvas: HTMLCanvasElement, value: string): boolean {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Signature preview is unavailable. Try drawing or uploading your signature.");
  const name = normalizeSignatureName(value);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  if (!name || name.length > SIGNATURE_NAME_MAX_LENGTH) return false;
  let size = 88;
  context.font = `${size}px ${SIGNATURE_TEXT_FONT}`;
  while (size > 12 && context.measureText(name).width > canvas.width - 96) {
    size -= 1;
    context.font = `${size}px ${SIGNATURE_TEXT_FONT}`;
  }
  context.fillStyle = "#000000";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(name, canvas.width / 2, canvas.height / 2, canvas.width - 96);
  return true;
}
