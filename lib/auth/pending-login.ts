export const PENDING_LOGIN_COOKIE = "ifd_pending_login_badge";
export const PENDING_LOGIN_MAX_AGE_SECONDS = 60 * 10;

export function getPendingLoginCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: PENDING_LOGIN_MAX_AGE_SECONDS,
    path: "/",
  };
}
