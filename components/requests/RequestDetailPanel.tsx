"use client";

import { ExpenseSummary } from "@/components/requests/ExpenseSummary";
import { formatCurrency, formatMileageRate } from "@/lib/currency";
import { formatDepartmentVehicle } from "@/lib/expenses";
import { buildTrainingRequestFilename } from "@/lib/training-request-filename";
import {
  formatCurrentActionRole,
  formatActionTimestamp,
} from "@/lib/training-request-actions";
import {
  formatTrainingRequestStatus,
} from "@/lib/training-requests";
import type { TrainingRequestRecord } from "@/types/training-request";
import { cn } from "@/lib/utils";

function formatDisplayDate(value: string) {
  if (!value) {
    return "—";
  }

  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function DetailItem({
  label,
  value,
  emphasize = false,
  className,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-xs font-medium tracking-wide text-zinc-500 uppercase">
        {label}
      </dt>
      <dd
        className={
          emphasize
            ? "mt-1 text-base font-semibold text-zinc-900"
            : "mt-1 text-sm text-zinc-900"
        }
      >
        {value || "—"}
      </dd>
    </div>
  );
}

interface RequestDetailPanelProps {
  request: TrainingRequestRecord;
  className?: string;
}

export function RequestDetailPanel({
  request,
  className,
}: RequestDetailPanelProps) {
  const nextActor = formatCurrentActionRole(request.currentActionRole);

  return (
    <div className={cn("space-y-6", className)}>
      <dl className="grid gap-4 rounded-xl border border-zinc-200 bg-zinc-50 p-5 sm:grid-cols-2">
        <DetailItem
          label="Request number"
          value={request.requestNumber}
          emphasize
          className="sm:col-span-2"
        />
        <DetailItem label="Requester name" value={request.requesterName} />
        <DetailItem
          label="Requester badge"
          value={request.requesterBadgeNumber}
        />
        <DetailItem
          label="Planned document filename"
          value={buildTrainingRequestFilename(request)}
          emphasize
          className="sm:col-span-2"
        />
        <DetailItem label="Course name" value={request.courseName} />
        <DetailItem label="Course number" value={request.courseNumber} />
        <DetailItem label="Provider" value={request.trainingProvider} />
        <DetailItem label="Location" value={request.location} />
        <DetailItem
          label="Course dates"
          value={`${formatDisplayDate(request.courseStartDate)} – ${formatDisplayDate(request.courseEndDate)}`}
        />
        <DetailItem
          label="Number of days on duty"
          value={
            request.numberOfDaysOnDuty > 0
              ? String(request.numberOfDaysOnDuty)
              : "—"
          }
        />
        <DetailItem
          label="Description"
          value={request.courseDescription}
          className="sm:col-span-2"
        />
        <DetailItem
          label="Department vehicle requested"
          value={formatDepartmentVehicle(request.requestDepartmentVehicle)}
        />
        <DetailItem
          label="Transportation notes"
          value={request.transportationNotes}
          className="sm:col-span-2"
        />
        <DetailItem
          label="Total reimbursable miles"
          value={request.totalReimbursableMiles.toLocaleString("en-US", {
            maximumFractionDigits: 2,
          })}
        />
        <DetailItem
          label="GSA mileage rate used"
          value={`${formatMileageRate(request.gsaMileageRate)} / mile`}
        />
        <DetailItem
          label="Mileage reimbursement"
          value={formatCurrency(request.mileageReimbursement)}
        />
        <DetailItem
          label="Registration fee"
          value={formatCurrency(request.registrationFee)}
        />
        <DetailItem label="Lodging" value={formatCurrency(request.lodging)} />
        <DetailItem label="Airfare" value={formatCurrency(request.airfare)} />
        <DetailItem
          label="Rental vehicle"
          value={formatCurrency(request.rentalVehicle)}
        />
        <DetailItem
          label="Food / meals"
          value={formatCurrency(request.foodExpenses)}
        />
        <DetailItem
          label="Other expenses"
          value={formatCurrency(request.otherExpenses)}
        />
        <DetailItem
          label="Total estimated expenses"
          value={formatCurrency(request.totalEstimatedExpenses)}
          emphasize
          className="sm:col-span-2"
        />
        <div>
          <dt className="text-xs font-medium tracking-wide text-zinc-500 uppercase">
            Status
          </dt>
          <dd className="mt-1">
            <span className="inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900 ring-1 ring-amber-200 ring-inset">
              {formatTrainingRequestStatus(request.status)}
            </span>
          </dd>
        </div>
        <DetailItem
          label="Next action required by"
          value={nextActor ?? "No further action required"}
        />
        <DetailItem
          label="Submitted"
          value={formatActionTimestamp(request.submittedAt)}
        />
      </dl>

      <ExpenseSummary
        values={{
          registrationFee: request.registrationFee,
          totalReimbursableMiles: request.totalReimbursableMiles,
          requestDepartmentVehicle: request.requestDepartmentVehicle,
          gsaMileageRate: request.gsaMileageRate,
          mileageReimbursement: request.mileageReimbursement,
          lodging: request.lodging,
          airfare: request.airfare,
          rentalVehicle: request.rentalVehicle,
          foodExpenses: request.foodExpenses,
          otherExpenses: request.otherExpenses,
          totalEstimatedExpenses: request.totalEstimatedExpenses,
        }}
      />
    </div>
  );
}
