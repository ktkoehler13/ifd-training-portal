import { roundCurrency } from "@/lib/currency";
import { parseGsaMileageRateSettingValue } from "@/lib/system-settings";

/** Transitional env fallback when system_settings has no valid rate. */
export function getGsaMileageRateFromEnv(): number | null {
  const raw = process.env.NEXT_PUBLIC_GSA_MILEAGE_RATE;

  if (raw === undefined || raw.trim() === "") {
    return null;
  }

  return parseGsaMileageRateSettingValue(raw);
}

/** @deprecated Prefer getCurrentGsaMileageRate() on the server. */
export function getGsaMileageRate(): number | null {
  return getGsaMileageRateFromEnv();
}

export function resolveGsaMileageRate(input: {
  databaseRate: number | null;
  envRate?: number | null;
}): number | null {
  if (input.databaseRate !== null) {
    return input.databaseRate;
  }

  return input.envRate ?? getGsaMileageRateFromEnv();
}

export function calculateMileageReimbursement(
  totalReimbursableMiles: number,
  gsaMileageRate: number,
): number {
  if (
    !Number.isFinite(totalReimbursableMiles) ||
    !Number.isFinite(gsaMileageRate) ||
    totalReimbursableMiles < 0 ||
    gsaMileageRate <= 0
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
    return false;
  }

  const cleaned = value.replace(/,/g, "").trim();
  if (!/^\d{1,7}(\.\d{0,2})?$/.test(cleaned)) {
    return false;
  }

  const miles = Number.parseFloat(cleaned);
  return Number.isFinite(miles) && miles >= 0;
}

export function validateTotalReimbursableMilesInput(
  value: string,
  options: { requireInput: boolean },
): string | null {
  if (!options.requireInput) {
    return null;
  }

  if (!value.trim()) {
    return "Enter total reimbursable miles.";
  }

  if (!isValidMilesInput(value)) {
    return "Enter a valid mileage amount of zero or greater.";
  }

  return null;
}
