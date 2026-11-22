"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { WorkflowSignatureSetup } from "@/components/signature/WorkflowSignatureSetup";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import type { AuthenticatedPersonnel } from "@/lib/auth/personnel";
import { formatPersonnelFullName } from "@/lib/personnel";
import type { WorkflowActionKind } from "@/lib/training-request-workflow";

interface WorkflowActionDialogProps {
  action: WorkflowActionKind | null;
  personnel: AuthenticatedPersonnel;
  onClose: () => void;
  onConfirm: (input: {
    action: WorkflowActionKind;
    comments: string;
    electronicSignatureConfirmed: boolean;
  }) => Promise<void>;
}

function getActionCopy(action: WorkflowActionKind) {
  switch (action) {
    case "mto_approve":
      return {
        title: "Sign and Approve as MTO",
        description:
          "Confirm that you are electronically signing this approval as the assigned MTO reviewer.",
        confirmLabel: "Sign and Approve as MTO",
        requireComments: false,
        requireSignature: true,
        destructive: false,
      };
    case "deputy_approve":
      return {
        title: "Sign and Approve as Deputy Chief",
        description:
          "Confirm that you are electronically signing this approval as the assigned Deputy Chief reviewer.",
        confirmLabel: "Sign and Approve as Deputy Chief",
        requireComments: false,
        requireSignature: true,
        destructive: false,
      };
    case "mto_return":
    case "deputy_return":
      return {
        title: "Return for Correction",
        description:
          "Return this request to the requester with required correction comments.",
        confirmLabel: "Return for Correction",
        requireComments: true,
        requireSignature: false,
        destructive: false,
      };
    case "mto_deny":
    case "deputy_deny":
      return {
        title: "Sign and Deny Request",
        description:
          "Deny this request with your electronic signature and required comments explaining the decision.",
        confirmLabel: "Sign and Deny Request",
        requireComments: true,
        requireSignature: true,
        destructive: true,
      };
    case "change_to_denied":
      return {
        title: "Change Decision to Denied",
        description:
          "This approved request will become Denied. The requester is emailed your reason. Approved forms are no longer available to them.",
        confirmLabel: "Sign and Change to Denied",
        requireComments: true,
        requireSignature: true,
        destructive: true,
        commentsLabel: "Reason for change",
      };
    case "change_to_approved":
      return {
        title: "Change Decision to Approved",
        description:
          "You are signing your approval. If the other reviewer (MTO or Deputy Chief) has no current approval, the request goes to their queue to sign; otherwise it is approved now and new forms are emailed.",
        confirmLabel: "Sign and Change to Approved",
        requireComments: true,
        requireSignature: true,
        destructive: false,
        commentsLabel: "Reason for change",
      };
    case "resign_expenses":
      return {
        title: "Sign Updated Expenses",
        description:
          "Your signature re-approves this request with the new estimated expenses. New approved forms are generated and emailed to the requester.",
        confirmLabel: "Sign Updated Expenses",
        requireComments: true,
        requireSignature: true,
        destructive: false,
        commentsLabel: "Reason for expense changes",
      };
    default:
      return {
        title: "Confirm Action",
        description: "Confirm this workflow action.",
        confirmLabel: "Confirm",
        requireComments: false,
        requireSignature: false,
        destructive: false,
      };
  }
}

function WorkflowActionDialogContent({
  action,
  personnel,
  onClose,
  onConfirm,
}: {
  action: WorkflowActionKind;
  personnel: AuthenticatedPersonnel;
  onClose: () => void;
  onConfirm: WorkflowActionDialogProps["onConfirm"];
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [signatureReady, setSignatureReady] = useState(false);
  const [comments, setComments] = useState("");
  const [electronicSignatureConfirmed, setElectronicSignatureConfirmed] =
    useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const copy = getActionCopy(action);
  const signerName = formatPersonnelFullName(personnel);

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  async function handleConfirm() {
    if (isSubmitting) return;
    if (copy.requireSignature && !signatureReady) {
      setError("Add your signature before signing this action.");
      return;
    }
    if (copy.requireComments && !comments.trim()) {
      setError("Comments are required for this action.");
      return;
    }

    if (copy.requireSignature && !electronicSignatureConfirmed) {
      setError("You must confirm the electronic signature acknowledgment.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await onConfirm({
        action,
        comments: comments.trim(),
        electronicSignatureConfirmed,
      });
      onClose();
    } catch (confirmError) {
      setError(
        confirmError instanceof Error
          ? confirmError.message
          : "Unable to complete this workflow action.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return createPortal(
    <dialog
      ref={dialog}
      onCancel={(event) => { event.preventDefault(); if (!isSubmitting) onClose(); }}
      aria-labelledby="workflow-action-title"
      className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl border-0 bg-white p-6 shadow-xl backdrop:bg-black/50 sm:p-8"
    >
        <h2 id="workflow-action-title" className="text-lg font-semibold text-zinc-900">
          {copy.title}
        </h2>
        <p className="mt-3 text-sm leading-6 text-zinc-600">{copy.description}</p>

        {copy.requireSignature ? (
          <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
            <p className="text-sm text-zinc-700">
              You are signing as{" "}
              <span className="font-semibold text-zinc-900">{signerName}</span>{" "}
              · Badge{" "}
              <span className="font-semibold text-zinc-900">
                {personnel.badgeNumber}
              </span>
            </p>
            <div className="mt-4">
              <WorkflowSignatureSetup defaultName={signerName ?? undefined} onReady={setSignatureReady} onChange={() => setElectronicSignatureConfirmed(false)} disabled={isSubmitting} />
            </div>
            <label className="mt-4 flex items-start gap-3 text-sm text-zinc-700">
              <input
                type="checkbox"
                checked={electronicSignatureConfirmed}
                onChange={(event) =>
                  setElectronicSignatureConfirmed(event.target.checked)
                }
                disabled={isSubmitting || !signatureReady}
                className="mt-1 h-4 w-4 rounded border-zinc-300 text-red-700 focus:ring-red-700"
              />
              <span>
                I confirm that I am electronically signing this workflow action using my
                authenticated IFD identity.
              </span>
            </label>
          </div>
        ) : null}

        <div className="mt-4">
          <label
            htmlFor="workflow-action-comments"
            className="text-sm font-medium text-zinc-900"
          >
            {"commentsLabel" in copy ? copy.commentsLabel : "Comments"}
            {copy.requireComments ? " (required)" : " (optional)"}
          </label>
          <Textarea
            id="workflow-action-comments"
            value={comments}
            onChange={(event) => setComments(event.target.value)}
            disabled={isSubmitting}
            className="mt-2 min-h-28"
            placeholder={
              copy.requireComments
                ? "Enter the comments that will be shared with the requester."
                : "Optional comments for the action history."
            }
          />
        </div>

        {error ? (
          <p className="mt-4 text-sm text-red-700" role="alert">
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant={copy.destructive ? "danger" : "primary"}
            onClick={() => void handleConfirm()}
            disabled={isSubmitting || (copy.requireSignature && (!signatureReady || !electronicSignatureConfirmed))}
          >
            {isSubmitting ? "Processing..." : copy.confirmLabel}
          </Button>
        </div>
    </dialog>, document.body
  );
}

export function WorkflowActionDialog({
  action,
  personnel,
  onClose,
  onConfirm,
}: WorkflowActionDialogProps) {
  if (!action) {
    return null;
  }

  return (
    <WorkflowActionDialogContent
      key={action}
      action={action}
      personnel={personnel}
      onClose={onClose}
      onConfirm={onConfirm}
    />
  );
}
