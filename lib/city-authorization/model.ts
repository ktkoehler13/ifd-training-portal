import { isAdministrativeRole } from "@/lib/auth/roles";
import type { PersonnelRole } from "@/types/personnel";

export const CITY_AUTHORIZATION_MAX_BYTES = 4 * 1024 * 1024;
export interface CityAuthorization {
  request_id: string;
  status: "pending" | "uploaded";
  version: number;
  created_at: string;
  completed_at: string | null;
  completed_by_name: string | null;
}
export interface CityAuthorizationFile {
  id: string;
  request_id: string;
  version: number;
  file_name: string;
  storage_path: string;
  content_type: string;
  file_size_bytes: number;
  sha256: string;
  uploaded_by_name: string;
  uploaded_at: string;
  removed_at?: string | null;
  removed_by_name?: string | null;
}
export interface CityAuthorizationQueueItem extends CityAuthorization {
  request: { id: string; request_number: string | null; training_title: string; requester_name: string; start_date: string | null };
}
export function canProcessCityAuthorization(role: PersonnelRole): boolean {
  return role === "office" || isAdministrativeRole(role);
}
export function cityAuthorizationNeedsAction(status: CityAuthorization["status"], role: PersonnelRole): boolean {
  return role === "office" && status === "pending";
}
export function canReadCityAuthorization(actor: {id:string;role:PersonnelRole}, request: {requester_personnel_id:string;status:string;deleted_at?:string|null}): boolean {
  return request.status === "approved" && !request.deleted_at &&
    (actor.id === request.requester_personnel_id || canProcessCityAuthorization(actor.role));
}
export function authorizationFileType(bytes: Uint8Array): string | null {
  if (bytes.length >= 5 && String.fromCharCode(...bytes.subarray(0,5)) === "%PDF-") return "application/pdf";
  if (bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n)) return "image/png";
  if (bytes.length >= 3 && bytes[0]===255 && bytes[1]===216 && bytes[2]===255) return "image/jpeg";
  return null;
}
