import { roundCurrency } from "@/lib/currency";

export function getGsaMileageRate(): number | null {
  const raw = process.env.NEXT_PUBLIC_GSA_MILEAGE_RATE;

  if (raw === undefined || raw.trim() === "") {
    return null;
  }

  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}

export function calculateMileageReimbursement(
  totalReimbursableMiles: number,
  gsaMileageRate: number,
): number {
  if (
    !Number.isFinite(totalReimbursableMiles) ||
    !Number.isFinite(gsaMileageRate) ||
    totalReimbursableMiles < 0 ||
    gsaMileageRate < 0
  ) {
    return 0;
  }

  return roundCurrency(totalReimbursableMiles * gsaMileageRate);
}

export function parseMilesInput(value: string): number {
  const cleaned = value.replace(/[^0-9.]/g, "");
  if (!cleaned) {
    return 0;
  }

  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function isValidMilesInput(value: string): boolean {
  if (!value.trim()) {
    return true;
  }

  const cleaned = value.replace(/,/g, "").trim();
  if (!/^\d{1,7}(\.\d{0,2})?$/.test(cleaned)) {
    return false;
  }

  const miles = Number.parseFloat(cleaned);
  return Number.isFinite(miles) && miles >= 0;
}
