export const PASSWORD_RESET_UNAUTHORIZED_MESSAGE =
  "You are not authorized to reset passwords.";

export const PASSWORD_RESET_PERSONNEL_NOT_FOUND_MESSAGE =
  "Personnel record not found.";

export const PASSWORD_RESET_NO_AUTH_ACCOUNT_MESSAGE =
  "No authentication account exists for this personnel record.";

export const PASSWORD_RESET_INACTIVE_MESSAGE =
  "Activate this user before resetting their password.";

export const PASSWORD_RESET_FAILED_MESSAGE = "Unable to reset the password.";

export const PASSWORD_RESET_AMBIGUOUS_AUTH_ACCOUNT_MESSAGE =
  "Unable to reset the password.";

export class PasswordResetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PasswordResetError";
  }
}
