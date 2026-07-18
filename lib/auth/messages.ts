export const AUTH_MESSAGES = {
  loginMismatch:
    "The badge number and email do not match an active user.",
  accessDenied:
    "Access denied. Your account is not linked to an active personnel record.",
  adminRequired:
    "Access denied. Admin privileges are required to manage personnel.",
  otpRequired: "Enter the six-digit login code sent to your email.",
  otpInvalid: "The login code must contain exactly six digits.",
  otpVerifyFailed:
    "Unable to verify the login code. Check the code and try again.",
  otpSendFailed:
    "Unable to send a login code right now. Wait a moment and try again.",
  resendCooldown: (seconds: number) =>
    `You can request a new code in ${seconds} seconds.`,
  configError:
    "Authentication is temporarily unavailable. Contact the Training Bureau.",
} as const;

export function getSafeAuthErrorMessage(error: unknown): string {
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    const message = error.message.toLowerCase();

    if (message.includes("rate") || message.includes("too many")) {
      return "Too many login attempts. Wait a moment before requesting another code.";
    }

    if (message.includes("expired") || message.includes("invalid")) {
      return AUTH_MESSAGES.otpVerifyFailed;
    }
  }

  return AUTH_MESSAGES.otpVerifyFailed;
}
