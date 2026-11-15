export const NY_TRAINING_ID_DIGITS = 7;

/** Accept the printed prefix when restoring a saved ID or pasting a full ID. */
export function nyTrainingIdDigits(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/^NY[ -]?/i, "") : "";
}

export function isValidNyTrainingId(value: unknown): boolean {
  return /^[0-9]{1,7}$/.test(nyTrainingIdDigits(value));
}

/** Leave unrecognized historical values intact rather than truncating them. */
export function normalizeNyTrainingId(value: unknown): string {
  const text = typeof value === "string" ? value.trim() : "";
  return isValidNyTrainingId(text)
    ? `NY${nyTrainingIdDigits(text).padStart(NY_TRAINING_ID_DIGITS, "0")}`
    : text;
}
