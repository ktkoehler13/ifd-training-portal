"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  PASSWORD_RECOVERY_FAILED_MESSAGE,
  PASSWORD_RECOVERY_LINK_INVALID_MESSAGE,
} from "@/lib/auth/password-recovery-messages";
import { createClient } from "@/lib/supabase/client";

interface PasswordRecoveryResetViewProps {
  initialHasRecoverySession: boolean;
}

export function PasswordRecoveryResetView({
  initialHasRecoverySession,
}: PasswordRecoveryResetViewProps) {
  const searchParams = useSearchParams();
  const [hasRecoverySession, setHasRecoverySession] = useState(
    initialHasRecoverySession,
  );
  const [isCheckingSession, setIsCheckingSession] = useState(
    !initialHasRecoverySession,
  );
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const reason = searchParams.get("reason");
  const linkInvalid =
    reason === "invalid-link" ||
    (!isCheckingSession && !hasRecoverySession);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    async function syncRecoverySession() {
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange(async (event) => {
        if (event === "PASSWORD_RECOVERY") {
          const response = await fetch("/api/auth/reset-password/session", {
            method: "POST",
          });
          if (!cancelled && response.ok) {
            setHasRecoverySession(true);
            setIsCheckingSession(false);
          }
        }
      });

      if (initialHasRecoverySession) {
        setIsCheckingSession(false);
        return () => {
          cancelled = true;
          subscription.unsubscribe();
        };
      }

      try {
        const sessionResponse = await fetch("/api/auth/reset-password/session");
        const sessionPayload = (await sessionResponse.json()) as {
          hasRecoverySession?: boolean;
        };

        if (!cancelled && sessionPayload.hasRecoverySession) {
          setHasRecoverySession(true);
          setIsCheckingSession(false);
          return;
        }

        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (session?.user.recovery_sent_at) {
          const establishResponse = await fetch(
            "/api/auth/reset-password/session",
            { method: "POST" },
          );

          if (!cancelled && establishResponse.ok) {
            setHasRecoverySession(true);
          }
        }
      } finally {
        if (!cancelled) {
          setIsCheckingSession(false);
        }
      }

      return () => {
        cancelled = true;
        subscription.unsubscribe();
      };
    }

    const cleanupPromise = syncRecoverySession();

    return () => {
      cancelled = true;
      void cleanupPromise.then((cleanup) => cleanup?.());
    };
  }, [initialHasRecoverySession]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting || !hasRecoverySession) {
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          newPassword,
          confirmPassword,
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        message?: string;
      };

      if (!response.ok) {
        setError(payload.error ?? PASSWORD_RECOVERY_FAILED_MESSAGE);
        return;
      }

      window.location.assign("/?reason=password-reset");
    } catch {
      setError(PASSWORD_RECOVERY_FAILED_MESSAGE);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isCheckingSession) {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-100 px-4 py-12">
        <p className="text-sm text-zinc-500" role="status">
          Verifying reset link…
        </p>
      </div>
    );
  }

  if (linkInvalid) {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-100 px-4 py-12">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg shadow-zinc-200/60 sm:p-10">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
            Reset your password
          </h1>
          <p className="mt-3 text-sm leading-6 text-red-700" role="alert">
            {PASSWORD_RECOVERY_LINK_INVALID_MESSAGE}
          </p>
          <div className="mt-6 flex flex-col gap-3">
            <Link
              href="/forgot-password"
              className="inline-flex h-11 items-center justify-center rounded-xl bg-red-700 px-5 text-sm font-semibold text-white hover:bg-red-800"
            >
              Request a new reset email
            </Link>
            <Link
              href="/"
              className="inline-flex h-11 items-center justify-center rounded-xl border border-zinc-200 bg-white px-5 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
            >
              Back to sign in
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-100 px-4 py-12">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg shadow-zinc-200/60 sm:p-10">
        <div className="mb-8 text-center">
          <div className="mb-4 text-5xl" aria-hidden="true">
            🚒
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">
            Choose a new password
          </h1>
          <p className="mt-3 text-sm leading-6 text-zinc-600">
            Enter and confirm a new permanent password for your account.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="space-y-2">
            <label
              htmlFor="recovery-new-password"
              className="block text-sm font-medium text-zinc-700"
            >
              New Password
            </label>
            <div className="relative">
              <Input
                id="recovery-new-password"
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
              htmlFor="recovery-confirm-password"
              className="block text-sm font-medium text-zinc-700"
            >
              Confirm New Password
            </label>
            <div className="relative">
              <Input
                id="recovery-confirm-password"
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

          {error ? (
            <p className="text-sm text-red-700" role="alert">
              {error}
            </p>
          ) : null}

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? "Saving…" : "Reset password"}
          </Button>
        </form>
      </div>
    </div>
  );
}
