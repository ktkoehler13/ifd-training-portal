export type UserRole = "firefighter" | "officer" | "admin";

export interface User {
  id: string;
  name: string;
  role: UserRole;
}

export const SUPPORTED_TRAINING_REQUEST_STATUSES = [
  "Submitted — Awaiting MTO Review",
] as const;

export type TrainingRequestStatus =
  (typeof SUPPORTED_TRAINING_REQUEST_STATUSES)[number];

export interface TrainingRequest {
  id: string;
  requestNumber: string;
  requesterName: string;
  badgeNumber: string;
  departmentEmail: string;
  courseName: string;
  courseNumber: string;
  trainingProvider: string;
  location: string;
  courseStartDate: string;
  courseEndDate: string;
  numberOfDaysOnDuty: number;
  courseDescription: string;
  requestDepartmentVehicle: boolean;
  registrationFee: number;
  totalReimbursableMiles: number;
  gsaMileageRate: number;
  mileageReimbursement: number;
  lodging: number;
  airfare: number;
  rentalVehicle: number;
  foodExpenses: number;
  otherExpenses: number;
  transportationNotes: string;
  totalEstimatedExpenses: number;
  status: TrainingRequestStatus;
  submittedAt: string;
}

export interface TrainingRequestDraft {
  requesterName: string;
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
