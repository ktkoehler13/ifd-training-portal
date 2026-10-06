import {
  addCurrency,
  formatCurrency,
  isValidCurrencyInput,
} from "@/lib/currency";
import { calculateMileageReimbursement } from "@/lib/mileage";
import type { TrainingRequestRecord } from "@/types/training-request";

export const MTO_EXPENSE_FIELDS = [
  {
    key: "registration_cost",
    label: "Registration Fee",
    record: "registrationFee",
  },
  { key: "lodging_cost", label: "Lodging", record: "lodging" },
  { key: "airfare_cost", label: "Airfare", record: "airfare" },
  {
    key: "rental_vehicle_cost",
    label: "Rental Vehicle",
    record: "rentalVehicle",
  },
  { key: "food_cost", label: "Food / Meals", record: "foodExpenses" },
  { key: "other_cost", label: "Other Expense", record: "otherExpenses" },
] as const;

type ExpenseKey = (typeof MTO_EXPENSE_FIELDS)[number]["key"];
export type MtoExpenseDraft = Record<
  ExpenseKey | "total_reimbursable_miles" | "other_expense_description",
  string
>;
export type MtoExpenseValues = Record<
  ExpenseKey | "total_reimbursable_miles",
  number
> & { other_expense_description: string };
export interface ExpenseChangeSnapshot {
  before: Record<string, number | string | null>;
  after: Record<string, number | string | null>;
}

export function canEditMtoExpenses(
  role: string,
  request: Pick<TrainingRequestRecord, "status" | "currentActionRole">,
): boolean {
  return (
    role === "mto" &&
    request.status === "pending_mto" &&
    request.currentActionRole === "mto"
  );
}

export function createMtoExpenseDraft(
  request: TrainingRequestRecord,
): MtoExpenseDraft {
  return {
    registration_cost: String(request.registrationFee),
    lodging_cost: String(request.lodging),
    airfare_cost: String(request.airfare),
    rental_vehicle_cost: String(request.rentalVehicle),
    food_cost: String(request.foodExpenses),
    other_cost: String(request.otherExpenses),
    total_reimbursable_miles: String(request.totalReimbursableMiles),
    other_expense_description: request.otherExpenseDescription ?? "",
  };
}

export function parseMtoExpenseDraft(
  draft: MtoExpenseDraft,
  request: TrainingRequestRecord,
): MtoExpenseValues {
  const numericFields = [
    ...MTO_EXPENSE_FIELDS,
    { key: "total_reimbursable_miles", label: "Reimbursable Miles" },
  ] as const;
  for (const field of numericFields) {
    if (!draft[field.key].trim() || !isValidCurrencyInput(draft[field.key])) {
      throw new Error(
        `${field.label}: enter a nonnegative number with up to two decimal places.`,
      );
    }
  }
  const values = Object.fromEntries(
    numericFields.map(({ key }) => [
      key,
      Number(draft[key].replace(/,/g, "").trim()),
    ]),
  ) as Omit<MtoExpenseValues, "other_expense_description">;
  const description = draft.other_expense_description.trim();
  if (description.length > 2000)
    throw new Error(
      "Other Expense description must be 2000 characters or fewer.",
    );
  if (
    values.other_cost > 0 &&
    !description &&
    (values.other_cost !== request.otherExpenses ||
      request.otherExpenseDescription?.trim())
  ) {
    throw new Error(
      "Describe Other Expense when changing a positive Other Expense.",
    );
  }
  if (values.total_reimbursable_miles !== request.totalReimbursableMiles) {
    if (request.requestDepartmentVehicle)
      throw new Error(
        "Reimbursable miles cannot be changed when a department vehicle is requested.",
      );
    if (values.total_reimbursable_miles > 0 && !(request.gsaMileageRate > 0)) {
      throw new Error(
        "The request has no valid stored mileage rate. Return it for correction.",
      );
    }
  }
  return { ...values, other_expense_description: description };
}

export function getMtoExpenseTotals(
  values: MtoExpenseValues,
  request: TrainingRequestRecord,
) {
  const mileage =
    values.total_reimbursable_miles === request.totalReimbursableMiles
      ? request.mileageReimbursement
      : calculateMileageReimbursement(
          values.total_reimbursable_miles,
          request.gsaMileageRate,
        );
  return {
    mileage,
    total: addCurrency(
      mileage,
      ...MTO_EXPENSE_FIELDS.map(({ key }) => values[key]),
    ),
  };
}

export function getExpenseChangeRows(changes?: ExpenseChangeSnapshot | null) {
  if (!changes) return [];
  const labels: Record<string, string> = {
    ...Object.fromEntries(
      MTO_EXPENSE_FIELDS.map(({ key, label }) => [key, label]),
    ),
    total_reimbursable_miles: "Reimbursable Miles",
    other_expense_description: "Other Expense Description",
    mileage_cost: "Mileage Reimbursement",
    total_cost: "Total Estimated Expenses",
  };
  return Object.entries(labels)
    .filter(([key]) => changes.before[key] !== changes.after[key])
    .map(([key, label]) => {
      function display(value: number | string | null | undefined) {
        if (value == null || value === "") return "Not provided";
        return typeof value === "number" && key !== "total_reimbursable_miles"
          ? formatCurrency(value)
          : String(value);
      }
      return {
        key,
        label,
        before: display(changes.before[key]),
        after: display(changes.after[key]),
      };
    });
}

export function formatExpenseChangeSummary(
  changes?: ExpenseChangeSnapshot | null,
): string {
  return getExpenseChangeRows(changes)
    .map((row) => `${row.label}: ${row.before} to ${row.after}`)
    .join("\n");
}
