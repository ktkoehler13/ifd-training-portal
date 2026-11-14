"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { AuthGate } from "@/components/layout/AuthGate";
import { PortalHeading } from "@/components/layout/PortalBrand";
import { AddressFields } from "@/components/settings/AddressFields";
import { Button } from "@/components/ui/Button";
import { normalizePersonnelAddress, validatePersonnelAddress, type AddressErrors } from "@/lib/personnel-address";
import { getOwnPersonnelAddress, removeOwnPersonnelAddress, saveOwnPersonnelAddress } from "@/lib/personnel-address-client";

function ProfileContent({ personnelId }: { personnelId: string }) {
  const [address, setAddress] = useState(() => normalizePersonnelAddress({}));
  const [errors, setErrors] = useState<AddressErrors>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasSavedAddress, setHasSavedAddress] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [loadFailed, setLoadFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getOwnPersonnelAddress(personnelId).then((saved) => {
      if (cancelled) return;
      setAddress(saved ?? normalizePersonnelAddress({}));
      setHasSavedAddress(saved !== null);
      setLoadFailed(false);
    }).catch(() => {
      if (!cancelled) { setLoadFailed(true); setError("Your saved address could not be loaded. Please try again."); }
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [personnelId, loadAttempt]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || loading || loadFailed) return;
    const nextErrors = validatePersonnelAddress(address);
    setErrors(nextErrors); setError(null); setMessage(null);
    if (Object.keys(nextErrors).length) return;
    setSaving(true);
    try {
      setAddress(await saveOwnPersonnelAddress(personnelId, address));
      setHasSavedAddress(true); setMessage("Address saved. New OFPC training requests will fill it in automatically.");
    } catch { setError("Your address could not be saved. Please try again."); }
    finally { setSaving(false); }
  }

  async function remove() {
    if (saving || loading || loadFailed) return;
    setSaving(true); setError(null); setMessage(null);
    try {
      await removeOwnPersonnelAddress(personnelId);
      setAddress(normalizePersonnelAddress({})); setHasSavedAddress(false); setErrors({});
      setMessage("Saved address removed. Existing training requests are unchanged.");
    } catch { setError("Your saved address could not be removed. Please try again."); }
    finally { setSaving(false); }
  }

  return <div className="flex flex-1 flex-col bg-zinc-100">
    <header className="border-b border-zinc-200 bg-white">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-6">
        <PortalHeading><h1 className="text-xl font-semibold text-zinc-900 sm:text-2xl">My Profile</h1><p className="mt-1 text-sm text-zinc-600">Keep your address ready for future training requests.</p></PortalHeading>
        <Link href="/dashboard" className="text-sm font-semibold text-red-700 underline">Back to Dashboard</Link>
      </div>
    </header>
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <form onSubmit={save} noValidate className="space-y-5 rounded-2xl bg-white p-6 shadow-sm sm:p-8">
        <h2 className="text-lg font-semibold text-zinc-900">Saved Address</h2>
        <p className="text-sm leading-6 text-zinc-600">Used to prefill new OFPC training requests. Include your apartment or unit in the street address. You can change the address on each request. Updating your profile does not change existing requests.</p>
        {loading ? <p role="status" className="text-sm text-zinc-600">Loading your address…</p> : null}
        <AddressFields values={address} errors={errors} disabled={loading || saving || loadFailed} onChange={(key, value) => { setAddress((current) => ({ ...current, [key]: value })); setMessage(null); }} />
        {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
        {message ? <p role="status" className="text-sm text-green-800">{message}</p> : null}
        <div className="flex flex-wrap gap-3">
          {loadFailed ? <Button onClick={() => { setLoading(true); setError(null); setLoadAttempt((current) => current + 1); }}>Try Again</Button> : <Button type="submit" disabled={loading || saving}>{saving ? "Saving…" : "Save Address"}</Button>}
          {hasSavedAddress ? <Button variant="secondary" disabled={loading || saving || loadFailed} onClick={remove}>Remove Saved Address</Button> : null}
        </div>
      </form>
    </main>
  </div>;
}

export function MyProfileView() {
  return <AuthGate>{(personnel) => <ProfileContent key={personnel.id} personnelId={personnel.id} />}</AuthGate>;
}
