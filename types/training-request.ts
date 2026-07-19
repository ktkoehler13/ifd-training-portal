import type { PersonnelRole, PersonnelTitle } from "@/types/personnel";

export const TRAINING_REQUEST_STATUSES = [
  "draft",
  "submitted",
  "pending_mto",
  "pending_deputy_chief",
  "returned_for_correction",
  "approved",
  "denied",
  "cancelled",
] as const;

export type TrainingRequestStatus =
  (typeof TRAINING_REQUEST_STATUSES)[number];

export const TRAINING_REQUEST_STATUS_LABELS: Record<
  TrainingRequestStatus,
  string
> = {
  draft: "Draft",
  submitted: "Submitted",
  pending_mto: "Pending MTO Review",
  pending_deputy_chief: "Pending Deputy Chief Review",
  returned_for_correction: "Returned for Correction",
  approved: "Approved",
  denied: "Denied",
  cancelled: "Cancelled",
};

export const TRAINING_REQUEST_NUMBER_PREVIEW =
  "Koehler, K, Fire Officer I, 2026.1";

export const TRAINING_REQUEST_DRAFT_LABEL = "Draft";

export interface TrainingRequestRow {
  id: string;
  request_number: string | null;
  requester_personnel_id: string;
  requester_badge_number: string;
  requester_email: string;
  requester_name: string;
  requester_title_snapshot: PersonnelTitle | null;
  training_title: string;
  course_number: string;
  provider: string;
  description: string;
  location: string;
  start_date: string | null;
  end_date: string | null;
  number_of_days_on_duty: number;
  registration_cost: number;
  lodging_cost: number;
  food_cost: number;
  airfare_cost: number;
  rental_vehicle_cost: number;
  other_cost: number;
  mileage_cost: number;
  total_reimbursable_miles: number;
  gsa_mileage_rate: number;
  total_cost: number;
  vehicle_requested: boolean;
  department_vehicle_details: string;
  status: TrainingRequestStatus;
  current_action_role: PersonnelRole | null;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TrainingRequestRecord {
  id: string;
  requestNumber: string | null;
  requesterPersonnelId: string;
  requesterBadgeNumber: string;
  requesterEmail: string;
  requesterName: string;
  requesterTitleSnapshot: PersonnelTitle | null;
  courseName: string;
  courseNumber: string;
  trainingProvider: string;
  courseDescription: string;
  location: string;
  courseStartDate: string;
  courseEndDate: string;
  numberOfDaysOnDuty: number;
  registrationFee: number;
  lodging: number;
  foodExpenses: number;
  airfare: number;
  rentalVehicle: number;
  otherExpenses: number;
  mileageReimbursement: number;
  totalReimbursableMiles: number;
  gsaMileageRate: number;
  totalEstimatedExpenses: number;
  requestDepartmentVehicle: boolean;
  transportationNotes: string;
  status: TrainingRequestStatus;
  currentActionRole: PersonnelRole | null;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TrainingRequestInsertInput {
  requesterPersonnelId: string;
  requesterBadgeNumber: string;
  requesterEmail: string;
  courseName: string;
  courseNumber: string;
  trainingProvider: string;
  courseDescription: string;
  location: string;
  courseStartDate: string;
  courseEndDate: string;
  numberOfDaysOnDuty: number;
  registrationFee: number;
  lodging: number;
  foodExpenses: number;
  airfare: number;
  rentalVehicle: number;
  otherExpenses: number;
  mileageReimbursement: number;
  totalReimbursableMiles: number;
  gsaMileageRate: number;
  totalEstimatedExpenses: number;
  requestDepartmentVehicle: boolean;
  transportationNotes: string;
}

export type TrainingRequestUpdateInput = TrainingRequestInsertInput;

export interface TrainingRequestDraft {
  badgeNumber: string;
  departmentEmail: string;
  courseName: string;
  courseNumber: string;
  trainingProvider: string;
  location: string;
  courseStartDate: string;
  courseEndDate: string;
  numberOfDaysOnDuty: string;
  courseDescription: string;
  requestDepartmentVehicle: boolean;
  registrationFee: string;
  totalReimbursableMiles: string;
  lodging: string;
  airfare: string;
  rentalVehicle: string;
  foodExpenses: string;
  otherExpenses: string;
  transportationNotes: string;
  confirmedAccurate: boolean;
}

export interface ExpenseSummaryValues {
  registrationFee: number;
  totalReimbursableMiles: number;
  requestDepartmentVehicle: boolean;
  gsaMileageRate: number;
  mileageReimbursement: number;
  lodging: number;
  airfare: number;
  rentalVehicle: number;
  foodExpenses: number;
  otherExpenses: number;
  totalEstimatedExpenses: number;
}
