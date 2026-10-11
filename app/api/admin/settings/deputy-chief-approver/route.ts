import { NextResponse } from "next/server";
import { getAuthenticatedPersonnel } from "@/lib/auth/personnel";
import { isAdministrativeRole } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const actor = await getAuthenticatedPersonnel();
  if (!actor || !isAdministrativeRole(actor.role)) {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }
  const db = await createClient();
  const [setting, deputies] = await Promise.all([
    db.from("system_settings").select("value, updated_at")
      .eq("key", "primary_approval_deputy_chief").single(),
    db.from("personnel").select("id, first_name, last_name, badge_number, email")
      .eq("role", "deputy_chief").eq("active", true).order("last_name"),
  ]);
  if (setting.error || deputies.error) {
    return NextResponse.json({ error: "Unable to load Deputy Chief approval settings." }, { status: 503 });
  }
  return NextResponse.json({ personnelId: setting.data.value || null,
    updatedAt: setting.data.updated_at, deputies: deputies.data });
}

export async function PATCH(request: Request) {
  const actor = await getAuthenticatedPersonnel();
  if (!actor || !isAdministrativeRole(actor.role)) {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }
  let body: unknown;
  try { body = await request.json(); } catch { body = null; }
  const personnelId = body && typeof body === "object" && "personnelId" in body ? body.personnelId : null;
  if (typeof personnelId !== "string" || !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(personnelId)) {
    return NextResponse.json({ error: "Choose an active Deputy Chief." }, { status: 400 });
  }
  const db = await createClient();
  const { error } = await db.rpc("set_primary_approval_deputy_chief", { p_personnel_id: personnelId });
  if (error) {
    const status = error.code === "42501" ? 403 : error.code === "22023" ? 400 : 503;
    return NextResponse.json({ error: status === 400 ? "Choose an active Deputy Chief." :
      status === 403 ? "Access denied." : "Unable to save approval settings. Please try again." }, { status });
  }
  return NextResponse.json({ personnelId });
}
