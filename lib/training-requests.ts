import { roundCurrency } from "@/lib/currency";
import { calculateExpenseSummary } from "@/lib/expenses";
import { normalizePersonnelEmail } from "@/lib/personnel";
import { createClient } from "@/lib/supabase/client";
import { submitTrainingRequestWorkflow, resubmitTrainingRequestWorkflow } from "@/lib/training-request-workflow";
import type { AuthenticatedPersonnel } from "@/lib/auth/personnel";
import type {
  TrainingRequestDraft,
  TrainingRequestInsertInput,
  TrainingRequestRecord,
  TrainingRequestRow,
  TrainingRequestStatus,
  TrainingRequestUpdateInput,
} from "@/types/training-request";
import {
  TRAINING_REQUEST_STATUSES,
  TRAINING_REQUEST_STATUS_LABELS,
} from "@/types/training-request";

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function parseStatus(value: unknown): TrainingRequestStatus {
  const status = typeof value === "string" ? value : "";

  if (TRAINING_REQUEST_STATUSES.includes(status as TrainingRequestStatus)) {
    return status as TrainingRequestStatus;
  }

  return "pending_mto";
}

export function formatTrainingRequestStatus(status: TrainingRequestStatus): string {
  return TRAINING_REQUEST_STATUS_LABELS[status];
}

export function formatTrainingRequestIdentifier(
  request: Pick<TrainingRequestRecord, "status" | "requestNumber">,
): string {
  if (request.status === "draft") {
    return "Draft";
  }

  const requestNumber = request.requestNumber?.trim();
  if (!requestNumber) {
    return "Draft";
  }

  return requestNumber;
}

