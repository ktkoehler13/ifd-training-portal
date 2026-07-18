"use client";

import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { hasPrototypeSession } from "@/lib/session";

function subscribe(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  return () => window.removeEventListener("storage", onStoreChange);
}

interface PrototypeGateProps {
  children: ReactNode;
}

export function PrototypeGate({ children }: PrototypeGateProps) {
  const router = useRouter();
  const isAuthorized = useSyncExternalStore(
    subscribe,
    hasPrototypeSession,
    () => false,
  );

  useEffect(() => {
    if (!isAuthorized) {
      router.replace("/");
    }
  }, [isAuthorized, router]);

  if (!isAuthorized) {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-100 px-4 py-12">
        <p className="text-sm text-zinc-500" role="status">
          Checking access…
        </p>
      </div>
    );
  }

  return children;
}
