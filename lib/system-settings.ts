export const GSA_MILEAGE_RATE_SETTING_KEY = "gsa_mileage_rate";

export interface SystemSettingRow {
  key: string;
  value: string;
  updated_at: string;
  updated_by_personnel_id: string | null;
}

export interface SystemSettingAuditRow {
  id: string;
  setting_key: string;
  old_value: string | null;
  new_value: string;
  changed_by_personnel_id: string | null;
  changed_at: string;
}

const GSA_RATE_INPUT_PATTERN = /^\d+(\.\d{1,4})?$/;

export function parseGsaMileageRateSettingValue(
  raw: string | null | undefined,
): number | null {
  if (raw === null || raw === undefined) {
    return null;
  }

  const trimmed = raw.trim();
  if (!trimmed || !GSA_RATE_INPUT_PATTERN.test(trimmed)) {
    return null;
  }

  const parsed = Number.parseFloat(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

export function validateGsaMileageRateSettingInput(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return "Enter the GSA mileage rate.";
  }

  if (!GSA_RATE_INPUT_PATTERN.test(trimmed.replace(/,/g, ""))) {
    return "Enter a valid rate with up to four decimal places.";
  }

  const parsed = Number.parseFloat(trimmed.replace(/,/g, ""));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return "Enter a rate greater than zero.";
  }

  return null;
}

export function formatGsaMileageRateSettingInput(value: number): string {
  return value.toString();
}