export function mapTrainingRequestRow(row: TrainingRequestRow): TrainingRequestRecord {
  return {
    id: row.id,
    requestNumber: row.request_number?.trim() || null,
    requesterPersonnelId: row.requester_personnel_id,
    requesterBadgeNumber: row.requester_badge_number,
    requesterEmail: row.requester_email,
    requesterName: row.requester_name,
    requesterTitleSnapshot: row.requester_title_snapshot ?? null,
    courseName: row.training_title,
    courseNumber: row.course_number,
    trainingProvider: row.provider,
    courseDescription: row.description,
    location: row.location,
    courseStartDate: row.start_date ?? "",
    courseEndDate: row.end_date ?? "",
    numberOfDaysOnDuty: row.number_of_days_on_duty,
    registrationFee: roundCurrency(asNumber(row.registration_cost)),
    lodging: roundCurrency(asNumber(row.lodging_cost)),
    foodExpenses: roundCurrency(asNumber(row.food_cost)),
    airfare: roundCurrency(asNumber(row.airfare_cost)),
    rentalVehicle: roundCurrency(asNumber(row.rental_vehicle_cost)),
    otherExpenses: roundCurrency(asNumber(row.other_cost)),
    mileageReimbursement: roundCurrency(asNumber(row.mileage_cost)),
    totalReimbursableMiles: Math.max(0, asNumber(row.total_reimbursable_miles)),
    gsaMileageRate: Math.max(0, asNumber(row.gsa_mileage_rate)),
    totalEstimatedExpenses: roundCurrency(asNumber(row.total_cost)),
    requestDepartmentVehicle: row.vehicle_requested,
    transportationNotes: row.department_vehicle_details,
    status: parseStatus(row.status),
    currentActionRole: row.current_action_role,
    submittedAt: row.submitted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function trainingRequestRecordToDraft(
  request: TrainingRequestRecord,
): TrainingRequestDraft {
  return {
    badgeNumber: request.requesterBadgeNumber,
    departmentEmail: request.requesterEmail,
    courseName: request.courseName,
    courseNumber: request.courseNumber,
    trainingProvider: request.trainingProvider,
    location: request.location,
    courseStartDate: request.courseStartDate,
    courseEndDate: request.courseEndDate,
    numberOfDaysOnDuty:
      request.numberOfDaysOnDuty > 0 ? String(request.numberOfDaysOnDuty) : "",
    courseDescription: request.courseDescription,
    requestDepartmentVehicle: request.requestDepartmentVehicle,
    registrationFee: request.registrationFee.toFixed(2),
    totalReimbursableMiles: request.totalReimbursableMiles.toString(),
    lodging: request.lodging.toFixed(2),
    airfare: request.airfare.toFixed(2),
    rentalVehicle: request.rentalVehicle.toFixed(2),
    foodExpenses: request.foodExpenses.toFixed(2),
    otherExpenses: request.otherExpenses.toFixed(2),
    transportationNotes: request.transportationNotes,
    confirmedAccurate: false,
  };
}

export function buildTrainingRequestInput(input: {
  personnel: AuthenticatedPersonnel;
  draft: TrainingRequestDraft;
  expenseSummary: ReturnType<typeof calculateExpenseSummary>;
}): TrainingRequestInsertInput {
  const normalizedEmail = normalizePersonnelEmail(input.draft.departmentEmail);

  return {
    requesterPersonnelId: input.personnel.id,
    requesterBadgeNumber: input.draft.badgeNumber.trim(),
    requesterEmail: normalizedEmail,
    courseName: input.draft.courseName.trim(),
    courseNumber: input.draft.courseNumber.trim(),
    trainingProvider: input.draft.trainingProvider.trim(),
    courseDescription: input.draft.courseDescription.trim(),
    location: input.draft.location.trim(),
    courseStartDate: input.draft.courseStartDate,
    courseEndDate: input.draft.courseEndDate,
    numberOfDaysOnDuty: Math.max(
      0,
      Number.parseInt(input.draft.numberOfDaysOnDuty, 10) || 0,
    ),
    registrationFee: input.expenseSummary.registrationFee,
    lodging: input.expenseSummary.lodging,
    foodExpenses: input.expenseSummary.foodExpenses,
    airfare: input.expenseSummary.airfare,
    rentalVehicle: input.expenseSummary.rentalVehicle,
    otherExpenses: input.expenseSummary.otherExpenses,
    mileageReimbursement: input.expenseSummary.mileageReimbursement,
    totalReimbursableMiles: input.expenseSummary.totalReimbursableMiles,
    gsaMileageRate: input.expenseSummary.gsaMileageRate,
    totalEstimatedExpenses: input.expenseSummary.totalEstimatedExpenses,
    requestDepartmentVehicle: input.draft.requestDepartmentVehicle,
    transportationNotes: input.draft.transportationNotes.trim(),
  };
}

function toDatabasePayload(
  input: TrainingRequestInsertInput | TrainingRequestUpdateInput,
) {
  return {
    requester_personnel_id: input.requesterPersonnelId,
    requester_badge_number: input.requesterBadgeNumber,
    requester_email: input.requesterEmail,
    training_title: input.courseName,
    course_number: input.courseNumber,
    provider: input.trainingProvider,
    description: input.courseDescription,
    location: input.location,
    start_date: input.courseStartDate || null,
    end_date: input.courseEndDate || null,
    number_of_days_on_duty: input.numberOfDaysOnDuty,
    registration_cost: input.registrationFee,
    lodging_cost: input.lodging,
    food_cost: input.foodExpenses,
    airfare_cost: input.airfare,
    rental_vehicle_cost: input.rentalVehicle,
    other_cost: input.otherExpenses,
    mileage_cost: input.mileageReimbursement,
    total_reimbursable_miles: input.totalReimbursableMiles,
    gsa_mileage_rate: input.gsaMileageRate,
    total_cost: input.totalEstimatedExpenses,
    vehicle_requested: input.requestDepartmentVehicle,
    department_vehicle_details: input.transportationNotes,
  };
}

export function getTrainingRequestErrorMessage(error: unknown): string {
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    if (
      "code" in error &&
      typeof error.code === "string" &&
      error.code === "PGRST116"
    ) {
      return "This draft no longer exists.";
    }

    if (
      error.message.includes("permission denied") ||
      error.message.includes("RLS")
    ) {
      return "Access denied by Supabase Row Level Security for this training request.";
    }

    if (error.message.includes("training_requests_date_range_check")) {
      return "Course end date cannot be before the course start date.";
    }

    if (error.message.includes("duplicate key")) {
      return "A training request with this request number already exists.";
    }

    if (
      error.message.includes("first and last name") ||
      error.message.includes("personnel profile must include")
    ) {
      return "Your personnel profile must include a first and last name before creating a training request.";
    }

    return error.message;
  }

  return "An unexpected error occurred while communicating with Supabase.";
}

export async function listOwnTrainingRequests(
  personnelId: string,
): Promise<TrainingRequestRecord[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("training_requests")
    .select("*")
    .eq("requester_personnel_id", personnelId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(getTrainingRequestErrorMessage(error));
  }

  return (data as TrainingRequestRow[]).map(mapTrainingRequestRow);
}

export async function getTrainingRequestByNumber(
  requestNumber: string,
): Promise<TrainingRequestRecord | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("training_requests")
    .select("*")
    .eq("request_number", requestNumber)
    .maybeSingle();

  if (error) {
    throw new Error(getTrainingRequestErrorMessage(error));
  }

  return data ? mapTrainingRequestRow(data as TrainingRequestRow) : null;
}

