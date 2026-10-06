"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { formatCurrency, formatMileageRate } from "@/lib/currency";
import {
  createMtoExpenseDraft,
  getMtoExpenseTotals,
  MTO_EXPENSE_FIELDS,
  parseMtoExpenseDraft,
} from "@/lib/mto-expense-review";
import { mtoUpdateTrainingRequestExpenses } from "@/lib/training-request-workflow";
import type { TrainingRequestRecord } from "@/types/training-request";

export function MtoExpenseEditor({
  request,
  onSaved,
  onCancel,
}: {
  request: TrainingRequestRecord;
  onSaved: () => Promise<void>;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(() => createMtoExpenseDraft(request));
  const [reason, setReason] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  let totals: ReturnType<typeof getMtoExpenseTotals> | null = null;
  try {
    totals = getMtoExpenseTotals(parseMtoExpenseDraft(draft, request), request);
  } catch {
    /* Invalid fields are reported on save. */
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      const values = parseMtoExpenseDraft(draft, request);
      if (!reason.trim() || reason.length > 2000)
        throw new Error(
          "Enter a reason for the expense changes (up to 2000 characters).",
        );
      setIsSaving(true);
      await mtoUpdateTrainingRequestExpenses(request, values, reason.trim());
      await onSaved();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Unable to save expense changes. Reload to check the request before trying again.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form
      onSubmit={save}
      className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm"
      aria-labelledby="expense-editor-title"
    >
      <h2
        id="expense-editor-title"
        className="text-lg font-semibold text-zinc-900"
      >
        Edit Estimated Expenses
      </h2>
      <p className="mt-2 text-sm text-zinc-600">
        Your reason and the original and revised estimates will appear in the
        request history. Save or cancel before signing.
      </p>
      <fieldset disabled={isSaving} className="mt-5 space-y-4">
        {MTO_EXPENSE_FIELDS.map(({ key, label }) => (
          <div
            key={key}
            className="grid items-center gap-2 sm:grid-cols-[1fr_12rem]"
          >
            <label
              htmlFor={`expense-${key}`}
              className="text-sm font-medium text-zinc-800"
            >
              {label} ($)
            </label>
            <Input
              id={`expense-${key}`}
              inputMode="decimal"
              value={draft[key]}
              className="text-right"
              onChange={(event) =>
                setDraft({ ...draft, [key]: event.target.value })
              }
            />
          </div>
        ))}
        <div>
          <label
            htmlFor="expense-description"
            className="text-sm font-medium text-zinc-800"
          >
            Other Expense Description
          </label>
          <Textarea
            id="expense-description"
            className="mt-2 min-h-20"
            value={draft.other_expense_description}
            maxLength={2000}
            placeholder="For example, parking and tolls"
            onChange={(event) =>
              setDraft({
                ...draft,
                other_expense_description: event.target.value,
              })
            }
          />
        </div>
        <div className="grid items-center gap-2 sm:grid-cols-[1fr_12rem]">
          <label
            htmlFor="expense-miles"
            className="text-sm font-medium text-zinc-800"
          >
            Reimbursable Miles
          </label>
          <Input
            id="expense-miles"
            inputMode="decimal"
            disabled={request.requestDepartmentVehicle}
            value={draft.total_reimbursable_miles}
            className="text-right"
            onChange={(event) =>
              setDraft({
                ...draft,
                total_reimbursable_miles: event.target.value,
              })
            }
          />
        </div>
        <p className="text-sm text-zinc-600">
          {request.requestDepartmentVehicle
            ? "A department vehicle is requested; reimbursable miles are unchanged."
            : `Mileage uses this request’s stored rate of ${formatMileageRate(request.gsaMileageRate)} per mile.`}
        </p>
        <dl
          className="space-y-3 border-y border-zinc-200 py-4"
          aria-live="polite"
        >
          <div className="flex justify-between gap-4 text-sm">
            <dt>Mileage Reimbursement</dt>
            <dd>{totals ? formatCurrency(totals.mileage) : "—"}</dd>
          </div>
          <div className="flex justify-between gap-4 font-bold">
            <dt>Total Estimated Expenses</dt>
            <dd>{totals ? formatCurrency(totals.total) : "—"}</dd>
          </div>
        </dl>
        <div>
          <label
            htmlFor="expense-reason"
            className="text-sm font-medium text-zinc-800"
          >
            Reason for Changes (required)
          </label>
          <Textarea
            id="expense-reason"
            required
            maxLength={2000}
            className="mt-2"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Explain the revised estimate"
          />
        </div>
        {error ? (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={isSaving}>
            {isSaving ? "Saving…" : "Save Expense Changes"}
          </Button>
          <Button variant="secondary" disabled={isSaving} onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </fieldset>
    </form>
  );
}
