"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import type { PersonnelRecord } from "@/types/personnel";

interface StatusChangeDialogProps {
  user: PersonnelRecord | null;
  nextActive: boolean | null;
  onClose: () => void;
  onConfirm: (userId: string, active: boolean) => Promise<void>;
}

interface StatusChangeDialogContentProps {
  user: PersonnelRecord;
  nextActive: boolean;
  onClose: () => void;
  onConfirm: (userId: string, active: boolean) => Promise<void>;
}

function StatusChangeDialogContent({
  user,
  nextActive,
  onClose,
  onConfirm,
}: StatusChangeDialogContentProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const actionLabel = nextActive ? "Reactivate" : "Move to Inactive";

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isSubmitting) {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSubmitting, onClose]);

  async function handleConfirm() {
    setIsSubmitting(true);
    setError(null);

    try {
      await onConfirm(user.id, nextActive);
      onClose();
    } catch (statusError) {
      setError(
        statusError instanceof Error
          ? statusError.message
          : "Unable to update user status. Try again later.",
      );
    } finally {
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
        aria-labelledby="status-change-title"
        className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl sm:p-8"
      >
        <h2 id="status-change-title" className="text-lg font-semibold text-zinc-900">
          {actionLabel}
        </h2>
        <p className="mt-3 text-sm leading-6 text-zinc-600">
          {nextActive
            ? `Reactivate badge ${user.badgeNumber} (${user.email})?`
            : `Move badge ${user.badgeNumber} (${user.email}) to Inactive? The record will remain in the system.`}
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
              void handleConfirm();
            }}
            disabled={isSubmitting}
            className="w-full sm:w-auto sm:px-6"
          >
            {isSubmitting ? "Saving…" : actionLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function StatusChangeDialog({
  user,
  nextActive,
  onClose,
  onConfirm,
}: StatusChangeDialogProps) {
  if (!user || nextActive === null) {
    return null;
  }

  return (
    <StatusChangeDialogContent
      key={`${user.id}-${nextActive ? "active" : "inactive"}`}
      user={user}
      nextActive={nextActive}
      onClose={onClose}
      onConfirm={onConfirm}
    />
  );
}
