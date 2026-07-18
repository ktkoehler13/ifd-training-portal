"use client";

import Link from "next/link";
import { startTransition, useCallback, useEffect, useState } from "react";
import { AdminGate } from "@/components/layout/AuthGate";
import { formatCurrency } from "@/lib/currency";
import {
  formatTrainingRequestStatus,
} from "@/lib/training-requests";
import { listAllTrainingRequestsForAdmin } from "@/lib/training-request-workflow";
import type { TrainingRequestRecord } from "@/types/training-request";

function AdminRequestsContent() {
  const [requests, setRequests] = useState<TrainingRequestRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadRequests = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);

    try {
      const data = await listAllTrainingRequestsForAdmin();
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
            : "Unable to load training requests.",
        );
        setIsLoading(false);
      });
    }
  }, []);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  return (
    <div className="flex flex-1 flex-col bg-zinc-100">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-6">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl">
              Administrative Request View
            </h1>
            <p className="mt-1 text-sm text-zinc-600">
              View all training requests across the department. Signing actions
              remain limited to MTO and Deputy Chief workflow roles.
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
            Loading requests...
          </p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm shadow-zinc-200/60">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-zinc-200 bg-zinc-50 text-xs tracking-wide text-zinc-500 uppercase">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Request</th>
                    <th className="px-4 py-3 font-semibold">Requester</th>
                    <th className="px-4 py-3 font-semibold">Training</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Total</th>
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
                        {request.requestNumber}
                      </td>
                      <td className="px-4 py-4 align-top text-zinc-700">
                        {request.requesterName}
                      </td>
                      <td className="px-4 py-4 align-top text-zinc-700">
                        {request.courseName}
                      </td>
                      <td className="px-4 py-4 align-top text-zinc-700">
                        {formatTrainingRequestStatus(request.status)}
                      </td>
                      <td className="px-4 py-4 align-top text-zinc-700">
                        {formatCurrency(request.totalEstimatedExpenses)}
                      </td>
                      <td className="px-4 py-4 align-top">
                        <div className="flex flex-col gap-2">
                          <Link
                            href={`/requests/${encodeURIComponent(request.requestNumber)}/confirmation`}
                            className="inline-flex h-9 items-center rounded-xl border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-800 shadow-sm hover:bg-zinc-50"
                          >
                            View
                          </Link>
                          {(request.status === "pending_mto" ||
                            request.status === "pending_deputy_chief") &&
                          (request.currentActionRole === "mto" ||
                            request.currentActionRole === "deputy_chief") ? (
                            <Link
                              href={`/approvals/${encodeURIComponent(request.id)}`}
                              className="inline-flex h-9 items-center rounded-xl border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-800 shadow-sm hover:bg-zinc-50"
                            >
                              Review
                            </Link>
                          ) : null}
                        </div>
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

export function AdminRequestsView() {
  return (
    <AdminGate>
      <AdminRequestsContent />
    </AdminGate>
  );
}
