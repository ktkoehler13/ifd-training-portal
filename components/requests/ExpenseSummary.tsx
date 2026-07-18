import {
  formatCurrency,
  formatMileageRate,
} from "@/lib/currency";
import { formatDepartmentVehicle } from "@/lib/expenses";
import type { ExpenseSummaryValues } from "@/types";

interface ExpenseSummaryProps {
  values: ExpenseSummaryValues;
  rateAvailable?: boolean;
}

export function ExpenseSummary({
  values,
  rateAvailable = true,
}: ExpenseSummaryProps) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-4">
      <h3 className="text-sm font-semibold text-zinc-900">Expense summary</h3>
      <dl className="mt-3 space-y-2 text-sm">
        <SummaryRow
          label="Registration Fee"
          value={formatCurrency(values.registrationFee)}
        />
        <SummaryRow
          label="Total Reimbursable Miles"
          value={values.totalReimbursableMiles.toLocaleString("en-US", {
            maximumFractionDigits: 2,
          })}
        />
        <SummaryRow
          label="Department Vehicle Requested"
          value={formatDepartmentVehicle(values.requestDepartmentVehicle)}
        />
        <SummaryRow
          label="GSA Mileage Rate"
          value={
            rateAvailable
              ? `${formatMileageRate(values.gsaMileageRate)} / mile`
              : "Not configured"
          }
        />
        <SummaryRow
          label="Mileage Reimbursement"
          value={formatCurrency(values.mileageReimbursement)}
        />
        <SummaryRow label="Lodging" value={formatCurrency(values.lodging)} />
        <SummaryRow label="Airfare" value={formatCurrency(values.airfare)} />
        <SummaryRow
          label="Rental Vehicle"
          value={formatCurrency(values.rentalVehicle)}
        />
        <SummaryRow
          label="Food / Meals"
          value={formatCurrency(values.foodExpenses)}
        />
        <SummaryRow
          label="Other Expenses"
          value={formatCurrency(values.otherExpenses)}
        />
        <div className="border-t border-zinc-200 pt-2">
          <SummaryRow
            label="Total Estimated Expenses"
            value={formatCurrency(values.totalEstimatedExpenses)}
            emphasize
          />
        </div>
      </dl>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  emphasize = false,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className={emphasize ? "font-semibold text-zinc-900" : "text-zinc-600"}>
        {label}
      </dt>
      <dd
        className={
          emphasize
            ? "text-right font-semibold text-zinc-900"
            : "text-right text-zinc-900"
        }
      >
        {value}
      </dd>
    </div>
  );
}
