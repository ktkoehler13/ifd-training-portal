"use client";

import { PageHeader } from "@/components/layout/PageHeader";

import Link from "next/link";
import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { AdminGate } from "@/components/layout/AuthGate";
import { formatCurrency } from "@/lib/currency";
import {
  formatTrainingRequestIdentifier,
  formatTrainingRequestStatus,
} from "@/lib/training-requests";
import { listAllTrainingRequestsForAdmin } from "@/lib/training-request-workflow";
import { cn } from "@/lib/utils";
import type { TrainingRequestRecord } from "@/types/training-request";
import type { AuthenticatedPersonnel } from "@/lib/auth/personnel";
import { canManageDeletedRequests, setTrainingRequestDeleted } from "@/lib/training-request-admin-deletion";
import { RequestDeletionDialog } from "@/components/admin/RequestDeletionDialog";
import { Button } from "@/components/ui/Button";
import { useSearchParams } from "next/navigation";

function AdminRequestsContent({ personnel }: { personnel: AuthenticatedPersonnel }) {
  const canDelete = canManageDeletedRequests(personnel.role);
  const searchParams = useSearchParams();
  const [showDeleted, setShowDeleted] = useState(canDelete && searchParams.get("view") === "deleted");
  const [selectedRequest, setSelectedRequest] = useState<TrainingRequestRecord | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const loadVersion = useRef(0);
  const [requests, setRequests] = useState<TrainingRequestRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadRequests = useCallback(async () => {
    const version = ++loadVersion.current;
    setIsLoading(true);
    setLoadError(null);

    try {
      const data = await listAllTrainingRequestsForAdmin(canDelete && showDeleted);
      if (version !== loadVersion.current) return;
      startTransition(() => {
        setRequests(data);
        setIsLoading(false);
      });
    } catch (error) {
      if (version !== loadVersion.current) return;
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
  }, [canDelete, showDeleted]);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  return (
    <div className="flex flex-1 flex-col bg-zinc-100">
      <PageHeader title="All Requests" description="View all training requests across the department. Signing actions remain limited to MTO and Deputy Chief workflow roles." />

      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
        {canDelete && <div className="flex flex-wrap gap-3" role="group" aria-label="Request list">
          <Button variant={showDeleted ? "secondary" : "primary"} aria-pressed={!showDeleted} onClick={() => { setShowDeleted(false); setSuccessMessage(null); }} className="px-5">Current Requests</Button>
          <Button variant={showDeleted ? "primary" : "secondary"} aria-pressed={showDeleted} onClick={() => { setShowDeleted(true); setSuccessMessage(null); }} className="px-5">Deleted Requests</Button>
        </div>}
        {successMessage && <p role="status" className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">{successMessage}</p>}
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
        ) : requests.length === 0 ? <p className="rounded-xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600">{showDeleted ? "No deleted requests." : "No training requests."}</p> : (
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
                      className={cn(
                        "border-b border-zinc-100 last:border-b-0",
                        !request.deletedAt && (request.status === "pending_mto" ||
                          request.status === "pending_deputy_chief" ||
                          request.status === "returned_for_correction") &&
                          "font-bold",
                      )}
                    >
                      <td className="px-4 py-4 align-top text-zinc-900">
                        {formatTrainingRequestIdentifier(request)}
                      </td>
                      <td className="px-4 py-4 align-top text-zinc-700">
                        {request.requesterName}
                      </td>
                      <td className="px-4 py-4 align-top text-zinc-700">
                        {request.courseName}
                      </td>
                      <td className="px-4 py-4 align-top text-zinc-700">
                        {formatTrainingRequestStatus(request.status)}
                        {request.deletedAt && <div className="mt-2 text-xs font-normal text-zinc-600">
                          <p>Deleted {new Date(request.deletedAt).toLocaleString()} by {request.deletedByName}</p>
                          <p className="mt-1 whitespace-pre-wrap break-words">{request.deletionReason}</p>
                        </div>}
                      </td>
                      <td className="px-4 py-4 align-top text-zinc-700">
                        {formatCurrency(request.totalEstimatedExpenses)}
                      </td>
                      <td className="px-4 py-4 align-top">
                        <div className="flex flex-col gap-2">
                          <Link
                            href={`/requests/${encodeURIComponent(request.id)}/confirmation`}
                            className="inline-flex h-9 items-center rounded-xl border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-800 shadow-sm hover:bg-zinc-50"
                          >
                            View
                          </Link>
                          {!request.deletedAt && (request.status === "pending_mto" ||
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
                          {canDelete && <button type="button" onClick={() => setSelectedRequest(request)}
                            aria-label={`${request.deletedAt ? "Restore" : "Delete"} ${request.courseName || "untitled request"}`}
                            className="inline-flex h-9 items-center rounded-xl border border-red-200 bg-white px-3 text-xs font-semibold text-red-700 hover:bg-red-50">
                            {request.deletedAt ? "Restore" : "Delete"}
                          </button>}
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
      {selectedRequest && <RequestDeletionDialog key={selectedRequest.id} request={selectedRequest} onClose={() => setSelectedRequest(null)}
        onConfirm={async (request, deleted, reason) => {
          await setTrainingRequestDeleted(request, deleted, reason);
          setRequests(current => current.filter(row => row.id !== request.id));
          setSuccessMessage(deleted ? "Request moved to Deleted Requests." : "Request restored to its original status.");
        }} />}
    </div>
  );
}

export function AdminRequestsView() {
  return (
    <AdminGate>
      {(personnel) => <AdminRequestsContent personnel={personnel} />}
    </AdminGate>
  );
}
