export const PROTOTYPE_SESSION_KEY = "ifd_prototype_session";

export function hasPrototypeSession(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return sessionStorage.getItem(PROTOTYPE_SESSION_KEY) === "true";
}

export function setPrototypeSession(): void {
  sessionStorage.setItem(PROTOTYPE_SESSION_KEY, "true");
}

export function clearPrototypeSession(): void {
  sessionStorage.removeItem(PROTOTYPE_SESSION_KEY);
}
