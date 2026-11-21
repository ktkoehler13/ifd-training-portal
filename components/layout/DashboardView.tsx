"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { AuthGate } from "@/components/layout/AuthGate";
import { DashboardIcon } from "@/components/layout/DashboardIcons";
import { RequestStatusBadge } from "@/components/requests/RequestStatusBadge";
import { canProcessCityAuthorization, cityAuthorizationNeedsAction, type CityAuthorizationQueueItem } from "@/lib/city-authorization/model";
import { compensationNeedsAction } from "@/lib/compensation/access";
import type { CompensationPacket } from "@/lib/compensation/model";
import { isAdministrativeRole } from "@/lib/auth/roles";
import type { AuthenticatedPersonnel } from "@/lib/auth/personnel";
import { formatPersonnelFullName } from "@/lib/personnel";
import { ownRequestHref, timeOfDayGreeting } from "@/lib/request-status";
import { listOwnTrainingRequests } from "@/lib/training-requests";
import { countPendingApprovalsForRole } from "@/lib/training-request-workflow";
import { cn } from "@/lib/utils";
import type { TrainingRequestRecord } from "@/types/training-request";
import { PERSONNEL_ROLE_LABELS } from "@/types/personnel";

interface ActionCard {
  title: string;
  description: string;
  href: string;
  icon: ReactNode;
  primary?: boolean;
}

