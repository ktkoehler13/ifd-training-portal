export const AUTH_MESSAGES = {
  loginMismatch:
    "The badge number and email do not match an active user.",
  accessDenied:
    "Access denied. Your account is not linked to an active personnel record.",
  administrativeAccessRequired:
    "Access denied. Administrative access is required to manage personnel.",
  magicLinkSent:
    "Check your email and click the secure sign-in link.",
  magicLinkSendFailed:
    "Unable to send a sign-in link right now. Wait a moment and try again.",
  resendCooldown: (seconds: number) =>
    `You can request a new link in ${seconds} seconds.`,
  configError:
    "Authentication is temporarily unavailable. Contact the Training Bureau.",
  emailUpdatedSignInRequired:
    "Email updated. Sign in again using your new email address.",
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
      return "Too many login attempts. Wait a moment before requesting another link.";
    }
  }

  return AUTH_MESSAGES.magicLinkSendFailed;
}
