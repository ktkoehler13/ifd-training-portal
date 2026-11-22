"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { drawTypedSignature, normalizeSignatureName, SIGNATURE_NAME_MAX_LENGTH } from "@/lib/personnel-signature-text";
import { mapSignatureErrorForUser, normalizeSignatureCanvas } from "@/lib/personnel-signature-normalize";

export function SignatureCreateCanvas({ defaultName = "", disabled, saveDisabled, onSave }: {
  defaultName?: string; disabled: boolean; saveDisabled: boolean; onSave: (blob: Blob) => Promise<void>;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [name, setName] = useState(defaultName.slice(0, SIGNATURE_NAME_MAX_LENGTH));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (canvas.current) drawTypedSignature(canvas.current, name);
  }, [name]);

  async function save() {
    if (!canvas.current || saving || saveDisabled || disabled) return;
    setSaving(true); setError(null);
    try {
      if (!drawTypedSignature(canvas.current, name)) throw new Error("Enter your name to create a signature.");
      const normalized = await normalizeSignatureCanvas(canvas.current);
      await onSave(normalized.blob);
    } catch (failure) { setError(mapSignatureErrorForUser(failure)); }
    finally { setSaving(false); }
  }

  return <div className="space-y-4">
    <label className="block text-sm font-medium text-zinc-700" htmlFor="signature-create-name">Your name</label>
    <Input id="signature-create-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={SIGNATURE_NAME_MAX_LENGTH} autoComplete="name" disabled={disabled || saving} />
    <p className="text-sm text-zinc-600">Type your name and review the signature below. Select Sign and Save Signature to save it for future requests, compensation packets and approvals.</p>
    <canvas ref={canvas} width={900} height={220} aria-label="Created signature preview" className="w-full rounded-xl border border-zinc-300 bg-white" />
    {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
    <Button disabled={disabled || saveDisabled || saving || !normalizeSignatureName(name)} onClick={() => void save()}>{saving ? "Saving…" : "Sign and Save Signature"}</Button>
  </div>;
}
