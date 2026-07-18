"use client";

import Link from "next/link";
import { AuthGate } from "@/components/layout/AuthGate";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { PERSONNEL_ROLE_LABELS } from "@/types/personnel";
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

export function DashboardView() {
  return (
    <AuthGate>
      {(personnel) => (
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
              <SignOutButton className="shrink-0 px-5" />
            </div>
          </header>

          <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
            <div
              className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-700"
              role="status"
            >
              Signed in as badge {personnel.badgeNumber} (
              {PERSONNEL_ROLE_LABELS[personnel.role]}).
            </div>

            <section className="rounded-2xl bg-white p-6 shadow-sm shadow-zinc-200/60 sm:p-8">
              <h2 className="text-lg font-semibold text-zinc-900">Welcome</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">
                You are signed in with secure email authentication. Use the
                actions below to manage training requests.
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
      )}
    </AuthGate>
  );
}
