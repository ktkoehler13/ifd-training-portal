"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SignatureDrawCanvas } from "@/components/signature/SignatureDrawCanvas";
import { Button } from "@/components/ui/Button";
import { savePersonnelSignature } from "@/lib/personnel-signature";
import { mapSignatureErrorForUser, normalizeSignatureFile } from "@/lib/personnel-signature-normalize";
import { validateSignatureFileForUpload } from "@/lib/personnel-signature-validation";

export function AddSignatureDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const saving = useRef(false);
  const [method, setMethod] = useState<"draw" | "upload">("draw");
  const [certified, setCertified] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  async function save(blob?: Blob) {
    if (saving.current || !certified) return;
    saving.current = true; setBusy(true); setError(null);
    try {
      let selected = blob;
      if (!selected) {
        if (!file) throw new Error("Choose a PNG signature file first.");
        const validation = await validateSignatureFileForUpload(file);
        if (!validation.valid) throw new Error(validation.error ?? "Invalid signature file.");
        selected = (await normalizeSignatureFile(file)).blob;
      }
      await savePersonnelSignature({ blob: selected, originalFilename: blob ? "signature.png" : file?.name, certificationConfirmed: true });
      onSaved();
    } catch (failure) { setError(mapSignatureErrorForUser(failure)); }
    finally { saving.current = false; setBusy(false); }
  }

  return createPortal(<dialog ref={dialog} aria-labelledby="add-signature-title"
    onCancel={(event) => { event.preventDefault(); if (!saving.current) onClose(); }}
    className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-2xl border-0 bg-white p-5 shadow-xl backdrop:bg-black/50 sm:p-7">
    <div className="flex items-start justify-between gap-4">
      <h2 id="add-signature-title" className="text-xl font-semibold text-zinc-900">Add your signature</h2>
      <Button variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button>
    </div>
    <p className="mt-3 text-sm leading-6 text-zinc-600">Draw or upload your signature, then select Add Signature. This window will close and your training request will be ready to continue.</p>
    <div className="mt-5 flex gap-3">
      <Button variant={method === "draw" ? "primary" : "secondary"} disabled={busy} onClick={() => setMethod("draw")}>Draw signature</Button>
      <Button variant={method === "upload" ? "primary" : "secondary"} disabled={busy} onClick={() => setMethod("upload")}>Upload PNG</Button>
    </div>
    <label className="my-5 flex items-start gap-3 text-sm leading-6 text-zinc-800">
      <input type="checkbox" checked={certified} disabled={busy} onChange={(event) => setCertified(event.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-red-700" />
      <span>I certify that this is my official signature and authorize the IFD Training Portal to place it on training documents I electronically sign or approve.</span>
    </label>
    {method === "draw" ? <SignatureDrawCanvas compact disabled={busy || !certified} saveLabel="Add Signature" onSave={save} /> : <div className="space-y-4">
      <label className="block text-sm font-medium text-zinc-700">Signature PNG
        <input type="file" accept="image/png,.png" disabled={busy} onChange={(event) => { setFile(event.target.files?.[0] ?? null); setError(null); }} className="mt-2 block w-full text-sm" />
      </label>
      <Button disabled={busy || !certified || !file} onClick={() => void save()}>{busy ? "Saving…" : "Add Signature"}</Button>
    </div>}
    {error ? <p role="alert" className="mt-4 text-sm text-red-700">{error}</p> : null}
  </dialog>, document.body);
}
