"use client";

import Link from "next/link";
import { startTransition, useCallback, useEffect, useState } from "react";
import { AdminGate } from "@/components/layout/AuthGate";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { formatMileageRate } from "@/lib/currency";
import {
  formatGsaMileageRateSettingInput,
  validateGsaMileageRateSettingInput,
} from "@/lib/system-settings";

type SettingSource = "database" | "env_fallback" | "missing";

interface GsaRateSettingResponse {
  rate: number | null;
  updatedAt: string | null;
  source: SettingSource;
}

export function SystemSettingsView() {
  return (
    <AdminGate>
      {(personnel) => (
        <div className="flex flex-1 flex-col bg-zinc-100">
          <header className="border-b border-zinc-200 bg-white">
            <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-6">
              <div>
                <h1 className="text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl">
                  System Settings
                </h1>
                <p className="mt-1 text-sm text-zinc-600">
                  Manage application-wide configuration for the Training Bureau.
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Link
                  href="/dashboard"
                  className="inline-flex h-11 items-center justify-center rounded-xl border border-zinc-200 bg-white px-5 text-sm font-semibold text-zinc-800 shadow-sm transition-colors hover:bg-zinc-50"
                >
                  Back to Dashboard
                </Link>
                <SignOutButton />
              </div>
            </div>
          </header>

          <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
            <GsaMileageRateSettings personnelLabel={personnel.email} />
          </div>
        </div>
      )}
    </AdminGate>
  );
}

function GsaMileageRateSettings({ personnelLabel }: { personnelLabel: string }) {
  const [setting, setSetting] = useState<GsaRateSettingResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [draftRate, setDraftRate] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const loadSetting = useCallback(async () => {
    startTransition(() => {
      setIsLoading(true);
      setLoadError(null);
    });

    try {
      const response = await fetch("/api/admin/settings/gsa-mileage-rate");
      if (!response.ok) {
        throw new Error("Unable to load settings.");
      }

      const data = (await response.json()) as GsaRateSettingResponse;
      startTransition(() => {
        setSetting(data);
        setIsLoading(false);
      });
    } catch {
      startTransition(() => {
        setLoadError("Unable to load GSA mileage rate settings.");
        setIsLoading(false);
      });
    }
  }, []);

  useEffect(() => {
    void loadSetting();
  }, [loadSetting]);

  function beginEdit() {
    setFieldError(null);
    setSuccessMessage(null);
    setDraftRate(
      setting?.rate != null
        ? formatGsaMileageRateSettingInput(setting.rate)
        : "",
    );
    setIsEditing(true);
  }

  function cancelEdit() {
    setIsEditing(false);
    setFieldError(null);
    setDraftRate("");
  }

  async function handleSave() {
    const validationMessage = validateGsaMileageRateSettingInput(draftRate);
    if (validationMessage) {
      setFieldError(validationMessage);
      return;
    }

    setIsSaving(true);
    setFieldError(null);
    setSuccessMessage(null);

    try {
      const response = await fetch("/api/admin/settings/gsa-mileage-rate", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rate: draftRate.trim().replace(/,/g, "") }),
      });

      const payload = (await response.json()) as {
        error?: string;
        rate?: number;
        updatedAt?: string;
        source?: SettingSource;
      };

      if (!response.ok) {
        setFieldError(payload.error ?? "Unable to save the GSA mileage rate.");
        return;
      }

      setSetting({
        rate: payload.rate ?? null,
        updatedAt: payload.updatedAt ?? null,
        source: payload.source ?? "database",
      });
      setIsEditing(false);
      setSuccessMessage("GSA mileage rate updated.");
    } catch {
      setFieldError("Unable to save the GSA mileage rate. Try again later.");
    } finally {
      setIsSaving(false);
    }
  }

  const displayRate =
    setting?.rate != null ? `${formatMileageRate(setting.rate)} per mile` : "Not configured";

  return (
    <section className="rounded-2xl bg-white p-6 shadow-sm shadow-zinc-200/60 sm:p-8">
      <h2 className="text-lg font-semibold text-zinc-900">GSA Mileage Rate</h2>
      <p className="mt-1 text-sm text-zinc-600">
        Signed in as {personnelLabel}. Updates apply to new submissions and drafts
        at submission time. Historical requests keep the rate stored on each
        request.
      </p>

      {isLoading ? (
        <p className="mt-6 text-sm text-zinc-500" role="status">
          Loading current rate...
        </p>
      ) : null}

      {loadError ? (
        <p className="mt-6 text-sm text-red-700" role="alert">
          {loadError}
        </p>
      ) : null}

      {!isLoading && !loadError ? (
        <div className="mt-6 space-y-4">
          {setting?.source === "env_fallback" ? (
            <p
              className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
              role="status"
            >
              No database rate is configured yet. The application is using the
              transitional environment fallback until you save a rate here.
            </p>
          ) : null}

          {successMessage ? (
            <p
              className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900"
              role="status"
            >
              {successMessage}
            </p>
          ) : null}

          {!isEditing ? (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-medium text-zinc-700">
                  Current GSA Mileage Rate
                </p>
                <p className="mt-1 text-2xl font-semibold text-zinc-900">
                  {displayRate}
                </p>
                {setting?.updatedAt ? (
                  <p className="mt-1 text-xs text-zinc-500">
                    Last updated{" "}
                    {new Date(setting.updatedAt).toLocaleString("en-US", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </p>
                ) : null}
              </div>
              <Button type="button" variant="secondary" onClick={beginEdit}>
                Edit
              </Button>
            </div>
          ) : (
            <div className="max-w-sm space-y-4">
              <Field
                id="gsaMileageRateAdmin"
                label="GSA mileage rate (USD per mile)"
                error={fieldError ?? undefined}
              >
                <Input
                  id="gsaMileageRateAdmin"
                  inputMode="decimal"
                  value={draftRate}
                  onChange={(event) => setDraftRate(event.target.value)}
                  placeholder="0.70"
                  aria-invalid={fieldError ? true : undefined}
                />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={handleSave} disabled={isSaving}>
                  {isSaving ? "Saving..." : "Save rate"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={cancelEdit}
                  disabled={isSaving}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
