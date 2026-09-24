import "server-only";

import { getGsaMileageRateFromEnv } from "@/lib/mileage";
import {
  GSA_MILEAGE_RATE_SETTING_KEY,
  parseGsaMileageRateSettingValue,
  type SystemSettingRow,
} from "@/lib/system-settings";
import { requireAdministrativePersonnel } from "@/lib/auth/admin-personnel-server";
import { createServiceRoleClient } from "@/lib/supabase/service";

export class SystemSettingsAccessError extends Error {
  constructor(message = "Access denied.") {
    super(message);
    this.name = "SystemSettingsAccessError";
  }
}

export class SystemSettingsValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SystemSettingsValidationError";
  }
}

async function readGsaMileageRateSettingRow(): Promise<SystemSettingRow | null> {
  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("system_settings")
    .select("key, value, updated_at, updated_by_personnel_id")
    .eq("key", GSA_MILEAGE_RATE_SETTING_KEY)
    .maybeSingle();

  if (error) {
    console.warn("Unable to read GSA mileage rate setting", {
      key: GSA_MILEAGE_RATE_SETTING_KEY,
      code: error.code,
      message: error.message,
    });
    return null;
  }

  return data as SystemSettingRow | null;
}

export async function getCurrentGsaMileageRate(): Promise<number | null> {
  const row = await readGsaMileageRateSettingRow();
  const fromDatabase = parseGsaMileageRateSettingValue(row?.value);

  if (fromDatabase !== null) {
    return fromDatabase;
  }

  if (row?.value) {
    console.warn("GSA mileage rate setting is present but invalid", {
      key: GSA_MILEAGE_RATE_SETTING_KEY,
    });
  }

  // Transitional fallback — remove once every environment seeds system_settings.
  return getGsaMileageRateFromEnv();
}

export async function getGsaMileageRateSettingForAdmin(): Promise<{
  rate: number | null;
  updatedAt: string | null;
  source: "database" | "env_fallback" | "missing";
}> {
  const row = await readGsaMileageRateSettingRow();
  const fromDatabase = parseGsaMileageRateSettingValue(row?.value);

  if (fromDatabase !== null) {
    return {
      rate: fromDatabase,
      updatedAt: row?.updated_at ?? null,
      source: "database",
    };
  }

  const fromEnv = getGsaMileageRateFromEnv();
  if (fromEnv !== null) {
    return {
      rate: fromEnv,
      updatedAt: null,
      source: "env_fallback",
    };
  }

  return {
    rate: null,
    updatedAt: null,
    source: "missing",
  };
}

export async function updateGsaMileageRateSetting(input: {
  rate: number;
  personnelId: string;
}): Promise<{ rate: number; updatedAt: string }> {
  if (!Number.isFinite(input.rate) || input.rate <= 0) {
    throw new SystemSettingsValidationError("Enter a rate greater than zero.");
  }

  const service = createServiceRoleClient();
  const newValue = input.rate.toString();
  const existing = await readGsaMileageRateSettingRow();
  const oldValue = existing?.value ?? null;

  const { data, error } = await service
    .from("system_settings")
    .upsert(
      {
        key: GSA_MILEAGE_RATE_SETTING_KEY,
        value: newValue,
        updated_by_personnel_id: input.personnelId,
      },
      { onConflict: "key" },
    )
    .select("value, updated_at")
    .single();

  if (error) {
    console.error("Unable to update GSA mileage rate setting", {
      key: GSA_MILEAGE_RATE_SETTING_KEY,
      code: error.code,
      message: error.message,
    });
    throw new Error("Unable to save the GSA mileage rate. Try again later.");
  }

  const { error: auditError } = await service.from("system_settings_audit").insert({
    setting_key: GSA_MILEAGE_RATE_SETTING_KEY,
    old_value: oldValue,
    new_value: newValue,
    changed_by_personnel_id: input.personnelId,
  });

  if (auditError) {
    console.error("GSA mileage rate audit insert failed", {
      key: GSA_MILEAGE_RATE_SETTING_KEY,
      code: auditError.code,
      message: auditError.message,
    });
  }

  const parsed = parseGsaMileageRateSettingValue(data.value);
  if (parsed === null) {
    throw new Error("Unable to save the GSA mileage rate. Try again later.");
  }

  return {
    rate: parsed,
    updatedAt: data.updated_at as string,
  };
}

export async function updateGsaMileageRateSettingAsAdministrator(input: {
  rate: number;
}): Promise<{ rate: number; updatedAt: string }> {
  const personnel = await requireAdministrativePersonnel();
  return updateGsaMileageRateSetting({
    rate: input.rate,
    personnelId: personnel.id,
  });
}
