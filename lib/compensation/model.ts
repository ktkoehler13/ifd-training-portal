export type CompensationStatus = "draft" | "pending_mto" | "returned" | "pending_office" | "completed";
export const COMPENSATION_STATUS: Record<CompensationStatus, string> = {
  draft: "Draft", pending_mto: "Awaiting MTO Review", returned: "Returned for Corrections", pending_office: "MTO Approved — Awaiting Office", completed: "Complete",
};
export const OFFICE_CODES = {
  TTM: "Training Time — Straight Pay", OC: "Training Time — Straight Time",
  TNM: "Mandatory Training — 1.5 Pay", OCTR: "Mandatory Training — 1.5 Time",
  EM: "EMT Class Time — 1.5 Pay", OCEC: "EMT Class Time — 1.5 Time",
  TM: "EMT Travel Time — Straight Pay", OCET: "EMT Travel Time — Straight Time",
} as const;
export type OfficeCode = keyof typeof OFFICE_CODES;
export interface TimeEntry { date: string; start: string; end: string; secondStart: string; secondEnd: string }
export interface MileageEntry { date: string; destination: string; miles: string }
export interface VoucherEntry { date: string; quantity: string; description: string; unitPrice: string }
export interface CompensationInput {
  emtTravel: "yes" | "no" | "";
  compensationType: "time" | "pay" | "";
  instructor: string;
  time: TimeEntry[];
  mileage: MileageEntry[];
  voucher: VoucherEntry[];
  street: string; cityStateZip: string; title: string;
}
export interface CompensationIdentity {
  name: string; badge: string; course: string; requestNumber: string; mileageRate: number;
}
export interface CompensationSignature { path: string; sha256: string; name: string; signedAt: string }
export interface CompensationReceipt { id: string; name: string; contentType: string; size: number; path: string; sha256: string }
export interface CompensationPacket {
  id: string; request_id: string; requester_id: string; status: CompensationStatus; version: number;
  data: CompensationInput; identity: CompensationIdentity; office_codes: OfficeCode[];
  requester_signature: CompensationSignature | null; mto_signature: CompensationSignature | null;
  office_name: string | null; office_completed_at: string | null;
  pdf_path: string | null; pdf_sha256: string | null; receipts: CompensationReceipt[];
  review_note: string; created_at: string; updated_at: string;
}
export interface CompensationEvent {
  id: string; packet_id: string; action: "submitted" | "returned" | "mto_approved" | "office_completed";
  receipts?: CompensationReceipt[];
  actor_name: string; created_at: string; note: string; version: number; pdf_path: string | null;
}
export const blankTime = (): TimeEntry => ({ date: "", start: "", end: "", secondStart: "", secondEnd: "" });
export const blankMileage = (): MileageEntry => ({ date: "", destination: "", miles: "" });
export const blankVoucher = (): VoucherEntry => ({ date: "", quantity: "1", description: "", unitPrice: "" });
export const blankCompensation = (): CompensationInput => ({ emtTravel: "", compensationType: "", instructor: "", time: [blankTime()], mileage: [], voucher: [], street: "", cityStateZip: "", title: "" });
export function localToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
export function isCompensationEligible(request: { status: string; courseEndDate?: string; end_date?: string | null; deletedAt?: string | null; deleted_at?: string | null }, today = localToday()) {
  const end = request.courseEndDate ?? request.end_date;
  return request.status === "approved" && !request.deletedAt && !request.deleted_at && Boolean(end && end <= today);
}
export function timeMinutes(row: TimeEntry): number {
  const minutes = (s: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s) ? Number(s.slice(0, 2)) * 60 + Number(s.slice(3)) : NaN;
  const first = minutes(row.end) - minutes(row.start);
  const second = row.secondStart || row.secondEnd ? minutes(row.secondEnd) - minutes(row.secondStart) : 0;
  return Number.isFinite(first + second) && first > 0 && second >= 0 && (!row.secondStart || row.secondStart >= row.end) ? first + second : 0;
}
export const formatCompensationRate = (rate: number) => rate.toFixed(4).replace(/0$/, "");
export const money = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export function compensationTotals(data: CompensationInput, mileageRate: number) {
  const minutes = data.time.reduce((n, row) => n + timeMinutes(row), 0);
  const miles = data.mileage.reduce((n, row) => n + (Number(row.miles) || 0), 0);
  const mileageAmount = money(miles * mileageRate);
  const voucherAmount = money(data.voucher.reduce((n, row) => n + money((Number(row.quantity) || 0) * (Number(row.unitPrice) || 0)), mileageAmount));
  return { minutes, hours: minutes / 60, miles: money(miles), mileageAmount, voucherAmount };
}
