import type { StateCourseDetails } from "@/lib/state-course-details";
import type { TrainingLocationType } from "@/lib/training-location";
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
  deleted_at?: string | null;
  deleted_by_name?: string | null;
  deletion_reason?: string | null;
  id: string;
  request_number: string | null;
  requester_personnel_id: string;
  requester_badge_number: string;
  requester_email: string;
  request_contact_email?: string | null;
  location_type?: TrainingLocationType | null;
  academy_meal_days?: number | null;
  academy_ssn_last4?: string | null;
  requester_name: string;
  requester_title_snapshot: PersonnelTitle | null;
  requester_address?: string | null;
  requester_city?: string | null;
  requester_state?: string | null;
  requester_zip?: string | null;
  requester_phone?: string | null;
  ny_training_id?: string | null;

  training_title: string;
  course_number: string;
  is_ofpc_course: boolean | null;
  provider: string;
  description: string;
  location: string;
  start_date: string | null;
  end_date: string | null;
  total_days_including_travel: number | null;
  number_of_days_on_duty: number;
  on_duty_dates: string[];
  registration_cost: number;
  lodging_cost: number;
  food_cost: number;
  airfare_cost: number;
  rental_vehicle_cost: number;
  other_cost: number;
  other_expense_description?: string | null;
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

export interface TrainingRequestRecord extends StateCourseDetails {
  deletedAt?: string | null;
  deletedByName?: string | null;
  deletionReason?: string | null;
  requestContactEmail?: string | null;
  locationType?: TrainingLocationType | "";
  academyMealDays?: number | null;
  academySsnLast4?: string | null;
  id: string;
  requestNumber: string | null;
  requesterPersonnelId: string;
  requesterBadgeNumber: string;
  requesterEmail: string;
  requesterName: string;
  requesterTitleSnapshot: PersonnelTitle | null;
  courseName: string;
  courseNumber: string;
  isOfpcCourse: boolean | null;
  trainingProvider: string;
  courseDescription: string;
  location: string;
  courseStartDate: string;
  courseEndDate: string;
  totalDaysIncludingTravel: number | null;
  numberOfDaysOnDuty: number;
  onDutyDates: string[];
  registrationFee: number;
  lodging: number;
  foodExpenses: number;
  airfare: number;
  rentalVehicle: number;
  otherExpenses: number;
  otherExpenseDescription?: string | null;
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

export interface TrainingRequestInsertInput extends StateCourseDetails {
  requestContactEmail?: string | null;
  locationType?: TrainingLocationType | "";
  academyMealDays?: number | null;
  academySsnLast4?: string | null;
  requesterPersonnelId: string;
  requesterBadgeNumber: string;
  requesterEmail: string;
  courseName: string;
  courseNumber: string;
  isOfpcCourse: boolean | null;
  trainingProvider: string;
  courseDescription: string;
  location: string;
  courseStartDate: string;
  courseEndDate: string;
  totalDaysIncludingTravel: number | null;
  numberOfDaysOnDuty: number;
  onDutyDates: string[];
  registrationFee: number;
  lodging: number;
  foodExpenses: number;
  airfare: number;
  rentalVehicle: number;
  otherExpenses: number;
  otherExpenseDescription?: string | null;
  mileageReimbursement: number;
  totalReimbursableMiles: number;
  gsaMileageRate: number;
  totalEstimatedExpenses: number;
  requestDepartmentVehicle: boolean;
  transportationNotes: string;
}

export type TrainingRequestUpdateInput = TrainingRequestInsertInput;

export interface TrainingRequestDraft extends StateCourseDetails {
  locationType?: TrainingLocationType | "";
  academyMealDays?: string;
  academySsnLast4?: string;
  badgeNumber: string;
  departmentEmail: string;
  courseName: string;
  courseNumber: string;
  isOfpcCourse: boolean | null;
  trainingProvider: string;
  location: string;
  courseStartDate: string;
  courseEndDate: string;
  totalDaysIncludingTravel: string;
  numberOfDaysOnDuty: string;
  onDutyDates: string[];
  courseDescription: string;
  requestDepartmentVehicle: boolean;
  registrationFee: string;
  totalReimbursableMiles: string;
  lodging: string;
  airfare: string;
  rentalVehicle: string;
  foodExpenses: string;
  otherExpenses: string;
  otherExpenseDescription: string;
  transportationNotes: string;
  confirmedAccurate: boolean;
  requesterSignatureConfirmed?: boolean;
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
  otherExpenseDescription?: string | null;
  totalEstimatedExpenses: number;
}
