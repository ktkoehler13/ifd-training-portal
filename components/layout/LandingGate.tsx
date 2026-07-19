"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  AUTH_MESSAGES,
  INVALID_CREDENTIALS_MESSAGE,
} from "@/lib/auth/messages";

const SUBMIT_COOLDOWN_MS = 1_000;

export function LandingGate() {
  const searchParams = useSearchParams();
  const [badgeNumber, setBadgeNumber] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastSubmittedAt, setLastSubmittedAt] = useState<number | null>(null);

  const reason = searchParams.get("reason");
  const reasonError =
    reason === "access-denied" ? AUTH_MESSAGES.accessDenied : null;
  const reasonStatus =
    reason === "sign-in-required"
      ? "Sign in to continue."
      : reason === "email-updated"
        ? AUTH_MESSAGES.emailUpdatedSignInRequired
        : reason === "password-updated"
          ? AUTH_MESSAGES.passwordUpdatedSignInRequired
          : null;

  async function handleSignIn(event: FormEvent<HTMLFormElement>) {
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
    setStatusMessage(null);

    const trimmedBadge = badgeNumber.trim();

    if (!trimmedBadge) {
      setError(INVALID_CREDENTIALS_MESSAGE);
      return;
    }

    if (!password) {
      setError(INVALID_CREDENTIALS_MESSAGE);
      return;
    }

    setIsSubmitting(true);
    setLastSubmittedAt(Date.now());

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          badgeNumber: trimmedBadge,
          password,
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        redirectTo?: string;
      };

      if (!response.ok) {
        setError(payload.error ?? INVALID_CREDENTIALS_MESSAGE);
        return;
      }

      window.location.href = payload.redirectTo ?? "/dashboard";
    } catch {
      setError(INVALID_CREDENTIALS_MESSAGE);
    } finally {
      setIsSubmitting(false);
      setPassword("");
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
            IFD Training Portal
          </h1>
          <p className="mt-2 text-base text-zinc-600">Ithaca Fire Department</p>
          <p className="mt-3 text-xs font-medium tracking-wide text-zinc-400 uppercase">
            Secure Sign In
          </p>
        </div>

        <form onSubmit={handleSignIn} className="space-y-4" noValidate>
          <div className="space-y-2">
            <label
              htmlFor="badge-number"
              className="block text-sm font-medium text-zinc-700"
            >
              Badge Number
            </label>
            <Input
              id="badge-number"
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
              aria-invalid={error ? true : undefined}
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="password"
              className="block text-sm font-medium text-zinc-700"
            >
              Password
            </label>
            <div className="relative">
              <Input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  if (error) {
                    setError(null);
                  }
                }}
                autoComplete="current-password"
                disabled={isSubmitting}
                className="pr-24"
                aria-invalid={error ? true : undefined}
              />
              <button
                type="button"
                className="absolute top-1/2 right-3 -translate-y-1/2 text-xs font-semibold text-zinc-600 hover:text-zinc-900"
                onClick={() => setShowPassword((current) => !current)}
                disabled={isSubmitting}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          {statusMessage || reasonStatus ? (
            <p className="text-sm text-zinc-600" role="status">
              {statusMessage || reasonStatus}
            </p>
          ) : null}

          {error || reasonError ? (
            <p role="alert" className="text-sm text-red-700">
              {error || reasonError}
            </p>
          ) : null}

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? "Signing In…" : "Sign In"}
          </Button>
        </form>

        <div className="mt-6 space-y-2 border-t border-zinc-200 pt-6 text-center">
          <Link
            href="/setup-password"
            className="text-sm font-semibold text-zinc-800 hover:text-zinc-950"
          >
            Set up my password
          </Link>
          <p className="text-sm text-zinc-600">
            Previously signed in by email link? Create a password for your
            account.
          </p>
        </div>
      </div>
    </div>
  );
}
