"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import type { PersonnelRecord } from "@/types/personnel";

interface DeleteUserDialogProps {
  user: PersonnelRecord | null;
  onClose: () => void;
  onConfirm: (userId: string) => Promise<void>;
}

interface DeleteUserDialogContentProps {
  user: PersonnelRecord;
  onClose: () => void;
  onConfirm: (userId: string) => Promise<void>;
}

function DeleteUserDialogContent({
  user,
  onClose,
  onConfirm,
}: DeleteUserDialogContentProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isSubmitting) {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSubmitting, onClose]);

  async function handleDelete() {
    setIsSubmitting(true);
    setError(null);

    try {
      await onConfirm(user.id);
      onClose();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Unable to delete user. Try again later.",
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
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-user-title"
        aria-describedby="delete-user-description"
        className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl sm:p-8"
      >
        <h2 id="delete-user-title" className="text-lg font-semibold text-zinc-900">
          Delete User
        </h2>
        <p id="delete-user-description" className="mt-3 text-sm leading-6 text-zinc-600">
          This permanently removes the personnel record for badge{" "}
          <span className="font-medium text-zinc-900">{user.badgeNumber}</span>{" "}
          ({user.email}). This action cannot be undone.
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
              void handleDelete();
            }}
            disabled={isSubmitting}
            className="w-full border border-red-200 bg-red-700 hover:bg-red-800 sm:w-auto sm:px-6"
          >
            {isSubmitting ? "Deleting…" : "Permanently Delete"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function DeleteUserDialog({
  user,
  onClose,
  onConfirm,
}: DeleteUserDialogProps) {
  if (!user) {
    return null;
  }

  return (
    <DeleteUserDialogContent
      key={user.id}
      user={user}
      onClose={onClose}
      onConfirm={onConfirm}
    />
  );
}
