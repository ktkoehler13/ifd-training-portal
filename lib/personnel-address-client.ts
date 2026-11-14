import { createClient } from "@/lib/supabase/client";
import { normalizePersonnelAddress, validatePersonnelAddress, type PersonnelAddress } from "@/lib/personnel-address";
import type { StateCourseDetails } from "@/lib/state-course-details";

const columns = "street_address,city,state,zip";

function mapAddress(row: { street_address: string; city: string; state: string; zip: string }): PersonnelAddress {
  return { requesterAddress: row.street_address, requesterCity: row.city, requesterState: row.state, requesterZip: row.zip };
}

export async function getOwnPersonnelAddress(personnelId: string): Promise<PersonnelAddress | null> {
  const { data, error } = await createClient().from("personnel_addresses").select(columns).eq("personnel_id", personnelId).maybeSingle();
  if (error) throw new Error("Your saved address could not be loaded. You can still enter it on this request.");
  return data ? mapAddress(data) : null;
}

export async function saveOwnPersonnelAddress(personnelId: string, value: StateCourseDetails): Promise<PersonnelAddress> {
  const errors = validatePersonnelAddress(value);
  if (Object.keys(errors).length) throw new Error(Object.values(errors)[0]);
  const address = normalizePersonnelAddress(value);
  const { data, error } = await createClient().from("personnel_addresses").upsert({
    personnel_id: personnelId, street_address: address.requesterAddress,
    city: address.requesterCity, state: address.requesterState, zip: address.requesterZip,
  }, { onConflict: "personnel_id" }).select(columns).single();
  if (error || !data) throw new Error("Your address could not be saved to your profile. Try again, or uncheck the save-address option to continue without saving it.");
  return mapAddress(data);
}

export async function removeOwnPersonnelAddress(personnelId: string): Promise<void> {
  const { error } = await createClient().from("personnel_addresses").delete().eq("personnel_id", personnelId);
  if (error) throw new Error("Your saved address could not be removed. Try again.");
}
