"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import type { RoutingSlot } from "@/lib/approval-routing";

interface Person { id: string; first_name: string | null; last_name: string | null; badge_number: string; email: string }
type Routing = Record<RoutingSlot, { personnelId: string | null; candidates: Person[] }>;

const SLOTS: Array<{ slot: RoutingSlot; label: string; help: string; none: string; empty: string }> = [
  { slot: "mto", label: "Primary MTO",
    help: "Only this MTO receives MTO review emails. Other MTOs can still review and sign as backups.",
    none: "No primary — email all active MTOs", empty: "Add an active MTO in User Management first." },
  { slot: "office", label: "Primary Office",
    help: "This person receives Office emails and the Office action badge for City Authorizations and compensation coding. Other Office users can still process tasks as backups.",
    none: "No primary — alert all Office users", empty: "Assign the Office role to someone in User Management first." },
  { slot: "chief", label: "Fire Chief",
    help: "Records who the Fire Chief is. No alerts or approval steps use this yet.",
    none: "Not set", empty: "Set someone's rank to Fire Chief in User Management first." },
];

const name = (person: Person) =>
  [person.first_name, person.last_name].filter(Boolean).join(" ") || `Badge ${person.badge_number}`;

export function ApprovalRoutingSettings() {
  const [routing, setRouting] = useState<Routing | null>(null);
  const [selected, setSelected] = useState<Record<RoutingSlot, string>>({ mto: "", office: "", chief: "" });
  const [saving, setSaving] = useState<RoutingSlot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<RoutingSlot | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/admin/settings/approval-routing", { cache: "no-store" });
        if (!response.ok) throw new Error();
        const data = await response.json() as Routing;
        if (cancelled) return;
        setRouting(data);
        setSelected({ mto: data.mto.personnelId ?? "", office: data.office.personnelId ?? "", chief: data.chief.personnelId ?? "" });
      } catch { if (!cancelled) setError("Unable to load approval routing. Refresh to try again."); }
    })();
    return () => { cancelled = true; };
  }, []);

  async function save(slot: RoutingSlot) {
    if (!routing || saving) return;
    setSaving(slot); setError(null); setSaved(null);
    try {
      const personnelId = selected[slot] || null;
      const response = await fetch("/api/admin/settings/approval-routing", {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slot, personnelId }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Unable to save approval routing.");
      setRouting({ ...routing, [slot]: { ...routing[slot], personnelId } });
      setSaved(slot);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Unable to save approval routing.");
    } finally { setSaving(null); }
  }

  return <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm shadow-zinc-200/60 sm:p-8">
    <h2 className="text-lg font-semibold text-zinc-900">Approval routing</h2>
    <p className="mt-1 text-sm leading-6 text-zinc-600">
      Choose who receives alerts for each step. Everyone else in that role keeps access as a backup.
      New and unsent alerts follow a new choice; emails already sent cannot be recalled. Changes are recorded in the audit history.
    </p>
    {!routing && !error ? <p className="mt-4 text-sm text-zinc-500" role="status">Loading approval routing…</p> : null}
    {routing ? <div className="mt-5 space-y-6">{SLOTS.map(({ slot, label, help, none, empty }) => {
      const current = routing[slot];
      return <div key={slot} className="space-y-2">
        <label htmlFor={`routing-${slot}`} className="block text-sm font-medium text-zinc-700">{label}</label>
        <p className="text-sm text-zinc-500">{help}</p>
        {current.candidates.length === 0 && !current.personnelId ? <p className="text-sm text-zinc-600">{empty}</p> : <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <select id={`routing-${slot}`} value={selected[slot]} disabled={saving !== null}
              onChange={(event) => { setSelected({ ...selected, [slot]: event.target.value }); setSaved(null); }}
              className="min-h-11 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm sm:max-w-lg">
              <option value="">{none}</option>
              {current.candidates.map((person) => <option key={person.id} value={person.id}>{name(person)} — {person.email}</option>)}
            </select>
            <Button onClick={() => void save(slot)} disabled={saving !== null || selected[slot] === (current.personnelId ?? "")}>
              {saving === slot ? "Saving…" : "Save"}
            </Button>
          </div>
          {saved === slot ? <p className="text-sm text-green-800" role="status">{label} saved.</p> : null}
        </>}
      </div>;
    })}</div> : null}
    {error ? <p className="mt-4 text-sm text-red-700" role="alert">{error}</p> : null}
  </section>;
}
