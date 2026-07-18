"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AuthGate } from "@/components/layout/AuthGate";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { isAdministrativeRole } from "@/lib/auth/roles";
import type { AuthenticatedPersonnel } from "@/lib/auth/personnel";
import { formatPersonnelDashboardIdentity } from "@/lib/personnel";
import { countPendingApprovalsForRole } from "@/lib/training-request-workflow";
import { cn } from "@/lib/utils";

const baseActionCards = [
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

const administrativeActionCard = {
  title: "User Management",
  description:
    "Add, edit, deactivate, reactivate, or remove personnel records.",
  href: "/admin/users",
} as const;

const adminRequestsCard = {
  title: "Administrative Request View",
  description: "View all training requests across the department.",
  href: "/admin/requests",
} as const;

function getQuickActionCards(
  personnel: AuthenticatedPersonnel,
  pendingApprovalCount: number | null,
) {
  const cards: Array<{
    title: string;
    description: string;
    href: string | null;
  }> = [baseActionCards[0], baseActionCards[1]];

  if (personnel.role === "mto" || personnel.role === "deputy_chief") {
    cards.push({
      title: "My Signature",
      description:
        "Draw or upload the PNG signature used when you electronically approve training requests.",
      href: "/settings/signature",
    });
    cards.push({
      title: "Requests Requiring My Action",
      description:
        pendingApprovalCount && pendingApprovalCount > 0
          ? `${pendingApprovalCount} request${pendingApprovalCount === 1 ? "" : "s"} awaiting your review.`
          : "Review training requests currently assigned to your workflow role.",
      href: "/approvals",
    });
  }

  if (isAdministrativeRole(personnel.role)) {
    cards.push(administrativeActionCard);
    cards.push(adminRequestsCard);
  }

  cards.push(baseActionCards[2]);
  return cards;
}

export function DashboardView() {
  return (
    <AuthGate>
      {(personnel) => <DashboardContent personnel={personnel} />}
    </AuthGate>
  );
}

function DashboardContent({ personnel }: { personnel: AuthenticatedPersonnel }) {
  const [pendingApprovalCount, setPendingApprovalCount] = useState<number | null>(
    null,
  );
  const actionCards = getQuickActionCards(personnel, pendingApprovalCount);

  useEffect(() => {
    if (personnel.role !== "mto" && personnel.role !== "deputy_chief") {
      return;
    }

    let cancelled = false;

    async function loadCount() {
      try {
        const count =
          personnel.role === "mto"
            ? await countPendingApprovalsForRole("mto")
            : personnel.role === "deputy_chief"
              ? await countPendingApprovalsForRole("deputy_chief")
              : 0;
        if (!cancelled) {
          setPendingApprovalCount(count);
        }
      } catch {
        if (!cancelled) {
          setPendingApprovalCount(null);
        }
      }
    }

    void loadCount();

    return () => {
      cancelled = true;
    };
  }, [personnel.role]);

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
          <SignOutButton className="shrink-0 px-5" />
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
        <div
          className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-700"
          role="status"
        >
          Signed in as {formatPersonnelDashboardIdentity(personnel)}.
        </div>

        <section className="rounded-2xl bg-white p-6 shadow-sm shadow-zinc-200/60 sm:p-8">
          <h2 className="text-lg font-semibold text-zinc-900">Welcome</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">
            You are signed in with secure email authentication. Use the actions
            below to manage training requests and approvals.
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
