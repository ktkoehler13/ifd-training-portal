"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";

interface Deputy {
  id: string;
  first_name: string | null;
  last_name: string | null;
  badge_number: string;
  email: string;
}

export function DeputyChiefApprovalSettings() {
  const [deputies, setDeputies] = useState<Deputy[]>([]);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch("/api/admin/settings/deputy-chief-approver");
        if (!response.ok) throw new Error("Unable to load Deputy Chief approval settings.");
        const data = await response.json() as { personnelId: string | null; deputies: Deputy[] };
        if (cancelled) return;
        setSavedId(data.personnelId);
        setSelectedId(data.personnelId ?? "");
        setDeputies(data.deputies);
      } catch {
        if (!cancelled) setError("Unable to load Deputy Chief approval settings. Refresh to try again.");
      } finally { if (!cancelled) setLoading(false); }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  async function save() {
    if (!selectedId || saving) return;
    setSaving(true); setError(null); setSuccess(false);
    try {
      const response = await fetch("/api/admin/settings/deputy-chief-approver", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personnelId: selectedId }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Unable to save approval settings.");
      setSavedId(selectedId); setSuccess(true);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Unable to save approval settings.");
    } finally { setSaving(false); }
  }

  return <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm shadow-zinc-200/60 sm:p-8">
    <h2 className="text-lg font-semibold text-zinc-900">Deputy Chief approval alerts</h2>
    <p className="mt-1 text-sm leading-6 text-zinc-600">
      Choose the Deputy Chief responsible for routine training approvals. Only this person
      receives Deputy Chief approval emails. Other Deputy Chiefs can still review and approve
      requests as a backup.
    </p>
    {loading ? <p className="mt-4 text-sm text-zinc-500" role="status">Loading Deputy Chiefs…</p> : null}
    {!loading && deputies.length > 0 ? <div className="mt-5 space-y-4">
      {!savedId ? <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
        No Deputy Chief has been designated yet. All active Deputy Chiefs continue to receive approval alerts until you save a selection.
      </p> : null}
      <div>
        <label htmlFor="approval-deputy" className="block text-sm font-medium text-zinc-700">Primary Deputy Chief</label>
        <select id="approval-deputy" value={selectedId} disabled={saving}
          onChange={(event) => { setSelectedId(event.target.value); setSuccess(false); }}
          className="mt-2 min-h-11 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm sm:max-w-lg">
          <option value="" disabled>Choose a Deputy Chief</option>
          {deputies.map((person) => <option key={person.id} value={person.id}>
            {[person.first_name, person.last_name].filter(Boolean).join(" ") || `Badge ${person.badge_number}`} — {person.email}
          </option>)}
        </select>
      </div>
      <p className="text-sm text-zinc-500">New and unsent approval alerts go to the selected Deputy Chief. Emails already sent cannot be recalled. Changes are recorded in the audit history.</p>
      <Button onClick={save} disabled={saving || !selectedId || selectedId === savedId}>
        {saving ? "Saving…" : "Save approval recipient"}
      </Button>
    </div> : !loading && !error ? <p className="mt-4 text-sm text-zinc-600">Add an active Deputy Chief in User Management first.</p> : null}
    {error ? <p className="mt-4 text-sm text-red-700" role="alert">{error}</p> : null}
    {success ? <p className="mt-4 text-sm text-green-800" role="status">Approval recipient saved. Other Deputy Chiefs remain available as backups.</p> : null}
  </section>;
}
