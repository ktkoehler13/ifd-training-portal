"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AUTH_MESSAGES } from "@/lib/auth/messages";
import { isAdministrativeRole } from "@/lib/auth/roles";
import {
  getClientAuthenticatedPersonnel,
  signOutClientSession,
} from "@/lib/auth/client";
import type { AuthenticatedPersonnel } from "@/lib/auth/personnel";
import { Button } from "@/components/ui/Button";

interface AuthGateProps {
  children: ReactNode | ((personnel: AuthenticatedPersonnel) => ReactNode);
}

export function AuthGate({ children }: AuthGateProps) {
  const router = useRouter();
  const [personnel, setPersonnel] = useState<AuthenticatedPersonnel | null>(
    null,
  );
  const [status, setStatus] = useState<"loading" | "ready" | "denied">(
    "loading",
  );

  useEffect(() => {
    let cancelled = false;

    async function loadPersonnel() {
      const record = await getClientAuthenticatedPersonnel();

      if (cancelled) {
        return;
      }

      if (!record) {
        await signOutClientSession();
        setStatus("denied");
        router.replace("/?reason=access-denied");
        return;
      }

      setPersonnel(record);
      setStatus("ready");
    }

    void loadPersonnel();

    return () => {
      cancelled = true;
    };
  }, [router]);

  if (status === "loading") {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-100 px-4 py-12">
        <p className="text-sm text-zinc-500" role="status">
          Checking access…
        </p>
      </div>
    );
  }

  if (status === "denied" || !personnel) {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-100 px-4 py-12">
        <p className="text-sm text-zinc-500" role="status">
          Redirecting…
        </p>
      </div>
    );
  }

  return typeof children === "function" ? children(personnel) : children;
}

interface AdminGateProps {
  children: ReactNode;
}

export function AdminGate({ children }: AdminGateProps) {
  return (
    <AuthGate>
      {(personnel) => {
        if (!isAdministrativeRole(personnel.role)) {
          return (
            <div className="flex flex-1 flex-col bg-zinc-100">
              <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-4 py-12 sm:px-6">
                <div className="rounded-2xl bg-white p-6 shadow-sm shadow-zinc-200/60 sm:p-8">
                  <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
                    Access denied
                  </h1>
                  <p className="mt-2 text-sm leading-6 text-zinc-600">
                    {AUTH_MESSAGES.administrativeAccessRequired}
                  </p>
                  <div className="mt-8">
                    <Link href="/dashboard">
                      <Button variant="secondary" className="px-6">
                        Return to Dashboard
                      </Button>
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          );
        }

        return children;
      }}
    </AuthGate>
  );
}
