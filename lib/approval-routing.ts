export type RoutingSlot = "mto" | "office" | "chief";

/** System Settings keys for approval routing beyond the primary Deputy Chief. */
export const ROUTING_SETTING_KEYS: Record<RoutingSlot, string> = {
  mto: "primary_approval_mto",
  office: "primary_office",
  chief: "fire_chief",
};

export function isRoutingSlot(value: unknown): value is RoutingSlot {
  return value === "mto" || value === "office" || value === "chief";
}
