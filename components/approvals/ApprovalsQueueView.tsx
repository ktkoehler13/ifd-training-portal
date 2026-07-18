"use client";

import Link from "next/link";
import { startTransition, useCallback, useEffect, useState } from "react";
import { AuthGate } from "@/components/layout/AuthGate";
import { formatCurrency } from "@/lib/currency";
import type { AuthenticatedPersonnel } from "@/lib/auth/personnel";
import {
  formatTrainingRequestIdentifier,
  formatTrainingRequestStatus,
} from "@/lib/training-requests";
import { listPendingApprovalsForRole } from "@/lib/training-request-workflow";
import type { TrainingRequestRecord } from "@/types/training-request";
import { cn } from "@/lib/utils";

function formatDisplayDate(value: string) {
  if (!value) {
    return "—";
  }

  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatSubmittedAt(value: string | null) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function ApprovalsQueueContent({ personnel }: { personnel: AuthenticatedPersonnel }) {
  const [requests, setRequests] = useState<TrainingRequestRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadRequests = useCallback(async () => {
    if (personnel.role !== "mto" && personnel.role !== "deputy_chief") {
      setRequests([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setLoadError(null);

    try {
      const data = await listPendingApprovalsForRole(personnel.role);
      startTransition(() => {
        setRequests(data);
        setIsLoading(false);
      });
    } catch (error) {
      startTransition(() => {
        setRequests([]);
        setLoadError(
          error instanceof Error
            ? error.message
            : "Unable to load approval queue.",
        );
        setIsLoading(false);
      });
    }
  }, [personnel.role]);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  if (personnel.role !== "mto" && personnel.role !== "deputy_chief") {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-8 sm:px-6">
        <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-700">
          This queue is available only to active MTO and Deputy Chief personnel.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col bg-zinc-100">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-6">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl">
              Requests Requiring My Action
            </h1>
            <p className="mt-1 text-sm text-zinc-600">
              Review training requests currently assigned to your workflow role.
            </p>
          </div>
          <Link
            href="/dashboard"
            className="inline-flex h-11 items-center justify-center rounded-xl border border-zinc-200 bg-white px-5 text-sm font-semibold text-zinc-800 shadow-sm transition-colors hover:bg-zinc-50"
          >
            Dashboard
          </Link>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
        {loadError ? (
          <div
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
            role="alert"
          >
            {loadError}
          </div>
        ) : null}

        {isLoading ? (
          <p className="text-sm text-zinc-500" role="status">
            Loading approval queue...
          </p>
        ) : requests.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-16 text-center shadow-sm shadow-zinc-200/60">
            <h2 className="text-lg font-semibold text-zinc-900">
              No requests require your action
            </h2>
            <p className="mt-2 text-sm leading-6 text-zinc-600">
              When a request is assigned to your role, it will appear here for
              review and electronic signature.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm shadow-zinc-200/60">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-zinc-200 bg-zinc-50 text-xs tracking-wide text-zinc-500 uppercase">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Request</th>
                    <th className="px-4 py-3 font-semibold">Requester</th>
                    <th className="px-4 py-3 font-semibold">Training</th>
                    <th className="px-4 py-3 font-semibold">Dates</th>
                    <th className="px-4 py-3 font-semibold">Total</th>
                    <th className="px-4 py-3 font-semibold">Submitted</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((request) => (
                    <tr
                      key={request.id}
                      className="border-b border-zinc-100 last:border-b-0"
                    >
                      <td className="px-4 py-4 align-top font-medium text-zinc-900">
                        {formatTrainingRequestIdentifier(request)}
                      </td>
                      <td className="px-4 py-4 align-top text-zinc-700">
                        {request.requesterName}
                      </td>
                      <td className="px-4 py-4 align-top text-zinc-700">
                        {request.courseName}
                      </td>
                      <td className="px-4 py-4 align-top whitespace-nowrap text-zinc-700">
                        {formatDisplayDate(request.courseStartDate)}
                        <span className="text-zinc-400"> – </span>
                        {formatDisplayDate(request.courseEndDate)}
                      </td>
                      <td className="px-4 py-4 align-top whitespace-nowrap text-zinc-700">
                        {formatCurrency(request.totalEstimatedExpenses)}
                      </td>
                      <td className="px-4 py-4 align-top whitespace-nowrap text-zinc-700">
                        {formatSubmittedAt(request.submittedAt)}
                      </td>
                      <td className="px-4 py-4 align-top">
                        <span
                          className={cn(
                            "inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset",
                            "bg-amber-50 text-amber-900 ring-amber-200",
                          )}
                        >
                          {formatTrainingRequestStatus(request.status)}
                        </span>
                      </td>
                      <td className="px-4 py-4 align-top">
                        <Link
                          href={`/approvals/${encodeURIComponent(request.id)}`}
                          className="inline-flex h-9 items-center rounded-xl border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-800 shadow-sm hover:bg-zinc-50"
                        >
                          Review
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function ApprovalsQueueView() {
  return (
    <AuthGate>
      {(personnel) => <ApprovalsQueueContent personnel={personnel} />}
    </AuthGate>
  );
}
