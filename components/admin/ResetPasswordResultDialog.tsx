"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";

interface ResetPasswordResultDialogProps {
  temporaryPassword: string | null;
  onClose: () => void;
}

export function ResetPasswordResultDialog({
  temporaryPassword,
  onClose,
}: ResetPasswordResultDialogProps) {
  const [copyMessage, setCopyMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!temporaryPassword) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, temporaryPassword]);

  if (!temporaryPassword) {
    return null;
  }

  async function handleCopyPassword() {
    if (!temporaryPassword) {
      return;
    }

    try {
      await navigator.clipboard.writeText(temporaryPassword);
      setCopyMessage("Password copied.");
    } catch {
      setCopyMessage("Unable to copy the password.");
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-900/50 p-4 sm:items-center"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="reset-password-result-title"
        aria-describedby="reset-password-result-description"
        className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl sm:p-8"
      >
        <h2
          id="reset-password-result-title"
          className="text-lg font-semibold text-zinc-900"
        >
          Password reset successful
        </h2>
        <p
          id="reset-password-result-description"
          className="mt-3 text-sm leading-6 text-zinc-600"
        >
          Temporary password:
        </p>
        <p className="mt-2 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 font-mono text-sm break-all text-zinc-900">
          {temporaryPassword}
        </p>
        <p className="mt-3 text-sm leading-6 text-amber-900">
          This password will not be shown again. Communicate it to the user
          through a secure channel outside the portal.
        </p>

        {copyMessage ? (
          <p className="mt-3 text-sm text-green-800" role="status">
            {copyMessage}
          </p>
        ) : null}

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              void handleCopyPassword();
            }}
            className="w-full sm:w-auto sm:px-6"
          >
            Copy Password
          </Button>
          <Button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto sm:px-6"
          >
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}
