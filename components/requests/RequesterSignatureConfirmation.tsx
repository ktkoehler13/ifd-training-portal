"use client";

import { useCallback, useState } from "react";
import { WorkflowSignatureSetup } from "@/components/signature/WorkflowSignatureSetup";

export function RequesterSignatureConfirmation({ confirmed, onConfirm, onReady, defaultName }: {
  confirmed: boolean;
  defaultName?: string;
  onConfirm: (value: boolean) => void;
  onReady: (value: boolean) => void;
}) {
  const [ready, setReady] = useState(false);
  const updateReady = useCallback((value: boolean) => { setReady(value); onReady(value); }, [onReady]);
  return <div className="space-y-3 border-b border-zinc-200 pb-4">
    <h4 className="text-sm font-semibold text-zinc-900">Sign your Training Authorization Letter</h4>
    <p className="text-sm leading-6 text-zinc-700">I have read, fully understand, and agree with the information in this request. I understand the importance of safety during training and acknowledge that an instructor may remove me from a simulation or course if my behavior or abilities may cause a safety risk to myself or another.</p>
    <WorkflowSignatureSetup defaultName={defaultName} onReady={updateReady} onChange={() => onConfirm(false)} />
    <label className="flex items-start gap-3 text-sm text-zinc-800">
      <input type="checkbox" checked={confirmed} disabled={!ready}
        onChange={(event) => onConfirm(event.target.checked)}
        className="mt-0.5 h-5 w-5 shrink-0 rounded border-zinc-300 text-red-700 focus:ring-red-700" />
      <span>I agree to the student acknowledgment above and authorize my saved signature on this Training Authorization Letter. The printed date will be the final department approval date.</span>
    </label>
  </div>;
}
