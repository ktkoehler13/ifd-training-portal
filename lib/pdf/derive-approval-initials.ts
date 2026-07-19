/**
 * Derives compact approval initials from a display name.
 * Examples: "Kevin Koehler" -> "KK", "Kevin T. Koehler" -> "KTK", "K. Koehler" -> "KK".
 */
export function deriveApprovalInitials(name: string | null | undefined): string {
  if (!name?.trim()) {
    return "";
  }

  const initials = name
    .trim()
    .split(/\s+/)
    .map((part) => {
      const letters = part.replace(/[^a-zA-Z]/g, "");
      return letters.charAt(0).toUpperCase();
    })
    .filter(Boolean)
    .join("");

  return initials.slice(0, 4);
}
