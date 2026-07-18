"use client";

import { startTransition, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ExpenseSummary } from "@/components/requests/ExpenseSummary";
import { PrototypeGate } from "@/components/layout/PrototypeGate";
import { Button } from "@/components/ui/Button";
import { formatCurrency, formatMileageRate } from "@/lib/currency";
import { getPrototypeRequest } from "@/lib/prototypeRequests";
import type { TrainingRequest } from "@/types";

interface ConfirmationViewProps {
  requestNumber: string;
}

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

export function ConfirmationView({ requestNumber }: ConfirmationViewProps) {
  const router = useRouter();
  const [request, setRequest] = useState<TrainingRequest | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const found = getPrototypeRequest(requestNumber);

    startTransition(() => {
      setRequest(found);
      setIsLoading(false);
    });
  }, [requestNumber]);

  return (
    <PrototypeGate>
      <div className="flex flex-1 flex-col bg-zinc-100">
        <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-4 py-12 sm:px-6">
          <div className="rounded-2xl bg-white p-6 shadow-sm shadow-zinc-200/60 sm:p-8">
            {isLoading ? (
              <p className="text-center text-sm text-zinc-500" role="status">
                Loading request...
              </p>
            ) : request ? (
              <>
                <div className="mb-6 text-center">
                  <div
                    className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-50 text-lg text-green-700"
                    aria-hidden="true"
                  >
                    ✓
                  </div>
                  <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
                    Request submitted
                  </h1>
                  <p className="mt-2 text-sm leading-6 text-zinc-600">
                    Your training request has been recorded in this prototype
                    environment and is ready for MTO review.
                  </p>
                </div>

                <dl className="space-y-4 rounded-xl border border-zinc-200 bg-zinc-50 p-5">
                  <ConfirmItem
                    label="Request number"
                    value={request.requestNumber}
                    emphasize
                  />
                  <ConfirmItem
                    label="Requester name"
                    value={request.requesterName}
                  />
                  <ConfirmItem label="Course name" value={request.courseName} />
                  <ConfirmItem
                    label="Course dates"
                    value={`${formatDisplayDate(request.courseStartDate)} – ${formatDisplayDate(request.courseEndDate)}`}
                  />
                  <ConfirmItem
                    label="Number of Days on Duty"
                    value={String(request.numberOfDaysOnDuty)}
                  />
                  <div>
                    <dt className="text-xs font-medium tracking-wide text-zinc-500 uppercase">
                      Status
                    </dt>
                    <dd className="mt-1">
                      <span className="inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900 ring-1 ring-amber-200 ring-inset">
                        {request.status}
                      </span>
                    </dd>
                  </div>
                  <ConfirmItem
                    label="Total Reimbursable Miles"
                    value={request.totalReimbursableMiles.toLocaleString(
                      "en-US",
                      { maximumFractionDigits: 2 },
                    )}
                  />
                  <ConfirmItem
                    label="GSA Mileage Rate Used"
                    value={`${formatMileageRate(request.gsaMileageRate)} / mile`}
                  />
                  <ConfirmItem
                    label="Mileage Reimbursement"
                    value={formatCurrency(request.mileageReimbursement)}
                  />
                  <ConfirmItem
                    label="Total Estimated Expenses"
                    value={formatCurrency(request.totalEstimatedExpenses)}
                    emphasize
                  />
                </dl>

                <div className="mt-6">
                  <ExpenseSummary
                    values={{
                      registrationFee: request.registrationFee,
                      totalReimbursableMiles: request.totalReimbursableMiles,
                      gsaMileageRate: request.gsaMileageRate,
                      mileageReimbursement: request.mileageReimbursement,
                      lodging: request.lodging,
                      airfare: request.airfare,
                      rentalVehicle: request.rentalVehicle,
                      otherExpenses: request.otherExpenses,
                      totalEstimatedExpenses: request.totalEstimatedExpenses,
                    }}
                  />
                </div>

                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <Button
                    variant="secondary"
                    className="w-full flex-1"
                    onClick={() => router.push("/dashboard")}
                  >
                    Return to Dashboard
                  </Button>
                  <Button
                    className="w-full flex-1"
                    onClick={() => router.push("/requests")}
                  >
                    View My Requests
                  </Button>
                </div>
              </>
            ) : (
              <>
                <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
                  Request not found
                </h1>
                <p className="mt-2 text-sm leading-6 text-zinc-600">
                  No prototype request was found for{" "}
                  <span className="font-medium text-zinc-900">
                    {requestNumber}
                  </span>
                  . It may have been cleared from this browser.
                </p>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <Button
                    variant="secondary"
                    className="w-full flex-1"
                    onClick={() => router.push("/dashboard")}
                  >
                    Return to Dashboard
                  </Button>
                  <Button
                    className="w-full flex-1"
                    onClick={() => router.push("/requests")}
                  >
                    View My Requests
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </PrototypeGate>
  );
}

function ConfirmItem({
  label,
  value,
  emphasize = false,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
}) {
  return (
    <div>
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
