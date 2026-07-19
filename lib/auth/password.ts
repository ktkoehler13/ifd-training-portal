export const INVALID_CREDENTIALS_MESSAGE =
  "Unable to sign in. Check your badge number and password.";

export const PASSWORD_CHANGE_SUCCESS_MESSAGE = "Password updated successfully.";

export const PASSWORD_MISMATCH_MESSAGE =
  "New password and confirmation do not match.";

export const CURRENT_PASSWORD_INCORRECT_MESSAGE =
  "Current password is incorrect.";

const PASSWORD_PATTERN =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,}$/;

export function validatePasswordStrength(password: string): string | null {
  if (password.length < 12) {
    return "Password must be at least 12 characters.";
  }

  if (!PASSWORD_PATTERN.test(password)) {
    return "Password must include upper- and lowercase letters, a number, and a special character.";
  }

  return null;
}

export function generateTemporaryPassword(): string {
  const uppercase = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lowercase = "abcdefghijkmnopqrstuvwxyz";
  const numbers = "23456789";
  const specials = "!@#$%^&*-_+=.";
  const all = uppercase + lowercase + numbers + specials;

  const randomIndex = (max: number) => {
    const bytes = new Uint32Array(1);
    crypto.getRandomValues(bytes);
    return bytes[0]! % max;
  };

  const required = [
    uppercase[randomIndex(uppercase.length)]!,
    lowercase[randomIndex(lowercase.length)]!,
    numbers[randomIndex(numbers.length)]!,
    specials[randomIndex(specials.length)]!,
  ];

  while (required.length < 16) {
    required.push(all[randomIndex(all.length)]!);
  }

  for (let index = required.length - 1; index > 0; index -= 1) {
    const swapIndex = randomIndex(index + 1);
    [required[index], required[swapIndex]] = [required[swapIndex]!, required[index]!];
  }

  return required.join("");
}
