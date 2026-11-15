"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { formatTrainingRequestIdentifier } from "@/lib/training-requests";
import type { TrainingRequestRecord } from "@/types/training-request";

export function RequestDeletionDialog({ request, onClose, onConfirm }: {
  request: TrainingRequestRecord;
  onClose: () => void;
  onConfirm: (request: TrainingRequestRecord, deleted: boolean, reason: string) => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const busy = useRef(false);
  const [reason, setReason] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const restoring = Boolean(request.deletedAt);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = dialog.current;
    element?.showModal();
    return () => { element?.close(); previous?.focus(); };
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy.current) return;
    if (!reason.trim()) { setError("Enter a reason for this action."); return; }
    busy.current = true; setIsSaving(true); setError(null);
    try { await onConfirm(request, !restoring, reason); onClose(); }
    catch (error) { setError(error instanceof Error ? error.message : "Unable to update this request."); }
    finally { busy.current = false; setIsSaving(false); }
  }
  return <dialog ref={dialog} aria-labelledby="request-deletion-title" aria-describedby="request-deletion-description"
    onCancel={(event) => { event.preventDefault(); if (!busy.current) onClose(); }}
    className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl border border-zinc-200 bg-white p-6 text-zinc-900 shadow-xl backdrop:bg-zinc-900/50 sm:p-8">
    <form onSubmit={submit} className="space-y-5">
      <h2 id="request-deletion-title" className="text-xl font-semibold">{restoring ? "Restore request?" : "Delete request?"}</h2>
      <div className="rounded-xl bg-zinc-50 p-3 text-sm">
        <p className="font-semibold">{request.courseName || "Untitled course"}</p>
        <p>{request.requesterName} · {formatTrainingRequestIdentifier(request)}</p>
      </div>
      <p id="request-deletion-description" className="text-sm leading-6 text-zinc-600">
        {restoring ? "This returns the request to its original status and normal lists. Pending action alerts can resume; previous approval or denial emails will not be resent."
          : "This moves the request to Deleted Requests and stops pending alerts. Its forms, signatures, and history are preserved. An Admin can restore it later."}
      </p>
      <div className="space-y-2">
        <label htmlFor="request-deletion-reason" className="block text-sm font-medium">Reason</label>
        <textarea id="request-deletion-reason" required maxLength={1000} rows={3} value={reason} disabled={isSaving}
          onChange={(event) => setReason(event.target.value)} className="w-full rounded-xl border border-zinc-300 p-3 text-sm focus:outline-red-700" />
      </div>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <div className="flex justify-end gap-3">
        <Button type="button" variant="secondary" onClick={onClose} disabled={isSaving} className="px-5">Cancel</Button>
        <Button type="submit" disabled={isSaving || !reason.trim()} className="px-5">{isSaving ? "Saving…" : restoring ? "Restore Request" : "Delete Request"}</Button>
      </div>
    </form>
  </dialog>;
}
