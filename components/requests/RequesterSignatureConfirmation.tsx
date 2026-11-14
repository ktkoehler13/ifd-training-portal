"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";

export function RequesterSignatureConfirmation({ confirmed, onConfirm, onReady }: {
  confirmed: boolean;
  onConfirm: (value: boolean) => void;
  onReady: (value: boolean) => void;
}) {
  const [reload, setReload] = useState(0);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    onReady(false);
    async function load() {
      try {
        const response = await fetch("/api/settings/signature", { cache: "no-store" });
        if (!response.ok) throw new Error("Unable to load your signature. Try checking again.");
        const data = await response.json() as { signature?: unknown; previewUrl?: string | null };
        if (!active) return;
        const ready = Boolean(data.signature && data.previewUrl);
        setPreview(ready ? data.previewUrl! : null);
        onReady(ready);
      } catch (failure) {
        if (active) setError(failure instanceof Error ? failure.message : "Unable to load your signature.");
      } finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; onReady(false); };
  }, [reload, onReady]);
  return <div className="space-y-3 border-b border-zinc-200 pb-4">
    <h4 className="text-sm font-semibold text-zinc-900">Sign your Training Authorization Letter</h4>
    <p className="text-sm leading-6 text-zinc-700">I have read, fully understand, and agree with the information in this request. I understand the importance of safety during training and acknowledge that an instructor may remove me from a simulation or course if my behavior or abilities may cause a safety risk to myself or another.</p>
    {loading ? <p role="status" className="text-sm text-zinc-600">Loading your saved signature…</p> : preview ? (
      <Image src={preview} alt="Your saved signature" width={300} height={100} unoptimized className="h-24 w-full max-w-xs rounded border border-zinc-200 bg-white object-contain p-2" />
    ) : <p className="text-sm text-zinc-700">Save your signature before submitting this state-run course request.</p>}
    {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <a href="/settings/signature" target="_blank" rel="noopener noreferrer" className="font-semibold text-red-700 underline">Set up or update my signature (opens a new tab)</a>
      <Button type="button" variant="secondary" disabled={loading} onClick={() => {
        onConfirm(false); onReady(false); setLoading(true); setError(null); setReload((value) => value + 1);
      }}>Check for saved signature</Button>
    </div>
    <label className="flex items-start gap-3 text-sm text-zinc-800">
      <input type="checkbox" checked={confirmed} disabled={loading || !preview || Boolean(error)}
        onChange={(event) => onConfirm(event.target.checked)}
        className="mt-0.5 h-5 w-5 shrink-0 rounded border-zinc-300 text-red-700 focus:ring-red-700" />
      <span>I agree to the student acknowledgment above and authorize my saved signature on this Training Authorization Letter. The printed date will be the final department approval date.</span>
    </label>
  </div>;
}
