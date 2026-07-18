"use client";

import { FormEvent, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  AUTH_MESSAGES,
  getSafeAuthErrorMessage,
} from "@/lib/auth/messages";
import {
  isValidPersonnelEmail,
  normalizePersonnelEmail,
} from "@/lib/personnel";
import { createClient } from "@/lib/supabase/client";

const RESEND_COOLDOWN_SECONDS = 60;

type LoginStage = "credentials" | "check-email";

export function LandingGate() {
  const searchParams = useSearchParams();
  const [stage, setStage] = useState<LoginStage>("credentials");
  const [badgeNumber, setBadgeNumber] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resendAvailableAt, setResendAvailableAt] = useState<number | null>(
    null,
  );
  const [resendSecondsRemaining, setResendSecondsRemaining] = useState(0);

  const reason = searchParams.get("reason");
  const reasonError =
    reason === "access-denied" ? AUTH_MESSAGES.accessDenied : null;
  const reasonStatus =
    reason === "sign-in-required" ? "Sign in to continue." : null;

  useEffect(() => {
    if (!resendAvailableAt) {
      return;
    }

    const intervalId = window.setInterval(() => {
      const remaining = Math.max(
        0,
        Math.ceil((resendAvailableAt - Date.now()) / 1000),
      );
      setResendSecondsRemaining(remaining);
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [resendAvailableAt]);

  function resetToCredentials() {
    setStage("credentials");
    setError(null);
    setStatusMessage(null);
    setResendAvailableAt(null);
    setResendSecondsRemaining(0);
  }

  async function sendMagicLink() {
    setError(null);
    setStatusMessage(null);

    const trimmedBadge = badgeNumber.trim();
    const normalizedEmail = normalizePersonnelEmail(email);

    if (!trimmedBadge) {
      setError("Badge number is required.");
      return;
    }

    if (!normalizedEmail) {
      setError("Department email is required.");
      return;
    }

    if (!isValidPersonnelEmail(normalizedEmail)) {
      setError("Enter a valid email address.");
      return;
    }

    if (resendSecondsRemaining > 0) {
      setError(AUTH_MESSAGES.resendCooldown(resendSecondsRemaining));
      return;
    }

    setIsSubmitting(true);

    try {
      const supabase = createClient();
      const { data: allowed, error: rpcError } = await supabase.rpc(
        "personnel_login_allowed",
        {
          requested_badge_number: trimmedBadge,
          requested_email: normalizedEmail,
        },
      );

      if (rpcError) {
        throw rpcError;
      }

      if (!allowed) {
        setError(AUTH_MESSAGES.loginMismatch);
        return;
      }

      const pendingLoginResponse = await fetch("/api/auth/pending-login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ badgeNumber: trimmedBadge }),
      });

      if (!pendingLoginResponse.ok) {
        throw new Error(AUTH_MESSAGES.magicLinkSendFailed);
      }

      const emailRedirectTo = `${window.location.origin}/auth/callback`;
      const { error: magicLinkError } = await supabase.auth.signInWithOtp({
        email: normalizedEmail,
        options: {
          shouldCreateUser: true,
          emailRedirectTo,
        },
      });

      if (magicLinkError) {
        throw magicLinkError;
      }

      setStage("check-email");
      setStatusMessage(AUTH_MESSAGES.magicLinkSent);
      setResendAvailableAt(Date.now() + RESEND_COOLDOWN_SECONDS * 1000);
      setResendSecondsRemaining(RESEND_COOLDOWN_SECONDS);
    } catch (sendError) {
      setError(getSafeAuthErrorMessage(sendError));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSendLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await sendMagicLink();
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
            Secure Email Login
          </p>
        </div>

        {stage === "credentials" ? (
          <form onSubmit={handleSendLink} className="space-y-4" noValidate>
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
                htmlFor="department-email"
                className="block text-sm font-medium text-zinc-700"
              >
                Department Email
              </label>
              <Input
                id="department-email"
                name="email"
                type="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  if (error) {
                    setError(null);
                  }
                }}
                autoComplete="email"
                disabled={isSubmitting}
                aria-invalid={error ? true : undefined}
              />
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
              {isSubmitting ? "Sending…" : "Email Sign-In Link"}
            </Button>
          </form>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-zinc-600" role="status">
              Signing in as badge {badgeNumber.trim()} with{" "}
              {normalizePersonnelEmail(email)}.
            </p>

            <div
              className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900"
              role="status"
            >
              {statusMessage || AUTH_MESSAGES.magicLinkSent}
            </div>

            {error ? (
              <p role="alert" className="text-sm text-red-700">
                {error}
              </p>
            ) : null}

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                disabled={isSubmitting || resendSecondsRemaining > 0}
                onClick={() => {
                  void sendMagicLink();
                }}
              >
                {resendSecondsRemaining > 0
                  ? `Resend Link (${resendSecondsRemaining}s)`
                  : "Resend Link"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                disabled={isSubmitting}
                onClick={resetToCredentials}
              >
                Use Different Account
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
