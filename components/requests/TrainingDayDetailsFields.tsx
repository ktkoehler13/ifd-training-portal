"use client";

import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import {
  normalizeOnDutyDatesForCount,
  resizeOnDutyDates,
  suggestTotalDaysIncludingTravel,
  TRAINING_DAY_DETAILS_MESSAGES,
} from "@/lib/training-day-details";
import type { TrainingRequestDraft } from "@/types/training-request";

type TrainingDayFieldErrors = Partial<
  Record<
    | "totalDaysIncludingTravel"
    | "numberOfDaysOnDuty"
    | "onDutyDates"
    | `onDutyDate${number}`,
    string
  >
>;

interface TrainingDayDetailsFieldsProps {
  draft: TrainingRequestDraft;
  errors: TrainingDayFieldErrors;
  onDraftChange: (draft: TrainingRequestDraft) => void;
}

export function TrainingDayDetailsFields({
  draft,
  errors,
  onDraftChange,
}: TrainingDayDetailsFieldsProps) {
  const suggestedTotal = suggestTotalDaysIncludingTravel(
    draft.courseStartDate,
    draft.courseEndDate,
  );
  const daysOnDutyCount = Number.parseInt(draft.numberOfDaysOnDuty, 10);
  const onDutyFieldCount = Number.isFinite(daysOnDutyCount)
    ? Math.max(0, daysOnDutyCount)
    : 0;
  const onDutyDates = normalizeOnDutyDatesForCount(
    draft.onDutyDates,
    onDutyFieldCount,
  );

  function updateDraft(next: Partial<TrainingRequestDraft>) {
    onDraftChange({ ...draft, ...next });
  }

  function handleDaysOnDutyChange(value: string) {
    const previousCount = Number.parseInt(draft.numberOfDaysOnDuty, 10);
    const nextCount = Number.parseInt(value, 10);
    const safePreviousCount = Number.isFinite(previousCount)
      ? Math.max(0, previousCount)
      : 0;

    if (!value.trim()) {
      updateDraft({
        numberOfDaysOnDuty: "",
        onDutyDates: [],
      });
      return;
    }

    if (!Number.isFinite(nextCount) || nextCount < 0) {
      updateDraft({ numberOfDaysOnDuty: value });
      return;
    }

    const resizeResult = resizeOnDutyDates(
      draft.onDutyDates,
      nextCount,
      safePreviousCount,
    );

    if (!resizeResult.confirmed) {
      return;
    }

    updateDraft({
      numberOfDaysOnDuty: value,
      onDutyDates: resizeResult.dates,
    });
  }

  function handleOnDutyDateChange(index: number, value: string) {
    const nextDates = [...onDutyDates];
    nextDates[index] = value;
    updateDraft({ onDutyDates: nextDates });
  }

  return (
    <>
      <Field
        id="totalDaysIncludingTravel"
        label="Total Number of Days Including Travel"
        error={errors.totalDaysIncludingTravel}
        className="sm:col-span-2"
      >
        <Input
          id="totalDaysIncludingTravel"
          inputMode="numeric"
          value={draft.totalDaysIncludingTravel}
          onChange={(event) =>
            updateDraft({ totalDaysIncludingTravel: event.target.value })
          }
          aria-invalid={errors.totalDaysIncludingTravel ? true : undefined}
          aria-describedby={
            errors.totalDaysIncludingTravel
              ? "totalDaysIncludingTravel-error"
              : "totalDaysIncludingTravel-help"
          }
        />
        <p
          id="totalDaysIncludingTravel-help"
          className="mt-2 text-xs leading-5 text-zinc-500"
        >
          Include all training and travel days.
          {suggestedTotal ? (
            <>
              {" "}
              Suggested total based on course dates: {suggestedTotal}.
            </>
          ) : null}
        </p>
      </Field>

      <Field
        id="numberOfDaysOnDuty"
        label="Number of Days On Duty During Training"
        error={errors.numberOfDaysOnDuty}
        className="sm:col-span-2"
      >
        <Input
          id="numberOfDaysOnDuty"
          inputMode="numeric"
          value={draft.numberOfDaysOnDuty}
          onChange={(event) => handleDaysOnDutyChange(event.target.value)}
          aria-invalid={errors.numberOfDaysOnDuty ? true : undefined}
          aria-describedby={
            errors.numberOfDaysOnDuty
              ? "numberOfDaysOnDuty-error"
              : "numberOfDaysOnDuty-help"
          }
        />
        <p
          id="numberOfDaysOnDuty-help"
          className="mt-2 text-xs leading-5 text-zinc-500"
        >
          Enter how many training or travel dates fall on your regularly
          scheduled duty days.
        </p>
      </Field>

      {onDutyFieldCount === 0 ? (
        <p className="sm:col-span-2 text-sm text-zinc-600">
          {TRAINING_DAY_DETAILS_MESSAGES.noOnDutyDatesRequired}
        </p>
      ) : (
        <div className="sm:col-span-2 grid gap-4 sm:grid-cols-2">
          {onDutyDates.map((value, index) => (
            <Field
              key={`on-duty-date-${index}`}
              id={`onDutyDate${index}`}
              label={`On-Duty Date ${index + 1}`}
              error={errors[`onDutyDate${index}`] ?? errors.onDutyDates}
            >
              <Input
                id={`onDutyDate${index}`}
                type="date"
                value={value}
                onChange={(event) =>
                  handleOnDutyDateChange(index, event.target.value)
                }
                aria-invalid={
                  errors[`onDutyDate${index}`] || errors.onDutyDates
                    ? true
                    : undefined
                }
              />
            </Field>
          ))}
        </div>
      )}
    </>
  );
}
