"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { AddSignatureDialog } from "@/components/signature/AddSignatureDialog";

export function WorkflowSignatureSetup({ onReady, onChange, defaultName, disabled = false }: {
  onReady: (ready: boolean) => void; onChange: () => void; defaultName?: string; disabled?: boolean;
}) {
  const [reload, setReload] = useState(0);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [savedMessage, setSavedMessage] = useState(false);
  useEffect(() => {
    let active = true;
    onReady(false);
    async function load() {
      try {
        const response = await fetch("/api/settings/signature", { cache: "no-store" });
        if (!response.ok) throw new Error("Unable to load your signature. Select Check for saved signature to try again.");
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

  function refresh() {
    onChange(); onReady(false); setPreview(null); setLoading(true); setError(null); setReload((value) => value + 1);
  }

  return <div className="space-y-3">
    {loading ? <p role="status" className="text-sm text-zinc-600">Loading your saved signature…</p> : preview ? (<>
      <p className="text-sm font-medium text-zinc-800">Using your saved signature</p>
      <Image src={preview} alt="Your saved signature" width={300} height={100} unoptimized className="h-24 w-full max-w-xs rounded border border-zinc-200 bg-white object-contain p-2" />
    </>) : <p className="text-sm text-zinc-700">You don&apos;t have a saved signature yet. Sign once here and it is saved for your future requests, compensation packets and approvals. You can draw it, upload a PNG, or type your name.</p>}
    {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <Button variant="secondary" disabled={disabled || loading} onClick={() => { onChange(); onReady(false); setShowEditor(true); setSavedMessage(false); }}>{preview ? "Change Signature" : "Sign and Save Signature"}</Button>
      <Button variant="secondary" disabled={disabled || loading} onClick={refresh}>Check for saved signature</Button>
    </div>
    {savedMessage && !loading && preview && !error ? <p role="status" className="text-sm text-green-800">Signature saved. It will be used here and on your future forms; you can change it anytime from My signature in the account menu. Confirm the acknowledgment below to continue.</p> : null}
    {showEditor ? <AddSignatureDialog defaultName={defaultName} onClose={() => { setShowEditor(false); refresh(); }} onSaved={() => {
      setShowEditor(false); setSavedMessage(true); refresh();
    }} /> : null}
  </div>;
}
