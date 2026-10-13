import { NextResponse } from "next/server";
import { getAuthenticatedPersonnel } from "@/lib/auth/personnel";
import { isAdministrativeRole } from "@/lib/auth/roles";
import { PersonnelEmailUpdateError, updatePersonnelEmail } from "@/lib/auth/personnel-email-update";
import { mapPersonnelRow } from "@/lib/personnel";
import { createServiceRoleClient } from "@/lib/supabase/service";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const actor = await getAuthenticatedPersonnel();
  if (!actor?.active || !isAdministrativeRole(actor.role)) {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }
  const { id } = await context.params;
  let body: unknown;
  try { body = await request.json(); } catch { body = null; }
  if (!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(id) ||
    !body || typeof body !== "object" || !("email" in body) || typeof body.email !== "string" ||
    !("expectedEmail" in body) || typeof body.expectedEmail !== "string") {
    return NextResponse.json({ error: "Invalid email change request." }, { status: 400 });
  }
  const service = createServiceRoleClient();
  try {
    const updated = await updatePersonnelEmail(actor, {
      personnelId: id, email: body.email, expectedEmail: body.expectedEmail,
    }, {
      async getPersonnel(personnelId) {
        const { data, error } = await service.from("personnel").select("*").eq("id", personnelId).maybeSingle();
        if (error) throw new Error("Personnel lookup failed.");
        return data;
      },
      async getAuthUser(authId) {
        const { data, error } = await service.auth.admin.getUserById(authId);
        if (error) throw new Error("Sign-in account lookup failed.");
        return data.user;
      },
      async updateAuthEmail(authId, email) {
        const { error } = await service.auth.admin.updateUserById(authId, { email, email_confirm: true });
        if (error) throw new Error("Auth email update failed.");
      },
    });
    return NextResponse.json({ personnel: mapPersonnelRow(updated) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof PersonnelEmailUpdateError ? error.message :
      "Unable to change the email right now. Refresh the record and try again." },
    { status: error instanceof PersonnelEmailUpdateError ? error.status : 503 });
  }
}
