"use client";

import Link from "next/link";
import { startTransition, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { WorkflowActionDialog } from "@/components/approvals/WorkflowActionDialog";
import { RequestActionTimeline } from "@/components/requests/RequestActionTimeline";
import { RequestDetailPanel } from "@/components/requests/RequestDetailPanel";
import { AuthGate } from "@/components/layout/AuthGate";
import { Button } from "@/components/ui/Button";
import { isAdministrativeRole } from "@/lib/auth/roles";
import type { AuthenticatedPersonnel } from "@/lib/auth/personnel";
import {
  getLatestCorrectionComments,
  listTrainingRequestActions,
} from "@/lib/training-request-actions";
import {
  formatNotificationStatus,
  listTrainingRequestNotifications,
} from "@/lib/training-request-notifications";
import { getTrainingRequestById } from "@/lib/training-requests";
import {
  canPerformDeputyChiefReview,
  canPerformMtoReview,
  deputyApproveTrainingRequest,
  deputyDenyTrainingRequest,
  deputyReturnTrainingRequest,
  mtoApproveTrainingRequest,
  mtoDenyTrainingRequest,
  mtoReturnTrainingRequest,
  type WorkflowActionKind,
} from "@/lib/training-request-workflow";
import type { TrainingRequestActionRecord } from "@/types/training-request-action";
import type { TrainingRequestNotificationRecord } from "@/types/training-request-action";
import type { TrainingRequestRecord } from "@/types/training-request";

interface ApprovalReviewContentProps {
  personnel: AuthenticatedPersonnel;
  requestId: string;
}

function ApprovalReviewContent({
  personnel,
  requestId,
}: ApprovalReviewContentProps) {
  const router = useRouter();
  const [request, setRequest] = useState<TrainingRequestRecord | null>(null);
  const [actions, setActions] = useState<TrainingRequestActionRecord[]>([]);
  const [notifications, setNotifications] = useState<
    TrainingRequestNotificationRecord[]
  >([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<WorkflowActionKind | null>(
    null,
  );
  const [actionError, setActionError] = useState<string | null>(null);

  const loadReview = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);

    try {
      const [loadedRequest, loadedActions] = await Promise.all([
        getTrainingRequestById(requestId),
        listTrainingRequestActions(requestId),
      ]);

      if (!loadedRequest) {
        throw new Error("Training request not found.");
      }

      let loadedNotifications: TrainingRequestNotificationRecord[] = [];
      if (isAdministrativeRole(personnel.role)) {
        loadedNotifications = await listTrainingRequestNotifications(requestId);
      }

      startTransition(() => {
        setRequest(loadedRequest);
        setActions(loadedActions);
        setNotifications(loadedNotifications);
        setIsLoading(false);
      });
    } catch (error) {
      startTransition(() => {
        setRequest(null);
        setActions([]);
        setNotifications([]);
        setLoadError(
          error instanceof Error
            ? error.message
            : "Unable to load training request review.",
        );
        setIsLoading(false);
      });
    }
  }, [personnel.role, requestId]);

  useEffect(() => {
    void loadReview();
  }, [loadReview]);

  const showMtoActions =
    request && canPerformMtoReview(personnel.role, request.status);
  const showDeputyActions =
    request && canPerformDeputyChiefReview(personnel.role, request.status);

  async function handleWorkflowConfirm(input: {
    action: WorkflowActionKind;
    comments: string;
    electronicSignatureConfirmed: boolean;
  }) {
    if (!request) {
      return;
    }

    setActionError(null);

    switch (input.action) {
      case "mto_approve":
        await mtoApproveTrainingRequest(
          request.id,
          input.comments,
          input.electronicSignatureConfirmed,
        );
        break;
      case "mto_return":
        await mtoReturnTrainingRequest(request.id, input.comments);
        break;
      case "mto_deny":
        await mtoDenyTrainingRequest(request.id, input.comments);
        break;
      case "deputy_approve":
        await deputyApproveTrainingRequest(
          request.id,
          input.comments,
          input.electronicSignatureConfirmed,
        );
        break;
      case "deputy_return":
        await deputyReturnTrainingRequest(request.id, input.comments);
        break;
      case "deputy_deny":
        await deputyDenyTrainingRequest(request.id, input.comments);
        break;
      default:
        throw new Error("Unsupported workflow action.");
    }

    router.push("/approvals");
    router.refresh();
  }

  return (
    <div className="flex flex-1 flex-col bg-zinc-100">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-6">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl">
              Review Training Request
            </h1>
            <p className="mt-1 text-sm text-zinc-600">
              Review the complete request, action history, and workflow actions.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/approvals"
              className="inline-flex h-11 items-center justify-center rounded-xl border border-zinc-200 bg-white px-5 text-sm font-semibold text-zinc-800 shadow-sm transition-colors hover:bg-zinc-50"
            >
              Approval Queue
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex h-11 items-center justify-center rounded-xl border border-zinc-200 bg-white px-5 text-sm font-semibold text-zinc-800 shadow-sm transition-colors hover:bg-zinc-50"
            >
              Dashboard
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
        {isLoading ? (
          <p className="text-sm text-zinc-500" role="status">
            Loading request review...
          </p>
        ) : loadError ? (
          <div
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
            role="alert"
          >
            {loadError}
          </div>
        ) : request ? (
          <>
            {getLatestCorrectionComments(actions) ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <p className="font-semibold">Latest correction comments</p>
                <p className="mt-2 whitespace-pre-wrap">
                  {getLatestCorrectionComments(actions)}
                </p>
              </div>
            ) : null}

            <RequestDetailPanel request={request} />

            {showMtoActions || showDeputyActions ? (
              <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm shadow-zinc-200/60">
                <h2 className="text-lg font-semibold text-zinc-900">
                  Workflow Actions
                </h2>
                <p className="mt-2 text-sm text-zinc-600">
                  Actions are available only when your exact personnel role matches
                  the current workflow step.
                </p>
                {actionError ? (
                  <p className="mt-4 text-sm text-red-700" role="alert">
                    {actionError}
                  </p>
                ) : null}
                <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                  <Button onClick={() => setPendingAction(
                    showMtoActions ? "mto_approve" : "deputy_approve",
                  )}>
                    Sign and Approve
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => setPendingAction(
                      showMtoActions ? "mto_return" : "deputy_return",
                    )}
                  >
                    Return for Correction
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => setPendingAction(
                      showMtoActions ? "mto_deny" : "deputy_deny",
                    )}
                  >
                    Deny
                  </Button>
                </div>
              </section>
            ) : null}

            <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm shadow-zinc-200/60">
              <h2 className="text-lg font-semibold text-zinc-900">
                Approval Timeline
              </h2>
              <div className="mt-5">
                <RequestActionTimeline actions={actions} />
              </div>
            </section>

            {isAdministrativeRole(personnel.role) && notifications.length > 0 ? (
              <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm shadow-zinc-200/60">
                <h2 className="text-lg font-semibold text-zinc-900">
                  Email Notification Delivery
                </h2>
                <p className="mt-2 text-sm text-zinc-600">
                  Delivery status is shown for administrative troubleshooting only.
                </p>
                <div className="mt-5 overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="border-b border-zinc-200 text-xs tracking-wide text-zinc-500 uppercase">
                      <tr>
                        <th className="px-3 py-2 font-semibold">Recipient</th>
                        <th className="px-3 py-2 font-semibold">Event</th>
                        <th className="px-3 py-2 font-semibold">Status</th>
                        <th className="px-3 py-2 font-semibold">Sent</th>
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
                          <td className="px-3 py-3 text-zinc-700">
                            {notification.sentAt
                              ? new Date(notification.sentAt).toLocaleString()
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}
          </>
        ) : null}
      </div>

      <WorkflowActionDialog
        action={pendingAction}
        personnel={personnel}
        onClose={() => setPendingAction(null)}
        onConfirm={handleWorkflowConfirm}
      />
    </div>
  );
}

interface ApprovalReviewViewProps {
  requestId: string;
}

export function ApprovalReviewView({ requestId }: ApprovalReviewViewProps) {
  return (
    <AuthGate>
      {(personnel) => (
        <ApprovalReviewContent personnel={personnel} requestId={requestId} />
      )}
    </AuthGate>
  );
}
