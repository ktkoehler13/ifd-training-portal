"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { formatPersonnelFullName } from "@/lib/personnel";
import type { PersonnelRecord } from "@/types/personnel";

interface ResetPasswordConfirmDialogProps {
  user: PersonnelRecord | null;
  onClose: () => void;
  onConfirm: (userId: string) => Promise<void>;
}

interface ResetPasswordConfirmDialogContentProps {
  user: PersonnelRecord;
  onClose: () => void;
  onConfirm: (userId: string) => Promise<void>;
}

function ResetPasswordConfirmDialogContent({
  user,
  onClose,
  onConfirm,
}: ResetPasswordConfirmDialogContentProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const displayName =
    formatPersonnelFullName(user) ?? `Badge ${user.badgeNumber}`;

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isSubmitting) {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSubmitting, onClose]);

  async function handleReset() {
    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await onConfirm(user.id);
    } catch (resetError) {
      setError(
        resetError instanceof Error
          ? resetError.message
          : "Unable to reset password.",
      );
      setIsSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-900/50 p-4 sm:items-center"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget && !isSubmitting) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="reset-password-title"
        aria-describedby="reset-password-description"
        className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl sm:p-8"
      >
        <h2
          id="reset-password-title"
          className="text-lg font-semibold text-zinc-900"
        >
          Reset password?
        </h2>
        <p
          id="reset-password-description"
          className="mt-3 text-sm leading-6 text-zinc-600"
        >
          This will replace the current password for {displayName} and generate
          a new temporary password. The user will need this temporary password
          to sign in.
        </p>

        {error ? (
          <p role="alert" className="mt-4 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={isSubmitting}
            className="w-full sm:w-auto sm:px-6"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => {
              void handleReset();
            }}
            disabled={isSubmitting}
            className="w-full border border-red-200 bg-red-700 hover:bg-red-800 sm:w-auto sm:px-6"
          >
            {isSubmitting ? "Resetting…" : "Reset Password"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function ResetPasswordConfirmDialog({
  user,
  onClose,
  onConfirm,
}: ResetPasswordConfirmDialogProps) {
  if (!user) {
    return null;
  }

  return (
    <ResetPasswordConfirmDialogContent
      key={user.id}
      user={user}
      onClose={onClose}
      onConfirm={onConfirm}
    />
  );
}
