"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { AuthGate } from "@/components/layout/AuthGate";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { PASSWORD_CHANGE_SUCCESS_MESSAGE } from "@/lib/auth/password";
import type { AuthenticatedPersonnel } from "@/lib/auth/personnel";

interface ChangePasswordContentProps {
  personnel: AuthenticatedPersonnel;
}

function ChangePasswordContent({ personnel }: ChangePasswordContentProps) {
  const forcedPasswordSetup = personnel.mustChangePassword;
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    setError(null);
    setSuccessMessage(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          currentPassword: forcedPasswordSetup ? undefined : currentPassword,
          newPassword,
          confirmPassword,
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        message?: string;
      };

      if (!response.ok) {
        setError(payload.error ?? "Unable to update password.");
        return;
      }

      setSuccessMessage(payload.message ?? PASSWORD_CHANGE_SUCCESS_MESSAGE);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");

      if (forcedPasswordSetup) {
        window.location.assign("/dashboard");
      }
    } catch {
      setError("Unable to update password. Try again later.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col bg-zinc-100">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-6">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl">
              {forcedPasswordSetup ? "Choose a New Password" : "Change Password"}
            </h1>
            <p className="mt-1 text-sm text-zinc-600">
              {forcedPasswordSetup
                ? "Your account is using a temporary password. Choose a new password before continuing."
                : "Update your account password. You sign in with badge number and password; your department email remains linked to Supabase Auth internally."}
            </p>
          </div>
          {!forcedPasswordSetup ? (
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <Link
                href="/dashboard"
                className="inline-flex h-11 items-center justify-center rounded-xl border border-zinc-200 bg-white px-5 text-sm font-semibold text-zinc-800 shadow-sm transition-colors hover:bg-zinc-50"
              >
                Dashboard
              </Link>
              <SignOutButton className="px-5" />
            </div>
          ) : null}
        </div>
      </header>

      <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6">
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl bg-white p-6 shadow-sm shadow-zinc-200/60 sm:p-8"
          noValidate
        >
          <div className="space-y-4">
            {!forcedPasswordSetup ? (
              <div className="space-y-2">
                <label
                  htmlFor="current-password"
                  className="block text-sm font-medium text-zinc-700"
                >
                  Current Password
                </label>
                <div className="relative">
                  <Input
                    id="current-password"
                    type={showCurrentPassword ? "text" : "password"}
                    value={currentPassword}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                    autoComplete="current-password"
                    disabled={isSubmitting}
                    className="pr-24"
                  />
                  <button
                    type="button"
                    className="absolute top-1/2 right-3 -translate-y-1/2 text-xs font-semibold text-zinc-600"
                    onClick={() => setShowCurrentPassword((current) => !current)}
                    disabled={isSubmitting}
                  >
                    {showCurrentPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </div>
            ) : null}

            <div className="space-y-2">
              <label
                htmlFor="new-password"
                className="block text-sm font-medium text-zinc-700"
              >
                New Password
              </label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={showNewPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  autoComplete="new-password"
                  disabled={isSubmitting}
                  className="pr-24"
                />
                <button
                  type="button"
                  className="absolute top-1/2 right-3 -translate-y-1/2 text-xs font-semibold text-zinc-600"
                  onClick={() => setShowNewPassword((current) => !current)}
                  disabled={isSubmitting}
                >
                  {showNewPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label
                htmlFor="confirm-password"
                className="block text-sm font-medium text-zinc-700"
              >
                Confirm New Password
              </label>
              <div className="relative">
                <Input
                  id="confirm-password"
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  autoComplete="new-password"
                  disabled={isSubmitting}
                  className="pr-24"
                />
                <button
                  type="button"
                  className="absolute top-1/2 right-3 -translate-y-1/2 text-xs font-semibold text-zinc-600"
                  onClick={() => setShowConfirmPassword((current) => !current)}
                  disabled={isSubmitting}
                >
                  {showConfirmPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            <p className="text-sm text-zinc-600">
              Password must be at least 12 characters and include upper- and
              lowercase letters, a number, and a special character.
            </p>

            {successMessage ? (
              <p className="text-sm text-green-800" role="status">
                {successMessage}
              </p>
            ) : null}

            {error ? (
              <p className="text-sm text-red-700" role="alert">
                {error}
              </p>
            ) : null}

            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting
                ? "Updating…"
                : forcedPasswordSetup
                  ? "Save New Password"
                  : "Update Password"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function ChangePasswordView() {
  return (
    <AuthGate>
      {(personnel) => <ChangePasswordContent personnel={personnel} />}
    </AuthGate>
  );
}
