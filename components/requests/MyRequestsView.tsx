"use client";

import Link from "next/link";
import { startTransition, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PrototypeGate } from "@/components/layout/PrototypeGate";
import { Button } from "@/components/ui/Button";
import { formatCurrency } from "@/lib/currency";
import { formatTransportationIndicator } from "@/lib/expenses";
import { getPrototypeRequests } from "@/lib/prototypeRequests";
import type { TrainingRequest } from "@/types";

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

function formatSubmittedAt(value: string) {
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

export function MyRequestsView() {
  const router = useRouter();
  const [requests, setRequests] = useState<TrainingRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const storedRequests = getPrototypeRequests();

    startTransition(() => {
      setRequests(storedRequests);
      setIsLoading(false);
    });
  }, []);

  return (
    <PrototypeGate>
      <div className="flex flex-1 flex-col bg-zinc-100">
        <header className="border-b border-zinc-200 bg-white">
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-6">
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl">
                My Requests
              </h1>
              <p className="mt-1 text-sm text-zinc-600">
                Review training requests submitted from this browser.
              </p>
            </div>
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <Link
                href="/dashboard"
                className="inline-flex h-11 items-center justify-center rounded-xl border border-zinc-200 bg-white px-5 text-sm font-semibold text-zinc-800 shadow-sm transition-colors hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2"
              >
                Dashboard
              </Link>
              <Button
                className="w-full px-5 sm:w-auto"
                onClick={() => router.push("/requests/new")}
              >
                New Training Request
              </Button>
            </div>
          </div>
        </header>

        <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
          <div
            className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
            role="status"
          >
            Prototype data only — requests are saved in localStorage and are not
            synced to a server.
          </div>

          {isLoading ? (
            <p className="text-sm text-zinc-500" role="status">
              Loading requests...
            </p>
          ) : requests.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-16 text-center shadow-sm shadow-zinc-200/60">
              <h2 className="text-lg font-semibold text-zinc-900">
                No training requests yet
              </h2>
              <p className="mt-2 max-w-md text-sm leading-6 text-zinc-600">
                When you submit a new training request, it will appear here with
                its request number, course details, and current status.
              </p>
              <Button
                className="mt-6 px-6"
                onClick={() => router.push("/requests/new")}
              >
                New Training Request
              </Button>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm shadow-zinc-200/60">
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-zinc-200 bg-zinc-50 text-xs tracking-wide text-zinc-500 uppercase">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Request</th>
                      <th className="px-4 py-3 font-semibold">Course</th>
                      <th className="px-4 py-3 font-semibold">Requester</th>
                      <th className="px-4 py-3 font-semibold">Dates</th>
                      <th className="px-4 py-3 font-semibold">Days on Duty</th>
                      <th className="px-4 py-3 font-semibold">Total</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="px-4 py-3 font-semibold">Submitted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requests.map((request) => (
                      <tr
                        key={request.id}
                        className="border-b border-zinc-100 last:border-b-0"
                      >
                        <td className="px-4 py-4 align-top">
                          <div className="font-medium text-zinc-900">
                            {request.requestNumber}
                          </div>
                          <div className="mt-1 text-xs text-zinc-500">
                            {formatTransportationIndicator(
                              request.requestDepartmentVehicle,
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-4 align-top">
                          <div className="font-medium text-zinc-900">
                            {request.courseName || "—"}
                          </div>
                          <div className="mt-1 text-xs text-zinc-500">
                            {request.courseNumber || "—"}
                          </div>
                        </td>
                        <td className="px-4 py-4 align-top text-zinc-700">
                          {request.requesterName || "—"}
                        </td>
                        <td className="px-4 py-4 align-top whitespace-nowrap text-zinc-700">
                          {formatDisplayDate(request.courseStartDate)}
                          <span className="text-zinc-400"> – </span>
                          {formatDisplayDate(request.courseEndDate)}
                        </td>
                        <td className="px-4 py-4 align-top text-zinc-700">
                          {request.numberOfDaysOnDuty > 0
                            ? request.numberOfDaysOnDuty
                            : "—"}
                        </td>
                        <td className="px-4 py-4 align-top whitespace-nowrap text-zinc-700">
                          {formatCurrency(request.totalEstimatedExpenses)}
                        </td>
                        <td className="px-4 py-4 align-top">
                          <span className="inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900 ring-1 ring-amber-200 ring-inset">
                            {request.status}
                          </span>
                        </td>
                        <td className="px-4 py-4 align-top whitespace-nowrap text-zinc-700">
                          {formatSubmittedAt(request.submittedAt)}
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
    </PrototypeGate>
  );
}
