import {
  formatCorrectionReviewerLabel,
  getCorrectionCommentsDisplay,
  getCorrectionReturnedAt,
} from "@/lib/training-request-actions";
import type { TrainingRequestActionRecord } from "@/types/training-request-action";
import type { TrainingRequestStatus } from "@/types/training-request";
import { cn } from "@/lib/utils";

export function shouldShowCorrectionAlert(
  status: TrainingRequestStatus,
): boolean {
  return status === "returned_for_correction";
}

export function shouldShowWizardCorrectionAlert(
  editableStatus: "draft" | "returned_for_correction" | null,
): boolean {
  return editableStatus === "returned_for_correction";
}

interface CorrectionRequiredAlertProps {
  action: TrainingRequestActionRecord | null;
  variant?: "detail" | "wizard";
  showResubmitHint?: boolean;
  className?: string;
}

function WarningIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="mt-0.5 h-5 w-5 shrink-0 text-amber-700"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"
      />
    </svg>
  );
}

export function CorrectionRequiredAlert({
  action,
  variant = "detail",
  showResubmitHint = false,
  className,
}: CorrectionRequiredAlertProps) {
  const heading =
    variant === "wizard"
      ? "Corrections required before resubmission"
      : "Request returned for correction";
  const reviewerLabel = action
    ? formatCorrectionReviewerLabel(action)
    : "Unknown reviewer";
  const returnedAt = action ? getCorrectionReturnedAt(action) : "—";
  const comments = getCorrectionCommentsDisplay(action);

  return (
    <div
      role="alert"
      className={cn(
        "rounded-xl border-2 border-amber-300 bg-amber-50 px-4 py-4 text-sm text-amber-950 shadow-sm",
        className,
      )}
    >
      <div className="flex gap-3">
        <WarningIcon />
        <div className="min-w-0 flex-1 space-y-3">
          <h2 className="text-base font-semibold text-amber-950">{heading}</h2>

          <dl className="space-y-1 text-sm">
            <div>
              <dt className="inline font-medium">Returned by: </dt>
              <dd className="inline">{reviewerLabel}</dd>
            </div>
            <div>
              <dt className="inline font-medium">Returned on: </dt>
              <dd className="inline">{returnedAt}</dd>
            </div>
          </dl>

          <div>
            <p className="font-medium">Required corrections:</p>
            <p className="mt-2 whitespace-pre-wrap rounded-lg border border-amber-200 bg-white/70 px-3 py-2 text-amber-950">
              {comments}
            </p>
          </div>

          {showResubmitHint ? (
            <p className="font-medium">
              Edit the request below and resubmit it for review.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
