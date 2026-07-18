"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { setPrototypeSession } from "@/lib/session";

export function LandingGate() {
  const router = useRouter();
  const [accessCode, setAccessCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const expectedCode = process.env.NEXT_PUBLIC_DEPARTMENT_ACCESS_CODE;

    if (!expectedCode) {
      setError("Access is temporarily unavailable. Please contact the Training Bureau.");
      setIsSubmitting(false);
      return;
    }

    if (accessCode.trim() !== expectedCode) {
      setError("Incorrect department access code. Please try again.");
      setIsSubmitting(false);
      return;
    }

    setPrototypeSession();
    router.push("/dashboard");
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
            Prototype Version 0.1
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="space-y-2">
            <label
              htmlFor="access-code"
              className="block text-sm font-medium text-zinc-700"
            >
              Department Access Code
            </label>
            <Input
              id="access-code"
              name="accessCode"
              type="password"
              value={accessCode}
              onChange={(event) => {
                setAccessCode(event.target.value);
                if (error) {
                  setError(null);
                }
              }}
              placeholder="Enter department code"
              autoComplete="off"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "access-code-error" : undefined}
              disabled={isSubmitting}
            />
            {error ? (
              <p
                id="access-code-error"
                role="alert"
                className="text-sm text-red-700"
              >
                {error}
              </p>
            ) : null}
          </div>
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? "Checking…" : "Continue"}
          </Button>
        </form>
      </div>
    </div>
  );
}
