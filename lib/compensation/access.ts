import { isAdministrativeRole } from "@/lib/auth/roles";
import type { PersonnelRole } from "@/types/personnel";
import type { CompensationPacket } from "./model";

type Actor = { id: string; role: PersonnelRole };
type QueuePacket = Pick<CompensationPacket, "requester_id" | "status">;

export function canCompleteCompensation(role: PersonnelRole): boolean {
  return role === "office" || isAdministrativeRole(role);
}

/** Office access starts at the signed MTO handoff; it does not grant access to
 * unrelated training requests or another requester's unfinished packet. */
export function canReadCompensationPacket(
  actor: Actor,
  requesterId: string,
  packet: Pick<CompensationPacket, "status" | "mto_signature"> | null,
): boolean {
  return actor.id === requesterId || isAdministrativeRole(actor.role) ||
    (actor.role === "office" && Boolean(packet?.mto_signature) &&
      (packet?.status === "pending_office" || packet?.status === "completed"));
}

// Action alerts belong to the assigned workflow role; backup processing access
// is intentionally independent of the Office notification queue.
export function compensationNeedsAction(packet: QueuePacket, actor: Actor, primaryOfficeId?: string | null): boolean {
  return (packet.requester_id === actor.id && packet.status === "returned") ||
    (actor.role === "mto" && packet.status === "pending_mto") ||
    (actor.role === "office" && packet.status === "pending_office" && (!primaryOfficeId || primaryOfficeId === actor.id));
}
