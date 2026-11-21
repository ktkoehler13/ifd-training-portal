import { NextResponse } from "next/server";
import { getAuthenticatedPersonnel } from "@/lib/auth/personnel";
import { isAdministrativeRole } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { isRoutingSlot, ROUTING_SETTING_KEYS } from "@/lib/approval-routing";

const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
const PEOPLE = "id, first_name, last_name, badge_number, email";

export async function GET() {
  const actor = await getAuthenticatedPersonnel();
  if (!actor || !isAdministrativeRole(actor.role)) {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }
  const db = await createClient();
  const [settings, mtos, office, chiefs] = await Promise.all([
    db.from("system_settings").select("key, value").in("key", Object.values(ROUTING_SETTING_KEYS)),
    db.from("personnel").select(PEOPLE).eq("role", "mto").eq("active", true).order("last_name"),
    db.from("personnel").select(PEOPLE).eq("role", "office").eq("active", true).order("last_name"),
    db.from("personnel").select(PEOPLE).eq("title", "fire_chief").eq("active", true).order("last_name"),
  ]);
  if (settings.error || mtos.error || office.error || chiefs.error) {
    return NextResponse.json({ error: "Unable to load approval routing." }, { status: 503 });
  }
  const value = (key: string) => settings.data.find((row) => row.key === key)?.value || null;
  return NextResponse.json({
    mto: { personnelId: value(ROUTING_SETTING_KEYS.mto), candidates: mtos.data },
    office: { personnelId: value(ROUTING_SETTING_KEYS.office), candidates: office.data },
    chief: { personnelId: value(ROUTING_SETTING_KEYS.chief), candidates: chiefs.data },
  });
}

export async function PATCH(request: Request) {
  const actor = await getAuthenticatedPersonnel();
  if (!actor || !isAdministrativeRole(actor.role)) {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }
  let body: unknown;
  try { body = await request.json(); } catch { body = null; }
  const { slot, personnelId } = (body && typeof body === "object" ? body : {}) as { slot?: unknown; personnelId?: unknown };
  if (!isRoutingSlot(slot) || !(personnelId === null || (typeof personnelId === "string" && UUID.test(personnelId)))) {
    return NextResponse.json({ error: "Choose an eligible active person." }, { status: 400 });
  }
  const db = await createClient();
  const { error } = await db.rpc("set_approval_routing", { p_setting_key: ROUTING_SETTING_KEYS[slot], p_personnel_id: personnelId });
  if (error) {
    const status = error.code === "42501" ? 403 : error.code === "22023" ? 400 : 503;
    return NextResponse.json({ error: status === 400 ? "Choose an eligible active person." :
      status === 403 ? "Access denied." : "Unable to save approval routing. Please try again." }, { status });
  }
  return NextResponse.json({ slot, personnelId });
}
