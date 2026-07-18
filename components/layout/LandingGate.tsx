"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  getClientAuthenticatedPersonnelForLogin,
  signOutClientSession,
} from "@/lib/auth/client";
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

type LoginStage = "credentials" | "otp";

export function LandingGate() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [stage, setStage] = useState<LoginStage>("credentials");
  const [badgeNumber, setBadgeNumber] = useState("");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
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
    setOtp("");
    setError(null);
    setStatusMessage(null);
    setResendAvailableAt(null);
    setResendSecondsRemaining(0);
  }

  async function sendLoginCode() {
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

      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: normalizedEmail,
        options: {
          shouldCreateUser: true,
        },
      });

      if (otpError) {
        throw otpError;
      }

      setStage("otp");
      setOtp("");
      setStatusMessage(
        `A six-digit login code was sent to ${normalizedEmail}.`,
      );
      setResendAvailableAt(Date.now() + RESEND_COOLDOWN_SECONDS * 1000);
      setResendSecondsRemaining(RESEND_COOLDOWN_SECONDS);
    } catch (sendError) {
      setError(getSafeAuthErrorMessage(sendError));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSendCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await sendLoginCode();
  }

  async function handleVerifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setStatusMessage(null);

    const trimmedBadge = badgeNumber.trim();
    const normalizedEmail = normalizePersonnelEmail(email);
    const trimmedOtp = otp.trim();

    if (!/^\d{6}$/.test(trimmedOtp)) {
      setError(AUTH_MESSAGES.otpInvalid);
      return;
    }

    setIsSubmitting(true);

    try {
      const supabase = createClient();
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: normalizedEmail,
        token: trimmedOtp,
        type: "email",
      });

      if (verifyError) {
        throw verifyError;
      }

      const personnel = await getClientAuthenticatedPersonnelForLogin({
        badgeNumber: trimmedBadge,
        email: normalizedEmail,
      });

      if (!personnel) {
        await signOutClientSession();
        setError(AUTH_MESSAGES.accessDenied);
        resetToCredentials();
        return;
      }

      router.replace("/dashboard");
      router.refresh();
    } catch (verifyError) {
      setError(getSafeAuthErrorMessage(verifyError));
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
            IFD Training Portal
          </h1>
          <p className="mt-2 text-base text-zinc-600">Ithaca Fire Department</p>
          <p className="mt-3 text-xs font-medium tracking-wide text-zinc-400 uppercase">
            Secure Email Login
          </p>
        </div>

        {stage === "credentials" ? (
          <form onSubmit={handleSendCode} className="space-y-4" noValidate>
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
              {isSubmitting ? "Sending…" : "Send Login Code"}
            </Button>
          </form>
        ) : (
          <form onSubmit={handleVerifyCode} className="space-y-4" noValidate>
            <p className="text-sm text-zinc-600" role="status">
              Signing in as badge {badgeNumber.trim()} with{" "}
              {normalizePersonnelEmail(email)}.
            </p>

            <div className="space-y-2">
              <label
                htmlFor="login-code"
                className="block text-sm font-medium text-zinc-700"
              >
                Six-Digit Login Code
              </label>
              <Input
                id="login-code"
                name="otp"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={otp}
                onChange={(event) => {
                  setOtp(event.target.value.replace(/\D/g, "").slice(0, 6));
                  if (error) {
                    setError(null);
                  }
                }}
                placeholder="000000"
                disabled={isSubmitting}
                aria-invalid={error ? true : undefined}
              />
            </div>

            {statusMessage ? (
              <p className="text-sm text-zinc-600" role="status">
                {statusMessage}
              </p>
            ) : null}

            {error ? (
              <p role="alert" className="text-sm text-red-700">
                {error}
              </p>
            ) : null}

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "Verifying…" : "Verify Code"}
            </Button>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                disabled={isSubmitting || resendSecondsRemaining > 0}
                onClick={() => {
                  void sendLoginCode();
                }}
              >
                {resendSecondsRemaining > 0
                  ? `Send New Code (${resendSecondsRemaining}s)`
                  : "Send New Code"}
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
          </form>
        )}
      </div>
    </div>
  );
}
