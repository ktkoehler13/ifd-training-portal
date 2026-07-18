"use client";

import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import {
  clearPrototypeSession,
  hasPrototypeSession,
} from "@/lib/session";
import { cn } from "@/lib/utils";

const actionCards = [
  {
    title: "New Training Request",
    description:
      "Submit a new request for department training, courses, or certifications.",
    href: "/requests/new",
  },
  {
    title: "My Requests",
    description:
      "Review the status of training requests you have already submitted.",
    href: "/requests",
  },
  {
    title: "Help & Instructions",
    description: "Coming soon",
    href: null,
  },
] as const;

function subscribe(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  return () => window.removeEventListener("storage", onStoreChange);
}

export function DashboardView() {
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

  function handleSignOut() {
    clearPrototypeSession();
    router.replace("/");
  }

  if (!isAuthorized) {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-100 px-4 py-12">
        <p className="text-sm text-zinc-500" role="status">
          Checking access…
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col bg-zinc-100">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex w-full max-w-5xl items-start justify-between gap-4 px-4 py-5 sm:px-6">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl">
              IFD Training Portal
            </h1>
            <p className="mt-1 text-sm text-zinc-600">
              Training Bureau Dashboard
            </p>
          </div>
          <Button
            variant="secondary"
            onClick={handleSignOut}
            className="shrink-0 px-5"
          >
            Sign Out
          </Button>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
        <div
          className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          role="status"
        >
          Prototype environment — access uses a temporary department code.
          Authentication and live data are not connected yet.
        </div>

        <section className="rounded-2xl bg-white p-6 shadow-sm shadow-zinc-200/60 sm:p-8">
          <h2 className="text-lg font-semibold text-zinc-900">Welcome</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">
            You are signed in to the IFD Training Portal prototype. Use the
            actions below to explore the Training Bureau workflow. Features will
            expand as later sprints are completed.
          </p>
        </section>

        <section aria-labelledby="dashboard-actions-heading">
          <h2
            id="dashboard-actions-heading"
            className="mb-4 text-sm font-semibold tracking-wide text-zinc-500 uppercase"
          >
            Quick actions
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {actionCards.map((card) => {
              const className = cn(
                "rounded-2xl border border-zinc-200 bg-white p-5 text-left shadow-sm shadow-zinc-200/60",
                "transition-colors",
                card.href
                  ? "hover:border-zinc-300 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-700 focus-visible:ring-offset-2"
                  : "cursor-not-allowed opacity-75",
              );

              if (card.href) {
                return (
                  <Link key={card.title} href={card.href} className={className}>
                    <h3 className="text-base font-semibold text-zinc-900">
                      {card.title}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-zinc-600">
                      {card.description}
                    </p>
                  </Link>
                );
              }

              return (
                <div
                  key={card.title}
                  className={className}
                  aria-disabled="true"
                >
                  <h3 className="text-base font-semibold text-zinc-900">
                    {card.title}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-zinc-600">
                    {card.description}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