interface AttentionItem {
  label: string;
  count: number;
  href: string;
}

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function getActionCards(personnel: AuthenticatedPersonnel, pendingApprovalCount: number | null): ActionCard[] {
  const cards: ActionCard[] = [
    { title: "New training request", description: "Request a course, class or certification.", href: "/requests/new", icon: DashboardIcon.newRequest, primary: true },
    { title: "My requests", description: "Track drafts, reviews and approved training.", href: "/requests", icon: DashboardIcon.requests },
  ];
  if (personnel.role === "mto" || personnel.role === "deputy_chief") {
    cards.push({
      title: "Review approvals",
      description: pendingApprovalCount ? `${plural(pendingApprovalCount, "request")} waiting on you.` : "Requests assigned to your review step.",
      href: "/approvals",
      icon: DashboardIcon.approvals,
    });
  }
  cards.push({
    title: "Compensation packets",
    description: personnel.role === "office" ? "Code MTO-signed packets and mark them submitted." : "Record hours, mileage, vouchers and receipts after training.",
    href: "/compensation",
    icon: DashboardIcon.compensation,
  });
  if (canProcessCityAuthorization(personnel.role)) {
    cards.push({ title: "City Authorizations", description: "Upload City Authorizations for approved training.", href: "/city-authorizations", icon: DashboardIcon.city });
  }
  if (isAdministrativeRole(personnel.role)) {
    cards.push({ title: "Approved training", description: "Department schedule of approved training.", href: "/admin/approved-training", icon: DashboardIcon.calendar });
  }
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
  const [pendingApprovalCount, setPendingApprovalCount] = useState<number | null>(null);
  const [pendingCompensationCount, setPendingCompensationCount] = useState<number | null>(null);
  const [pendingCityAuthorizationCount, setPendingCityAuthorizationCount] = useState<number | null>(null);
  const [requests, setRequests] = useState<TrainingRequestRecord[] | null>(null);
  const [requestsError, setRequestsError] = useState(false);
  const [greeting] = useState(() => timeOfDayGreeting(new Date().getHours()));

  useEffect(() => {
    let active = true;
    listOwnTrainingRequests(personnel.id)
      .then((data) => { if (active) setRequests(data); })
      .catch(() => { if (active) setRequestsError(true); });
    return () => { active = false; };
  }, [personnel.id]);

  useEffect(() => {
    if (!canProcessCityAuthorization(personnel.role)) return;
    let active = true;
    async function refresh() {
      try {
        const response = await fetch("/api/city-authorizations", {cache:"no-store"});
        if (!response.ok) return;
        const data = await response.json() as {items:CityAuthorizationQueueItem[];primaryOfficeId?:string|null};
        if (active) setPendingCityAuthorizationCount(data.items.filter(item=>cityAuthorizationNeedsAction(item.status,personnel.role,personnel.id,data.primaryOfficeId)).length);
      } catch { /* The City Authorizations page provides a retryable error. */ }
    }
    void refresh(); window.addEventListener("focus", refresh);
    const timer = window.setInterval(refresh,60000);
    return () => {active=false;window.removeEventListener("focus",refresh);window.clearInterval(timer);};
  }, [personnel.role, personnel.id]);

  useEffect(() => {
    let active = true;
    async function refresh() {
      try {
        const response = await fetch("/api/compensation", { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json() as {packets: Array<Pick<CompensationPacket, "requester_id" | "status">>; primaryOfficeId?: string | null};
        if (active) setPendingCompensationCount(data.packets.filter(packet => compensationNeedsAction(packet, {id:personnel.id,role:personnel.role}, data.primaryOfficeId)).length);
      } catch { /* The packet list provides a retryable error if unavailable. */ }
    }
    void refresh(); window.addEventListener("focus", refresh);
    const timer = window.setInterval(refresh, 60000);
    return () => { active = false; window.removeEventListener("focus", refresh); window.clearInterval(timer); };
  }, [personnel.id, personnel.role]);

  useEffect(() => {
    if (personnel.role !== "mto" && personnel.role !== "deputy_chief") return;
    const role = personnel.role;
    let cancelled = false;
    let loading = false;
    async function loadCount() {
      if (cancelled || loading) return;
      loading = true;
      try {
        const count = await countPendingApprovalsForRole(role);
        if (!cancelled) setPendingApprovalCount(count);
      } catch {
        if (!cancelled) setPendingApprovalCount(null);
      } finally {
        loading = false;
      }
    }
    function refreshVisibleCount() {
      if (document.visibilityState === "visible") void loadCount();
    }
    void loadCount();
    const refreshInterval = window.setInterval(refreshVisibleCount, 60_000);
    window.addEventListener("focus", refreshVisibleCount);
    document.addEventListener("visibilitychange", refreshVisibleCount);
    return () => {
      cancelled = true;
      window.clearInterval(refreshInterval);
      window.removeEventListener("focus", refreshVisibleCount);
      document.removeEventListener("visibilitychange", refreshVisibleCount);
    };
  }, [personnel.role]);

  const returnedCount = requests?.filter((request) => request.status === "returned_for_correction").length ?? 0;
  const attention: AttentionItem[] = [
    { label: "Awaiting your review", count: pendingApprovalCount ?? 0, href: "/approvals" },
    { label: "Returned for correction", count: returnedCount, href: "/requests" },
    { label: "Compensation needing you", count: pendingCompensationCount ?? 0, href: "/compensation" },
    { label: "City Authorizations to upload", count: pendingCityAuthorizationCount ?? 0, href: "/city-authorizations" },
  ].filter((item) => item.count > 0);
  const countsLoaded = requests !== null || requestsError;
  const firstName = personnel.firstName?.trim() || formatPersonnelFullName(personnel) || "";
  const recent = requests?.slice(0, 5) ?? [];

  return (
    <div className="flex flex-1 flex-col bg-zinc-100">
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-8 sm:px-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">
            {greeting}{firstName ? `, ${firstName}` : ""}
          </h1>
          <p className="mt-1 text-sm text-zinc-600">
            {PERSONNEL_ROLE_LABELS[personnel.role]} · Badge {personnel.badgeNumber}
          </p>
        </div>

        <section aria-labelledby="dashboard-attention-heading">
          <h2 id="dashboard-attention-heading" className="sr-only">Needs your attention</h2>
          {attention.length ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-live="polite">
              {attention.map((item) => (
                <Link key={item.href} href={item.href}
                  className="rounded-2xl border border-red-200 bg-red-50 p-4 transition-colors hover:border-red-300 hover:bg-red-100/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-700 focus-visible:ring-offset-2">
                  <p className="text-3xl font-semibold text-red-800">{item.count}</p>
                  <p className="mt-1 text-sm font-medium text-red-900">{item.label}</p>
                </Link>
              ))}
            </div>
          ) : countsLoaded ? (
            <div className="flex items-center gap-3 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900" role="status">
              <span className="text-green-700">{DashboardIcon.check}</span>
              You&apos;re all caught up. Nothing needs your action right now.
            </div>
          ) : null}
        </section>

        <section aria-labelledby="dashboard-actions-heading">
          <h2 id="dashboard-actions-heading" className="mb-3 text-sm font-semibold text-zinc-500">
            Quick actions
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {getActionCards(personnel, pendingApprovalCount).map((card) => (
              <Link key={card.href} href={card.href}
                className={cn(
                  "group flex gap-4 rounded-2xl border p-5 shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-700 focus-visible:ring-offset-2",
                  card.primary
                    ? "border-red-700 bg-red-700 text-white hover:bg-red-800"
                    : "border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50",
                )}>
                <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
                  card.primary ? "bg-white/15 text-white" : "bg-red-50 text-red-700")}>
                  {card.icon}
                </span>
                <span className="min-w-0">
                  <span className={cn("block text-base font-semibold", card.primary ? "text-white" : "text-zinc-900")}>{card.title}</span>
                  <span className={cn("mt-1 block text-sm leading-5", card.primary ? "text-red-50" : "text-zinc-600")}>{card.description}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>

        <section aria-labelledby="dashboard-recent-heading">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="dashboard-recent-heading" className="text-sm font-semibold text-zinc-500">Your recent requests</h2>
            {recent.length ? <Link href="/requests" className="text-sm font-semibold text-red-700 hover:underline">View all</Link> : null}
          </div>
          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
            {requests === null && !requestsError ? (
              <p className="px-5 py-4 text-sm text-zinc-500" role="status">Loading your requests…</p>
            ) : requestsError ? (
              <p className="px-5 py-4 text-sm text-zinc-600">Your requests couldn&apos;t be loaded. Open <Link href="/requests" className="font-semibold text-red-700 underline">My requests</Link> to try again.</p>
            ) : recent.length === 0 ? (
              <div className="px-5 py-6">
                <p className="font-semibold text-zinc-900">Start your first training request</p>
                <p className="mt-1 text-sm text-zinc-600">Requests you start or submit will show up here with their status.</p>
                <Link href="/requests/new" className="mt-4 inline-flex h-10 items-center rounded-xl bg-red-700 px-4 text-sm font-semibold text-white hover:bg-red-800">New training request</Link>
              </div>
            ) : (
              <ul className="divide-y divide-zinc-100">
                {recent.map((request) => (
                  <li key={request.id}>
                    <Link href={ownRequestHref(request)} className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-red-700">
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-zinc-900">{request.courseName || "Untitled request"}</span>
                        <span className="block truncate text-sm text-zinc-500">
                          {[request.trainingProvider || request.location, request.requestNumber].filter(Boolean).join(" · ") || "Draft"}
                        </span>
                      </span>
                      <RequestStatusBadge status={request.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
