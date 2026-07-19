export const AUTH_MESSAGES = {
  accessDenied:
    "Access denied. Your account is not linked to an active personnel record.",
  administrativeAccessRequired:
    "Access denied. Administrative access is required to manage personnel.",
  configError:
    "Authentication is temporarily unavailable. Contact the Training Bureau.",
  emailUpdatedSignInRequired:
    "Email updated. Sign in again using your badge number and password.",
  passwordUpdatedSignInRequired:
    "Password updated. Sign in again with your new password.",
} as const;

export { INVALID_CREDENTIALS_MESSAGE } from "@/lib/auth/password";
