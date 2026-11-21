import { requestStatusTone, type StatusTone } from "@/lib/request-status";
import { cn } from "@/lib/utils";
import { TRAINING_REQUEST_STATUS_LABELS, type TrainingRequestStatus } from "@/types/training-request";

const toneClasses: Record<StatusTone, string> = {
  neutral: "bg-zinc-100 text-zinc-700 ring-zinc-200",
  waiting: "bg-amber-50 text-amber-900 ring-amber-200",
  attention: "bg-orange-50 text-orange-900 ring-orange-200",
  success: "bg-green-50 text-green-800 ring-green-200",
  danger: "bg-red-50 text-red-800 ring-red-200",
};

export function RequestStatusBadge({ status, className }: { status: TrainingRequestStatus; className?: string }) {
  return <span className={cn("inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset", toneClasses[requestStatusTone(status)], className)}>
    {TRAINING_REQUEST_STATUS_LABELS[status]}
  </span>;
}
