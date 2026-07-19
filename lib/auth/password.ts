export const INVALID_CREDENTIALS_MESSAGE =
  "Unable to sign in. Check your badge number and password.";

export const PASSWORD_CHANGE_SUCCESS_MESSAGE = "Password updated successfully.";

export const PASSWORD_MISMATCH_MESSAGE =
  "New password and confirmation do not match.";

export const CURRENT_PASSWORD_INCORRECT_MESSAGE =
  "Current password is incorrect.";

export const INITIAL_PASSWORD_TOO_SHORT_MESSAGE =
  "Initial password must be at least 6 characters.";

export const INITIAL_PASSWORD_WHITESPACE_ONLY_MESSAGE =
  "Initial password cannot contain only spaces.";

export const INITIAL_PASSWORD_MISMATCH_MESSAGE =
  "Initial passwords do not match.";

export const INITIAL_PASSWORD_INVALID_SERVER_MESSAGE =
  "Initial password must be at least 6 characters and cannot contain only spaces.";

const PERMANENT_PASSWORD_PATTERN =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,}$/;

export function validatePermanentPassword(password: string): string | null {
  if (password.length < 12) {
    return "Password must be at least 12 characters.";
  }

  if (!PERMANENT_PASSWORD_PATTERN.test(password)) {
    return "Password must include upper- and lowercase letters, a number, and a special character.";
  }

  return null;
}

/** @deprecated Use validatePermanentPassword */
export const validatePasswordStrength = validatePermanentPassword;

export function validateInitialPassword(password: string): string | null {
  if (password.length < 6) {
    return INITIAL_PASSWORD_TOO_SHORT_MESSAGE;
  }

  if (password.trim().length === 0) {
    return INITIAL_PASSWORD_WHITESPACE_ONLY_MESSAGE;
  }

  return null;
}

const MEMORABLE_PASSWORD_WORDS = [
  "Cedar",
  "Ladder",
  "Rescue",
  "Engine",
  "Truck",
  "Station",
  "Ithaca",
  "Maple",
  "Summit",
  "Harbor",
  "Forest",
  "Bridge",
  "Beacon",
  "River",
  "Bronze",
  "Copper",
  "Timber",
  "Valley",
  "Spring",
  "North",
  "South",
  "East",
  "West",
  "Chief",
  "Crew",
];

function secureRandomIndex(max: number): number {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return bytes[0]! % max;
}

const MEMORABLE_INITIAL_PASSWORD_WORDS = MEMORABLE_PASSWORD_WORDS.filter(
  (word) => word.length >= 5,
);

export function generateMemorableInitialPassword(): string {
  const word =
    MEMORABLE_INITIAL_PASSWORD_WORDS[
      secureRandomIndex(MEMORABLE_INITIAL_PASSWORD_WORDS.length)
    ]!;
  const digit = String(secureRandomIndex(10));
  return `${word}${digit}`;
}

/** @deprecated Use generateMemorableInitialPassword */
export const generateTemporaryPassword = generateMemorableInitialPassword;
