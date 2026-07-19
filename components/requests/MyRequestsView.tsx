"use client";

import Link from "next/link";
import { startTransition, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthGate } from "@/components/layout/AuthGate";
import { Button } from "@/components/ui/Button";
import { formatCurrency } from "@/lib/currency";
import { formatTransportationIndicator } from "@/lib/expenses";
import type { AuthenticatedPersonnel } from "@/lib/auth/personnel";
import {
  formatCurrentActionRole,
  formatActionTimestamp,
  getCorrectionCommentsDisplay,
  getLatestCorrectionAction,
  listTrainingRequestActions,
  truncateCorrectionPreview,
} from "@/lib/training-request-actions";
import {
  formatTrainingRequestIdentifier,
  formatTrainingRequestStatus,
  LEGACY_LOCAL_STORAGE_NOTICE,
  listOwnTrainingRequests,
} from "@/lib/training-requests";
import type { TrainingRequestRecord } from "@/types/training-request";
import { cn } from "@/lib/utils";

interface CorrectionPreview {
  commentsPreview: string;
}

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

function MyRequestsContent({ personnel }: { personnel: AuthenticatedPersonnel }) {
  const router = useRouter();
  const [requests, setRequests] = useState<TrainingRequestRecord[]>([]);
  const [correctionPreviews, setCorrectionPreviews] = useState<
    Record<string, CorrectionPreview>
  >({});
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadRequests = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);

    try {
      const data = await listOwnTrainingRequests(personnel.id);
      const returnedRequests = data.filter(
        (request) => request.status === "returned_for_correction",
      );
      const previewEntries = await Promise.all(
        returnedRequests.map(async (request) => {
          const actions = await listTrainingRequestActions(request.id);
          const latestCorrectionAction = getLatestCorrectionAction(actions);
          return [
            request.id,
            {
              commentsPreview: truncateCorrectionPreview(
                getCorrectionCommentsDisplay(latestCorrectionAction),
              ),
            },
          ] as const;
        }),
      );

      startTransition(() => {
        setRequests(data);
        setCorrectionPreviews(Object.fromEntries(previewEntries));
        setIsLoading(false);
      });
    } catch (error) {
      startTransition(() => {
        setRequests([]);
        setCorrectionPreviews({});
        setLoadError(
          error instanceof Error
            ? error.message
            : "Unable to load training requests.",
        );
        setIsLoading(false);
      });
    }
  }, [personnel.id]);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  return (
    <div className="flex flex-1 flex-col bg-zinc-100">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-6">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl">
              My Requests
            </h1>
            <p className="mt-1 text-sm text-zinc-600">
              Review your saved drafts and submitted training requests.
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
          {LEGACY_LOCAL_STORAGE_NOTICE}
        </div>

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
        ) : requests.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-16 text-center shadow-sm shadow-zinc-200/60">
            <h2 className="text-lg font-semibold text-zinc-900">
              No training requests yet
            </h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-zinc-600">
              When you save a draft or submit a training request, it will appear
              here with its request number, course details, and current status.
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
                    <th className="px-4 py-3 font-semibold">Next Action</th>
                    <th className="px-4 py-3 font-semibold">Submitted</th>
                    <th className="px-4 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((request) => (
                    <tr
                      key={request.id}
                      className={cn(
                        "border-b border-zinc-100 last:border-b-0",
                        request.status === "draft" && "bg-zinc-50/80",
                      )}
                    >
                      <td className="px-4 py-4 align-top">
                        <div className="font-medium text-zinc-900">
                          {formatTrainingRequestIdentifier(request)}
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
                        <div className="space-y-2">
                          <span
                            className={cn(
                              "inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset",
                              request.status === "draft"
                                ? "bg-zinc-100 text-zinc-700 ring-zinc-200"
                                : request.status === "approved"
                                  ? "bg-green-50 text-green-900 ring-green-200"
                                  : request.status === "denied"
                                    ? "bg-red-50 text-red-900 ring-red-200"
                                    : request.status === "returned_for_correction"
                                      ? "bg-amber-100 text-amber-950 ring-amber-300"
                                      : "bg-amber-50 text-amber-900 ring-amber-200",
                            )}
                          >
                            {formatTrainingRequestStatus(request.status)}
                          </span>
                          {request.status === "returned_for_correction" ? (
                            <span className="inline-flex rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-900 ring-1 ring-red-200 ring-inset">
                              Action required
                            </span>
                          ) : null}
                          {request.status === "returned_for_correction" &&
                          correctionPreviews[request.id] ? (
                            <p className="max-w-xs text-xs leading-5 whitespace-pre-wrap text-amber-950">
                              {correctionPreviews[request.id].commentsPreview}
                            </p>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-4 align-top text-zinc-700">
                        {formatCurrentActionRole(request.currentActionRole) ??
                          "None"}
                      </td>
                      <td className="px-4 py-4 align-top whitespace-nowrap text-zinc-700">
                        {formatActionTimestamp(request.submittedAt)}
                      </td>
                      <td className="px-4 py-4 align-top">
                        <div className="flex flex-col gap-2">
                          {request.status === "draft" ? (
                            <Button
                              type="button"
                              variant="secondary"
                              className="h-9 px-3 text-xs"
                              onClick={() =>
                                router.push(
                                  `/requests/new?draft=${encodeURIComponent(request.id)}`,
                                )
                              }
                            >
                              Continue
                            </Button>
                          ) : null}
                          {request.status === "returned_for_correction" ? (
                            <>
                              <Link
                                href={`/requests/${encodeURIComponent(request.id)}/confirmation`}
                                className="inline-flex h-9 items-center rounded-xl border border-amber-300 bg-amber-50 px-3 text-xs font-semibold text-amber-950 shadow-sm hover:bg-amber-100"
                              >
                                Review corrections
                              </Link>
                              <Button
                                type="button"
                                className="h-9 px-3 text-xs"
                                onClick={() =>
                                  router.push(
                                    `/requests/new?draft=${encodeURIComponent(request.id)}`,
                                  )
                                }
                              >
                                Edit and Resubmit
                              </Button>
                            </>
                          ) : null}
                          {request.status !== "draft" ? (
                            <Link
                              href={`/requests/${encodeURIComponent(request.id)}/confirmation`}
                              className="inline-flex h-9 items-center rounded-xl border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-800 shadow-sm hover:bg-zinc-50"
                            >
                              View
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

export function MyRequestsView() {
  return (
    <AuthGate>
      {(personnel) => <MyRequestsContent personnel={personnel} />}
    </AuthGate>
  );
}
