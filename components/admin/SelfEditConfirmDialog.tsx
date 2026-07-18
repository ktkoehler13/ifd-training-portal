"use client";

import { Button } from "@/components/ui/Button";
import {
  SELF_EDIT_EMAIL_CONFIRM_MESSAGE,
  SELF_EDIT_IDENTITY_CONFIRM_MESSAGE,
} from "@/lib/personnel";

interface SelfEditConfirmDialogProps {
  variant: "email" | "identity";
  isSubmitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function SelfEditConfirmDialog({
  variant,
  isSubmitting,
  onCancel,
  onConfirm,
}: SelfEditConfirmDialogProps) {
  const title =
    variant === "email" ? "Confirm Email Change" : "Confirm Identity Change";
  const message =
    variant === "email"
      ? SELF_EDIT_EMAIL_CONFIRM_MESSAGE
      : SELF_EDIT_IDENTITY_CONFIRM_MESSAGE;
  const confirmLabel =
    variant === "email" ? "Update Email and Sign Out" : "Save Identity Changes";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-zinc-900/50 p-4 sm:items-center"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget && !isSubmitting) {
          onCancel();
        }
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="self-edit-confirm-title"
        aria-describedby="self-edit-confirm-description"
        className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl sm:p-8"
      >
        <h3 id="self-edit-confirm-title" className="text-lg font-semibold text-zinc-900">
          {title}
        </h3>
        <p
          id="self-edit-confirm-description"
          className="mt-3 text-sm leading-6 text-zinc-600"
        >
          {message}
        </p>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="secondary"
            onClick={onCancel}
            disabled={isSubmitting}
            className="w-full sm:w-auto sm:px-6"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            disabled={isSubmitting}
            className="w-full sm:w-auto sm:px-6"
          >
            {isSubmitting ? "Saving…" : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
