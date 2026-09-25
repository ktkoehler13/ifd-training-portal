export type TrainingRequestSubmissionMode = "create" | "draft" | "returned";

export function resolveSubmissionGsaMileageRate(input: {
  mode: TrainingRequestSubmissionMode;
  storedRequestGsaMileageRate: number | null;
  currentServerRate: number | null;
}): number | null {
  if (
    input.mode === "returned" &&
    input.storedRequestGsaMileageRate !== null &&
    input.storedRequestGsaMileageRate > 0
  ) {
    return input.storedRequestGsaMileageRate;
  }

  return input.currentServerRate;
}
