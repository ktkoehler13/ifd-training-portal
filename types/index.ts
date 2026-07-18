export type UserRole = "firefighter" | "officer" | "admin";

export interface User {
  id: string;
  name: string;
  role: UserRole;
}

export type TrainingRequestStatus = "Submitted — Awaiting MTO Review";

export interface TrainingRequest {
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
  registrationFee: number;
  totalReimbursableMiles: number;
  gsaMileageRate: number;
  mileageReimbursement: number;
  lodging: number;
  airfare: number;
  rentalVehicle: number;
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
  registrationFee: string;
  totalReimbursableMiles: string;
  lodging: string;
  airfare: string;
  rentalVehicle: string;
  otherExpenses: string;
  transportationNotes: string;
  confirmedAccurate: boolean;
}

export interface ExpenseSummaryValues {
  registrationFee: number;
  totalReimbursableMiles: number;
  gsaMileageRate: number;
  mileageReimbursement: number;
  lodging: number;
  airfare: number;
  rentalVehicle: number;
  otherExpenses: number;
  totalEstimatedExpenses: number;
}
