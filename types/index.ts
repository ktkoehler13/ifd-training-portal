export type {
  ExpenseSummaryValues,
  TrainingRequestDraft,
  TrainingRequestInsertInput,
  TrainingRequestRecord,
  TrainingRequestRow,
  TrainingRequestStatus,
  TrainingRequestUpdateInput,
} from "@/types/training-request";

export {
  TRAINING_REQUEST_NUMBER_PREVIEW,
  TRAINING_REQUEST_STATUSES,
  TRAINING_REQUEST_STATUS_LABELS,
} from "@/types/training-request";

// Backward-compatible alias used by existing request UI imports.
export type { TrainingRequestRecord as TrainingRequest } from "@/types/training-request";