export async function getTrainingRequestById(
  requestId: string,
): Promise<TrainingRequestRecord | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("training_requests")
    .select("*")
    .eq("id", requestId)
    .maybeSingle();

  if (error) {
    throw new Error(getTrainingRequestErrorMessage(error));
  }

  return data ? mapTrainingRequestRow(data as TrainingRequestRow) : null;
}

export async function createTrainingRequestDraft(
  input: TrainingRequestInsertInput,
): Promise<TrainingRequestRecord> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("training_requests")
    .insert({
      ...toDatabasePayload(input),
      request_number: null,
      requester_name: "",
      status: "draft",
      current_action_role: null,
      submitted_at: null,
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(getTrainingRequestErrorMessage(error));
  }

  return mapTrainingRequestRow(data as TrainingRequestRow);
}

export async function updateTrainingRequestDraft(
  requestId: string,
  input: TrainingRequestUpdateInput,
): Promise<TrainingRequestRecord> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("training_requests")
    .update(toDatabasePayload(input))
    .eq("id", requestId)
    .eq("status", "draft")
    .select("*")
    .single();

  if (error) {
    throw new Error(getTrainingRequestErrorMessage(error));
  }

  return mapTrainingRequestRow(data as TrainingRequestRow);
}

export async function deleteOwnTrainingRequestDraft(
  requestId: string,
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("delete_own_training_request_draft", {
    p_request_id: requestId,
  });

  if (error) {
    throw new Error(getTrainingRequestErrorMessage(error));
  }
}

export async function updateReturnedTrainingRequest(
  requestId: string,
  input: TrainingRequestUpdateInput,
): Promise<TrainingRequestRecord> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("training_requests")
    .update(toDatabasePayload(input))
    .eq("id", requestId)
    .eq("status", "returned_for_correction")
    .select("*")
    .single();

  if (error) {
    throw new Error(getTrainingRequestErrorMessage(error));
  }

  return mapTrainingRequestRow(data as TrainingRequestRow);
}

export async function resubmitTrainingRequest(
  requestId: string,
  input: TrainingRequestUpdateInput,
): Promise<TrainingRequestRecord> {
  await updateReturnedTrainingRequest(requestId, input);
  return resubmitTrainingRequestWorkflow(requestId);
}

export async function submitTrainingRequest(
  requestId: string,
  input: TrainingRequestUpdateInput,
): Promise<TrainingRequestRecord> {
  await updateTrainingRequestDraft(requestId, input);
  return submitTrainingRequestWorkflow(requestId);
}

export async function createAndSubmitTrainingRequest(
  input: TrainingRequestInsertInput,
): Promise<TrainingRequestRecord> {
  const draft = await createTrainingRequestDraft(input);
  return submitTrainingRequest(draft.id, input);
}

export const LEGACY_LOCAL_STORAGE_NOTICE =
  "Development note: older browser-only test requests saved in localStorage are not migrated automatically.";
