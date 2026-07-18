import { addCurrency } from "@/lib/currency";
import { calculateMileageReimbursement } from "@/lib/mileage";
import type { ExpenseSummaryValues } from "@/types/training-request";

export function calculateExpenseSummary(input: {
  requestDepartmentVehicle: boolean;
  totalReimbursableMiles: number;
  gsaMileageRate: number;
  registrationFee: number;
  lodging: number;
  airfare: number;
  rentalVehicle: number;
  foodExpenses: number;
  otherExpenses: number;
}): ExpenseSummaryValues {
  const effectiveMiles = input.requestDepartmentVehicle
    ? 0
    : Math.max(0, input.totalReimbursableMiles);

  const mileageReimbursement = input.requestDepartmentVehicle
    ? 0
    : calculateMileageReimbursement(effectiveMiles, input.gsaMileageRate);

  const totalEstimatedExpenses = addCurrency(
    input.registrationFee,
    mileageReimbursement,
    input.lodging,
    input.airfare,
    input.rentalVehicle,
    input.foodExpenses,
    input.otherExpenses,
  );

  return {
    registrationFee: input.registrationFee,
    totalReimbursableMiles: effectiveMiles,
    requestDepartmentVehicle: input.requestDepartmentVehicle,
    gsaMileageRate: input.gsaMileageRate,
    mileageReimbursement,
    lodging: input.lodging,
    airfare: input.airfare,
    rentalVehicle: input.rentalVehicle,
    foodExpenses: input.foodExpenses,
    otherExpenses: input.otherExpenses,
    totalEstimatedExpenses,
  };
}

export function formatDepartmentVehicle(value: boolean): string {
  return value ? "Yes" : "No";
}

export function formatTransportationIndicator(
  requestDepartmentVehicle: boolean,
): string {
  return requestDepartmentVehicle ? "Department Vehicle" : "Personal Mileage";
}
