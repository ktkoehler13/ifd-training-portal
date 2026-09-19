"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  PASSWORD_RECOVERY_FAILED_MESSAGE,
  PASSWORD_RECOVERY_REQUEST_SUCCESS_MESSAGE,
} from "@/lib/auth/password-recovery-messages";

const SUBMIT_COOLDOWN_MS = 1_000;

export function PasswordRecoveryRequestView() {
  const [badgeNumber, setBadgeNumber] = useState("");
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastSubmittedAt, setLastSubmittedAt] = useState<number | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    if (
      lastSubmittedAt !== null &&
      Date.now() - lastSubmittedAt < SUBMIT_COOLDOWN_MS
    ) {
      return;
    }

    setError(null);
    setSuccessMessage(null);
    setIsSubmitting(true);
    setLastSubmittedAt(Date.now());

    try {
      const response = await fetch("/api/auth/request-password-recovery", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          badgeNumber: badgeNumber.trim(),
        }),
      });

      const payload = (await response.json()) as {
        message?: string;
      };

      if (!response.ok) {
        setError(PASSWORD_RECOVERY_FAILED_MESSAGE);
        return;
      }

      setSuccessMessage(
        payload.message ?? PASSWORD_RECOVERY_REQUEST_SUCCESS_MESSAGE,
      );
      setBadgeNumber("");
    } catch {
      setError(PASSWORD_RECOVERY_FAILED_MESSAGE);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-100 px-4 py-12">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg shadow-zinc-200/60 sm:p-10">
        <div className="mb-8 text-center">
          <div className="mb-4 text-5xl" aria-hidden="true">
            🚒
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">
            Reset your password
          </h1>
          <p className="mt-3 text-sm leading-6 text-zinc-600">
            Enter your badge number. If an account matches, we&apos;ll send a
            secure reset link to the department email associated with your
            account.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="space-y-2">
            <label
              htmlFor="recovery-badge-number"
              className="block text-sm font-medium text-zinc-700"
            >
              Badge Number
            </label>
            <Input
              id="recovery-badge-number"
              name="badgeNumber"
              value={badgeNumber}
              onChange={(event) => {
                setBadgeNumber(event.target.value);
                if (error) {
                  setError(null);
                }
              }}
              autoComplete="username"
              disabled={isSubmitting}
            />
          </div>

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

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? "Sending…" : "Send reset link"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-zinc-600">
          <Link href="/" className="font-semibold text-zinc-800 hover:text-zinc-950">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
