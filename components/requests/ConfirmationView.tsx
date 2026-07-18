"use client";

import { startTransition, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RequestActionTimeline } from "@/components/requests/RequestActionTimeline";
import { RequestDetailPanel } from "@/components/requests/RequestDetailPanel";
import { AuthGate } from "@/components/layout/AuthGate";
import { Button } from "@/components/ui/Button";
import { isAdministrativeRole } from "@/lib/auth/roles";
import type { AuthenticatedPersonnel } from "@/lib/auth/personnel";
import {
  formatCurrentActionRole,
  getLatestCorrectionComments,
  listTrainingRequestActions,
} from "@/lib/training-request-actions";
import {
  formatNotificationStatus,
  listTrainingRequestNotifications,
} from "@/lib/training-request-notifications";
import {
  formatTrainingRequestIdentifier,
  formatTrainingRequestStatus,
  getTrainingRequestById,
} from "@/lib/training-requests";
import type { TrainingRequestActionRecord } from "@/types/training-request-action";
import type { TrainingRequestNotificationRecord } from "@/types/training-request-action";
import type { TrainingRequestRecord } from "@/types/training-request";

interface ConfirmationViewProps {
  requestId: string;
}

function getPageHeading(request: TrainingRequestRecord) {
  switch (request.status) {
    case "draft":
      return "Draft request";
    case "returned_for_correction":
      return "Request returned for correction";
    case "approved":
      return "Request approved";
    case "denied":
      return "Request denied";
    case "pending_mto":
    case "pending_deputy_chief":
      return "Request submitted";
    default:
      return "Training request details";
  }
}

function ConfirmationContent({
  personnel,
  requestId,
}: {
  personnel: AuthenticatedPersonnel;
  requestId: string;
}) {
  const router = useRouter();
  const [request, setRequest] = useState<TrainingRequestRecord | null>(null);
  const [actions, setActions] = useState<TrainingRequestActionRecord[]>([]);
  const [notifications, setNotifications] = useState<
    TrainingRequestNotificationRecord[]
  >([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadRequest() {
      setIsLoading(true);
      setLoadError(null);

      try {
        const found = await getTrainingRequestById(requestId);
        if (!found) {
          throw new Error("Training request not found.");
        }

        const loadedActions = await listTrainingRequestActions(found.id);
        let loadedNotifications: TrainingRequestNotificationRecord[] = [];
        if (isAdministrativeRole(personnel.role)) {
          loadedNotifications = await listTrainingRequestNotifications(found.id);
        }

        if (!cancelled) {
          setRequest(found);
          setActions(loadedActions);
          setNotifications(loadedNotifications);
          setIsLoading(false);
        }
      } catch (error) {
        if (!cancelled) {
          setRequest(null);
          setActions([]);
          setNotifications([]);
          setLoadError(
            error instanceof Error
              ? error.message
              : "Unable to load training request.",
          );
          setIsLoading(false);
        }
      }
    }

    startTransition(() => {
      void loadRequest();
    });

    return () => {
      cancelled = true;
    };
  }, [personnel.role, requestId]);

  const correctionComments = getLatestCorrectionComments(actions);
  const canEditAndResubmit =
    request?.status === "returned_for_correction" &&
    request.requesterPersonnelId === personnel.id;

  return (
    <div className="flex flex-1 flex-col bg-zinc-100">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
        <div className="rounded-2xl bg-white p-6 shadow-sm shadow-zinc-200/60 sm:p-8">
          {isLoading ? (
            <p className="text-center text-sm text-zinc-500" role="status">
              Loading request...
            </p>
          ) : loadError ? (
            <>
              <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
                Unable to load request
              </h1>
              <p className="mt-2 text-sm leading-6 text-red-700" role="alert">
                {loadError}
              </p>
            </>
          ) : request ? (
            <>
              <div className="mb-6">
                <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
                  {getPageHeading(request)}
                </h1>
                <p className="mt-2 text-sm leading-6 text-zinc-600">
                  Request {formatTrainingRequestIdentifier(request)} ·{" "}
                  {formatTrainingRequestStatus(request.status)}
                  {request.currentActionRole
                    ? ` · Next action: ${formatCurrentActionRole(request.currentActionRole)}`
                    : null}
                </p>
              </div>

              {canEditAndResubmit && correctionComments ? (
                <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  <p className="font-semibold">Correction required</p>
                  <p className="mt-2 whitespace-pre-wrap">{correctionComments}</p>
                </div>
              ) : null}

              <RequestDetailPanel request={request} />

              <section className="mt-8">
                <h2 className="text-lg font-semibold text-zinc-900">
                  Approval Timeline
                </h2>
                <div className="mt-4">
                  <RequestActionTimeline actions={actions} />
                </div>
              </section>

              {isAdministrativeRole(personnel.role) &&
              notifications.length > 0 ? (
                <section className="mt-8">
                  <h2 className="text-lg font-semibold text-zinc-900">
                    Email Notification Delivery
                  </h2>
                  <div className="mt-4 overflow-x-auto rounded-xl border border-zinc-200">
                    <table className="min-w-full text-left text-sm">
                      <thead className="border-b border-zinc-200 bg-zinc-50 text-xs tracking-wide text-zinc-500 uppercase">
                        <tr>
                          <th className="px-3 py-2 font-semibold">Recipient</th>
                          <th className="px-3 py-2 font-semibold">Event</th>
                          <th className="px-3 py-2 font-semibold">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {notifications.map((notification) => (
                          <tr
                            key={notification.id}
                            className="border-b border-zinc-100 last:border-b-0"
                          >
                            <td className="px-3 py-3 text-zinc-700">
                              {notification.recipientEmail}
                            </td>
                            <td className="px-3 py-3 text-zinc-700">
                              {notification.eventType}
                            </td>
                            <td className="px-3 py-3 text-zinc-700">
                              {formatNotificationStatus(notification.status)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              ) : null}

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                {canEditAndResubmit ? (
                  <Button
                    className="w-full flex-1"
                    onClick={() =>
                      router.push(
                        `/requests/new?draft=${encodeURIComponent(request.id)}`,
                      )
                    }
                  >
                    Edit and Resubmit
                  </Button>
                ) : null}
                <Button
                  variant="secondary"
                  className="w-full flex-1"
                  onClick={() => router.push("/dashboard")}
                >
                  Return to Dashboard
                </Button>
                <Button
                  className="w-full flex-1"
                  onClick={() => router.push("/requests")}
                >
                  View My Requests
                </Button>
              </div>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
                Request not found
              </h1>
              <p className="mt-2 text-sm leading-6 text-zinc-600">
                No training request was found.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function ConfirmationView({ requestId }: ConfirmationViewProps) {
  return (
    <AuthGate>
      {(personnel) => (
        <ConfirmationContent personnel={personnel} requestId={requestId} />
      )}
    </AuthGate>
  );
}
