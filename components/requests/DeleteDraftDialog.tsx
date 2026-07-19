"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  buildDeleteDraftDialogBody,
  DELETE_DRAFT_DIALOG_TITLE,
} from "@/lib/training-request-draft-deletion";
import type { TrainingRequestRecord } from "@/types/training-request";

interface DeleteDraftDialogProps {
  request: TrainingRequestRecord | null;
  onClose: () => void;
  onConfirm: (requestId: string) => Promise<void>;
}

interface DeleteDraftDialogContentProps {
  request: TrainingRequestRecord;
  onClose: () => void;
  onConfirm: (requestId: string) => Promise<void>;
}

function DeleteDraftDialogContent({
  request,
  onClose,
  onConfirm,
}: DeleteDraftDialogContentProps) {
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
    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await onConfirm(request.id);
      onClose();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Unable to delete draft. Try again later.",
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
        aria-labelledby="delete-draft-title"
        aria-describedby="delete-draft-description"
        className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl sm:p-8"
      >
        <h2
          id="delete-draft-title"
          className="text-lg font-semibold text-zinc-900"
        >
          {DELETE_DRAFT_DIALOG_TITLE}
        </h2>
        <p
          id="delete-draft-description"
          className="mt-3 text-sm leading-6 text-zinc-600"
        >
          {buildDeleteDraftDialogBody(request.courseName)}
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
            {isSubmitting ? "Deleting…" : "Delete Draft"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function DeleteDraftDialog({
  request,
  onClose,
  onConfirm,
}: DeleteDraftDialogProps) {
  if (!request) {
    return null;
  }

  return (
    <DeleteDraftDialogContent
      key={request.id}
      request={request}
      onClose={onClose}
      onConfirm={onConfirm}
    />
  );
}
