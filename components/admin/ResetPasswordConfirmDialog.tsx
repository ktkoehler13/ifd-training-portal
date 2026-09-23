"use client";

import { FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  INITIAL_PASSWORD_MISMATCH_MESSAGE,
  validateInitialPassword,
} from "@/lib/auth/password";
import { formatPersonnelFullName } from "@/lib/personnel";
import type { PersonnelRecord } from "@/types/personnel";

interface ResetPasswordConfirmDialogProps {
  user: PersonnelRecord | null;
  onClose: () => void;
  onConfirm: (userId: string, temporaryPassword: string) => Promise<void>;
}

interface ResetPasswordConfirmDialogContentProps {
  user: PersonnelRecord;
  onClose: () => void;
  onConfirm: (userId: string, temporaryPassword: string) => Promise<void>;
}

function ResetPasswordConfirmDialogContent({
  user,
  onClose,
  onConfirm,
}: ResetPasswordConfirmDialogContentProps) {
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [confirmTemporaryPassword, setConfirmTemporaryPassword] = useState("");
  const [showTemporaryPassword, setShowTemporaryPassword] = useState(false);
  const [showConfirmTemporaryPassword, setShowConfirmTemporaryPassword] =
    useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    setFieldError(null);

    const passwordError = validateInitialPassword(temporaryPassword);
    if (passwordError) {
      setFieldError(passwordError);
      return;
    }

    if (temporaryPassword !== confirmTemporaryPassword) {
      setFieldError(INITIAL_PASSWORD_MISMATCH_MESSAGE);
      return;
    }

    setIsSubmitting(true);

    try {
      await onConfirm(user.id, temporaryPassword);
      setTemporaryPassword("");
      setConfirmTemporaryPassword("");
    } catch (resetError) {
      setFieldError(
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
          Reset password
        </h2>
        <p
          id="reset-password-description"
          className="mt-3 text-sm leading-6 text-zinc-600"
        >
          Set a new temporary password for {displayName}. The user must sign in
          with this password and will be prompted to choose a permanent password.
          No recovery email will be sent.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
          <div className="space-y-2">
            <label
              htmlFor="admin-reset-temporary-password"
              className="block text-sm font-medium text-zinc-700"
            >
              New temporary password
            </label>
            <div className="relative">
              <Input
                id="admin-reset-temporary-password"
                type={showTemporaryPassword ? "text" : "password"}
                value={temporaryPassword}
                onChange={(event) => setTemporaryPassword(event.target.value)}
                autoComplete="new-password"
                disabled={isSubmitting}
                className="pr-24"
              />
              <button
                type="button"
                className="absolute top-1/2 right-3 -translate-y-1/2 text-xs font-semibold text-zinc-600"
                onClick={() => setShowTemporaryPassword((current) => !current)}
                disabled={isSubmitting}
              >
                {showTemporaryPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label
              htmlFor="admin-reset-confirm-temporary-password"
              className="block text-sm font-medium text-zinc-700"
            >
              Confirm temporary password
            </label>
            <div className="relative">
              <Input
                id="admin-reset-confirm-temporary-password"
                type={showConfirmTemporaryPassword ? "text" : "password"}
                value={confirmTemporaryPassword}
                onChange={(event) =>
                  setConfirmTemporaryPassword(event.target.value)
                }
                autoComplete="new-password"
                disabled={isSubmitting}
                className="pr-24"
              />
              <button
                type="button"
                className="absolute top-1/2 right-3 -translate-y-1/2 text-xs font-semibold text-zinc-600"
                onClick={() =>
                  setShowConfirmTemporaryPassword((current) => !current)
                }
                disabled={isSubmitting}
              >
                {showConfirmTemporaryPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          <p className="text-sm text-zinc-600">
            Temporary passwords must be at least 6 characters.
          </p>

          {fieldError ? (
            <p role="alert" className="text-sm text-red-700">
              {fieldError}
            </p>
          ) : null}

          <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
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
              type="submit"
              disabled={isSubmitting}
              className="w-full border border-red-200 bg-red-700 hover:bg-red-800 sm:w-auto sm:px-6"
            >
              {isSubmitting ? "Resetting…" : "Reset Password"}
            </Button>
          </div>
        </form>
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
