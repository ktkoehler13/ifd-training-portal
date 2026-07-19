"use client";

import { FormEvent, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ExpenseSummary } from "@/components/requests/ExpenseSummary";
import {
  CorrectionRequiredAlert,
  shouldShowWizardCorrectionAlert,
} from "@/components/requests/CorrectionRequiredAlert";
import { TrainingDayDetailsFields } from "@/components/requests/TrainingDayDetailsFields";
import { WizardProgress } from "@/components/requests/WizardProgress";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import type { AuthenticatedPersonnel } from "@/lib/auth/personnel";
import {
  formatCurrency,
  formatCurrencyInput,
  formatMileageRate,
  isValidCurrencyInput,
  parseCurrencyInput,
} from "@/lib/currency";
import {
  calculateExpenseSummary,
  formatDepartmentVehicle,
} from "@/lib/expenses";
import {
  getGsaMileageRate,
  isValidMilesInput,
  parseMilesInput,
} from "@/lib/mileage";
import {
  formatPersonnelFullName,
  hasCompletePersonnelName,
  normalizePersonnelEmail,
  PERSONNEL_NAME_REQUIRED_MESSAGE,
} from "@/lib/personnel";
import {
  getLatestCorrectionAction,
  listTrainingRequestActions,
} from "@/lib/training-request-actions";
import { DRAFT_NO_LONGER_EXISTS_MESSAGE } from "@/lib/training-request-draft-deletion";
import {
  validateTrainingDayDetails,
} from "@/lib/training-day-details";
import {
  buildTrainingRequestInput,
  createAndSubmitTrainingRequest,
  createTrainingRequestDraft,
  getTrainingRequestById,
  resubmitTrainingRequest,
  submitTrainingRequest,
  trainingRequestRecordToDraft,
  updateReturnedTrainingRequest,
  updateTrainingRequestDraft,
} from "@/lib/training-requests";
import { TRAINING_REQUEST_NUMBER_PREVIEW } from "@/types/training-request";
import type { TrainingRequestActionRecord } from "@/types/training-request-action";
import type { TrainingRequestDraft } from "@/types";
import { cn } from "@/lib/utils";

const TOTAL_STEPS = 4;

const initialDraft: TrainingRequestDraft = {
  badgeNumber: "",
  departmentEmail: "",
  courseName: "",
  courseNumber: "",
  trainingProvider: "",
  location: "",
  courseStartDate: "",
  courseEndDate: "",
  totalDaysIncludingTravel: "",
  numberOfDaysOnDuty: "",
  onDutyDates: [],
  courseDescription: "",
  requestDepartmentVehicle: false,
  registrationFee: "",
  totalReimbursableMiles: "",
  lodging: "",
  airfare: "",
  rentalVehicle: "",
  foodExpenses: "",
  otherExpenses: "",
  transportationNotes: "",
  confirmedAccurate: false,
};

function createInitialDraft(personnel: AuthenticatedPersonnel): TrainingRequestDraft {
  return {
    ...initialDraft,
    badgeNumber: personnel.badgeNumber,
    departmentEmail: personnel.email,
  };
}

interface TrainingRequestWizardProps {
  personnel: AuthenticatedPersonnel;
  draftId?: string | null;
}

type DraftErrors = Partial<
  Record<keyof TrainingRequestDraft | "gsaMileageRate" | "submit", string>
>;

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
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

export function TrainingRequestWizard({
  personnel,
  draftId = null,
}: TrainingRequestWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<TrainingRequestDraft>(() =>
    createInitialDraft(personnel),
  );
  const [draftRequestId, setDraftRequestId] = useState<string | null>(draftId);
  const [editableStatus, setEditableStatus] = useState<
    "draft" | "returned_for_correction" | null
  >(draftId ? null : "draft");
  const [savedRequestNumber, setSavedRequestNumber] = useState<string | null>(
    null,
  );
  const [preservedMileage, setPreservedMileage] = useState("");
  const [errors, setErrors] = useState<DraftErrors>({});
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isLoadingDraft, setIsLoadingDraft] = useState(Boolean(draftId));
  const [latestCorrectionAction, setLatestCorrectionAction] =
    useState<TrainingRequestActionRecord | null>(null);
  const [draftLoadError, setDraftLoadError] = useState<string | null>(null);

  const gsaMileageRate = useMemo(() => getGsaMileageRate(), []);
  const rateAvailable = gsaMileageRate !== null;
  const activeRate = gsaMileageRate ?? 0;

  const registrationFee = parseCurrencyInput(draft.registrationFee);
  const rawMiles = parseMilesInput(draft.totalReimbursableMiles);
  const lodging = parseCurrencyInput(draft.lodging);
  const airfare = parseCurrencyInput(draft.airfare);
  const rentalVehicle = parseCurrencyInput(draft.rentalVehicle);
  const foodExpenses = parseCurrencyInput(draft.foodExpenses);
  const otherExpenses = parseCurrencyInput(draft.otherExpenses);

  const expenseSummary = calculateExpenseSummary({
    requestDepartmentVehicle: draft.requestDepartmentVehicle,
    totalReimbursableMiles: rawMiles,
    gsaMileageRate: activeRate,
    registrationFee,
    lodging,
    airfare,
    rentalVehicle,
    foodExpenses,
    otherExpenses,
  });

  const requestNumberPreview = savedRequestNumber ?? "Draft";

  useEffect(() => {
    if (!draftId) {
      return;
    }

    const activeDraftId = draftId;
    let cancelled = false;

    async function loadDraft() {
      setIsLoadingDraft(true);
      setErrors({});
      setDraftLoadError(null);

      try {
        const request = await getTrainingRequestById(activeDraftId);
        if (!request) {
          throw new Error(DRAFT_NO_LONGER_EXISTS_MESSAGE);
        }

        if (
          (request.status !== "draft" &&
            request.status !== "returned_for_correction") ||
          request.requesterPersonnelId !== personnel.id
        ) {
          throw new Error("Draft request not found or no longer editable.");
        }

        if (!cancelled) {
          setDraftRequestId(request.id);
          setEditableStatus(request.status);
          setSavedRequestNumber(request.requestNumber);
          setDraft(trainingRequestRecordToDraft(request));
          setStatusMessage(
            request.status === "returned_for_correction"
              ? null
              : "Loaded draft.",
          );

          if (request.status === "returned_for_correction") {
            const actions = await listTrainingRequestActions(request.id);
            if (!cancelled) {
              setLatestCorrectionAction(getLatestCorrectionAction(actions));
            }
          } else if (!cancelled) {
            setLatestCorrectionAction(null);
          }
        }
      } catch (error) {
        if (!cancelled) {
          const message =
            error instanceof Error
              ? error.message
              : "Unable to load the selected draft.";
          setDraftLoadError(message);
          setErrors({
            submit: message,
          });
        }
      } finally {
        if (!cancelled) {
          setIsLoadingDraft(false);
        }
      }
    }

    void loadDraft();

    return () => {
      cancelled = true;
    };
  }, [draftId, personnel.id]);

  function updateField<K extends keyof TrainingRequestDraft>(
    key: K,
    value: TrainingRequestDraft[K],
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function handleDepartmentVehicleChange(checked: boolean) {
    if (checked) {
      setPreservedMileage(draft.totalReimbursableMiles);
      updateField("requestDepartmentVehicle", true);
      return;
    }

    updateField("requestDepartmentVehicle", false);
    updateField("totalReimbursableMiles", preservedMileage);
  }

  function validateStep(currentStep: number): DraftErrors {
    const nextErrors: DraftErrors = {};

    if (currentStep === 1) {
      if (!hasCompletePersonnelName(personnel)) {
        nextErrors.submit = PERSONNEL_NAME_REQUIRED_MESSAGE;
      }

      if (!draft.badgeNumber.trim()) {
        nextErrors.badgeNumber = "Badge number is required.";
      } else if (draft.badgeNumber.trim() !== personnel.badgeNumber) {
        nextErrors.badgeNumber =
          "Badge number must match your signed-in personnel record.";
      }
      if (!draft.departmentEmail.trim()) {
        nextErrors.departmentEmail = "Department email is required.";
      } else if (
        normalizePersonnelEmail(draft.departmentEmail) !== personnel.email
      ) {
        nextErrors.departmentEmail =
          "Department email must match your signed-in personnel record.";
      } else if (!isValidEmail(draft.departmentEmail.trim())) {
        nextErrors.departmentEmail = "Enter a valid email address.";
      }
    }

    if (currentStep === 2) {
      if (!draft.courseName.trim()) {
        nextErrors.courseName = "Course name is required.";
      }
      if (!draft.courseNumber.trim()) {
        nextErrors.courseNumber = "Course number is required.";
      }
      if (!draft.location.trim()) {
        nextErrors.location = "Location is required.";
      }
      if (!draft.courseStartDate) {
        nextErrors.courseStartDate = "Course start date is required.";
      }
      if (!draft.courseEndDate) {
        nextErrors.courseEndDate = "Course end date is required.";
      } else if (
        draft.courseStartDate &&
        draft.courseEndDate < draft.courseStartDate
      ) {
        nextErrors.courseEndDate =
          "Course end date cannot be before the course start date.";
      }

      const dayErrors = validateTrainingDayDetails({
        totalDaysIncludingTravel: draft.totalDaysIncludingTravel,
        numberOfDaysOnDuty: draft.numberOfDaysOnDuty,
        onDutyDates: draft.onDutyDates,
        courseStartDate: draft.courseStartDate,
        courseEndDate: draft.courseEndDate,
        requireComplete: true,
      });

      Object.assign(nextErrors, dayErrors);
    }

    if (currentStep === 3) {
      if (!rateAvailable) {
        nextErrors.gsaMileageRate =
          "GSA mileage rate is not configured. Contact the Training Bureau.";
      }

      const currencyFields = [
        "registrationFee",
        "lodging",
        "airfare",
        "rentalVehicle",
        "foodExpenses",
        "otherExpenses",
      ] as const;

      for (const field of currencyFields) {
        if (!isValidCurrencyInput(draft[field])) {
          nextErrors[field] = "Enter a valid dollar amount of zero or greater.";
        }
      }

      if (
        !draft.requestDepartmentVehicle &&
        !isValidMilesInput(draft.totalReimbursableMiles)
      ) {
        nextErrors.totalReimbursableMiles =
          "Enter total reimbursable miles of zero or greater.";
      }
    }

    if (currentStep === 4 && !draft.confirmedAccurate) {
      nextErrors.confirmedAccurate =
        "Confirm that the information is accurate before submitting.";
    }

    return nextErrors;
  }

  function validateDraftSave(): DraftErrors {
    const nextErrors: DraftErrors = {};

    if (!hasCompletePersonnelName(personnel)) {
      nextErrors.submit = PERSONNEL_NAME_REQUIRED_MESSAGE;
    }

    if (!draft.badgeNumber.trim()) {
      nextErrors.badgeNumber = "Badge number is required.";
    } else if (draft.badgeNumber.trim() !== personnel.badgeNumber) {
      nextErrors.badgeNumber =
        "Badge number must match your signed-in personnel record.";
    }

    if (!draft.departmentEmail.trim()) {
      nextErrors.departmentEmail = "Department email is required.";
    } else if (
      normalizePersonnelEmail(draft.departmentEmail) !== personnel.email
    ) {
      nextErrors.departmentEmail =
        "Department email must match your signed-in personnel record.";
    } else if (!isValidEmail(draft.departmentEmail.trim())) {
      nextErrors.departmentEmail = "Enter a valid email address.";
    }

    return nextErrors;
  }

  async function persistDraft() {
    const input = buildTrainingRequestInput({
      personnel,
      draft,
      expenseSummary,
      requireComplete: false,
    });

    if (draftRequestId) {
      const updated =
        editableStatus === "returned_for_correction"
          ? await updateReturnedTrainingRequest(draftRequestId, input)
          : await updateTrainingRequestDraft(draftRequestId, input);
      setDraftRequestId(updated.id);
      setSavedRequestNumber(updated.requestNumber);
      setEditableStatus(updated.status === "returned_for_correction"
        ? "returned_for_correction"
        : "draft");
      return updated;
    }

    const created = await createTrainingRequestDraft(input);
    setDraftRequestId(created.id);
    setSavedRequestNumber(created.requestNumber);
    return created;
  }

  async function handleSaveDraft() {
    const nextErrors = validateDraftSave();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setIsSavingDraft(true);
    setStatusMessage(null);

    try {
      await persistDraft();
      setStatusMessage("Draft saved.");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to save draft. Try again later.";

      if (message === DRAFT_NO_LONGER_EXISTS_MESSAGE) {
        setDraftLoadError(message);
        router.push("/requests");
        return;
      }

      setErrors({
        submit: message,
      });
    } finally {
      setIsSavingDraft(false);
    }
  }

  function handleNext() {
    const nextErrors = validateStep(step);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setStep((current) => Math.min(current + 1, TOTAL_STEPS));
  }

  function handleBack() {
    setErrors({});
    setStep((current) => Math.max(current - 1, 1));
  }

  function handleCurrencyBlur(
    key:
      | "registrationFee"
      | "lodging"
      | "airfare"
      | "rentalVehicle"
      | "foodExpenses"
      | "otherExpenses",
  ) {
    updateField(key, formatCurrencyInput(draft[key]));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextErrors = {
      ...validateStep(2),
      ...validateStep(4),
    };
    if (!rateAvailable) {
      nextErrors.gsaMileageRate =
        "GSA mileage rate is not configured. Contact the Training Bureau.";
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setIsSubmitting(true);
    setStatusMessage(null);

    try {
      const input = buildTrainingRequestInput({
        personnel,
        draft,
        expenseSummary,
        requireComplete: true,
      });

      const submitted = draftRequestId
        ? editableStatus === "returned_for_correction"
          ? await resubmitTrainingRequest(draftRequestId, input)
          : await submitTrainingRequest(draftRequestId, input)
        : await createAndSubmitTrainingRequest(input);

      router.push(
        `/requests/${encodeURIComponent(submitted.id)}/confirmation`,
      );
    } catch (error) {
      setErrors({
        submit:
          error instanceof Error
            ? error.message
            : "Unable to submit request. Try again later.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoadingDraft) {
    return (
      <div className="mx-auto w-full max-w-3xl rounded-2xl bg-white p-8 text-sm text-zinc-500 shadow-sm shadow-zinc-200/60">
        Loading draft...
      </div>
    );
  }

  if (draftLoadError === DRAFT_NO_LONGER_EXISTS_MESSAGE) {
    return (
      <div className="mx-auto w-full max-w-3xl rounded-2xl bg-white p-8 shadow-sm shadow-zinc-200/60">
        <p className="text-sm text-red-700" role="alert">
          {DRAFT_NO_LONGER_EXISTS_MESSAGE}
        </p>
        <Button
          type="button"
          className="mt-4"
          onClick={() => router.push("/requests")}
        >
          Go to My Requests
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <WizardProgress currentStep={step} />

      <form
        onSubmit={handleSubmit}
        className="rounded-2xl bg-white p-6 shadow-sm shadow-zinc-200/60 sm:p-8"
        noValidate
      >
        {shouldShowWizardCorrectionAlert(editableStatus) ? (
          <CorrectionRequiredAlert
            action={latestCorrectionAction}
            variant="wizard"
            className="mb-6"
          />
        ) : null}

        {step === 1 ? (
          <section className="space-y-5" aria-labelledby="step-1-heading">
            <div>
              <h2
                id="step-1-heading"
                className="text-lg font-semibold text-zinc-900"
              >
                Requester Information
              </h2>
              <p className="mt-1 text-sm text-zinc-600">
                Your signed-in personnel record is used for request ownership.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                id="requesterNameDisplay"
                label="Requester Name"
                className="sm:col-span-2"
              >
                <Input
                  id="requesterNameDisplay"
                  value={
                    formatPersonnelFullName(personnel) ??
                    "Name not entered — contact an administrator"
                  }
                  readOnly
                  disabled
                />
              </Field>
              {!hasCompletePersonnelName(personnel) ? (
                <p
                  className="sm:col-span-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
                  role="alert"
                >
                  {PERSONNEL_NAME_REQUIRED_MESSAGE}
                </p>
              ) : null}
              <Field
                id="badgeNumber"
                label="Badge Number"
                error={errors.badgeNumber}
              >
                <Input
                  id="badgeNumber"
                  value={draft.badgeNumber}
                  readOnly
                  disabled
                  aria-invalid={errors.badgeNumber ? true : undefined}
                  aria-describedby={
                    errors.badgeNumber ? "badgeNumber-error" : undefined
                  }
                />
              </Field>
              <Field
                id="departmentEmail"
                label="Department Email"
                error={errors.departmentEmail}
              >
                <Input
                  id="departmentEmail"
                  type="email"
                  value={draft.departmentEmail}
                  readOnly
                  disabled
                  aria-invalid={errors.departmentEmail ? true : undefined}
                  aria-describedby={
                    errors.departmentEmail
                      ? "departmentEmail-error"
                      : undefined
                  }
                />
              </Field>
            </div>
            {errors.submit ? (
              <p role="alert" className="text-sm text-red-700">
                {errors.submit}
              </p>
            ) : null}
          </section>
        ) : null}

        {step === 2 ? (
          <section className="space-y-5" aria-labelledby="step-2-heading">
            <div>
              <h2
                id="step-2-heading"
                className="text-lg font-semibold text-zinc-900"
              >
                Course and Duty Information
              </h2>
              <p className="mt-1 text-sm text-zinc-600">
                Provide details about the training course and duty time.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                id="courseName"
                label="Course Name"
                error={errors.courseName}
                className="sm:col-span-2"
              >
                <Input
                  id="courseName"
                  value={draft.courseName}
                  onChange={(event) =>
                    updateField("courseName", event.target.value)
                  }
                  aria-invalid={errors.courseName ? true : undefined}
                  aria-describedby={
                    errors.courseName ? "courseName-error" : undefined
                  }
                />
              </Field>
              <Field
                id="courseNumber"
                label="Course Number"
                error={errors.courseNumber}
              >
                <Input
                  id="courseNumber"
                  value={draft.courseNumber}
                  onChange={(event) =>
                    updateField("courseNumber", event.target.value)
                  }
                  aria-invalid={errors.courseNumber ? true : undefined}
                  aria-describedby={
                    errors.courseNumber ? "courseNumber-error" : undefined
                  }
                />
              </Field>
              <Field
                id="trainingProvider"
                label="Training Provider"
                optional
              >
                <Input
                  id="trainingProvider"
                  value={draft.trainingProvider}
                  onChange={(event) =>
                    updateField("trainingProvider", event.target.value)
                  }
                />
              </Field>
              <Field
                id="location"
                label="Location"
                error={errors.location}
                className="sm:col-span-2"
              >
                <Input
                  id="location"
                  value={draft.location}
                  onChange={(event) =>
                    updateField("location", event.target.value)
                  }
                  aria-invalid={errors.location ? true : undefined}
                  aria-describedby={
                    errors.location ? "location-error" : undefined
                  }
                />
              </Field>
              <Field
                id="courseStartDate"
                label="Course Start Date"
                error={errors.courseStartDate}
              >
                <Input
                  id="courseStartDate"
                  type="date"
                  value={draft.courseStartDate}
                  onChange={(event) =>
                    updateField("courseStartDate", event.target.value)
                  }
                  aria-invalid={errors.courseStartDate ? true : undefined}
                  aria-describedby={
                    errors.courseStartDate
                      ? "courseStartDate-error"
                      : undefined
                  }
                />
              </Field>
              <Field
                id="courseEndDate"
                label="Course End Date"
                error={errors.courseEndDate}
              >
                <Input
                  id="courseEndDate"
                  type="date"
                  value={draft.courseEndDate}
                  onChange={(event) =>
                    updateField("courseEndDate", event.target.value)
                  }
                  aria-invalid={errors.courseEndDate ? true : undefined}
                  aria-describedby={
                    errors.courseEndDate ? "courseEndDate-error" : undefined
                  }
                />
              </Field>
              <TrainingDayDetailsFields
                draft={draft}
                errors={errors}
                onDraftChange={setDraft}
              />
              <Field
                id="courseDescription"
                label="Course Description or Purpose"
                optional
                className="sm:col-span-2"
              >
                <Textarea
                  id="courseDescription"
                  value={draft.courseDescription}
                  onChange={(event) =>
                    updateField("courseDescription", event.target.value)
                  }
                />
              </Field>
            </div>
          </section>
        ) : null}

        {step === 3 ? (
          <section className="space-y-6" aria-labelledby="step-3-heading">
            <div>
              <h2
                id="step-3-heading"
                className="text-lg font-semibold text-zinc-900"
              >
                Expenses and Travel
              </h2>
              <p className="mt-1 text-sm text-zinc-600">
                Enter estimated costs. Leave blank if an expense does not apply.
              </p>
            </div>

            {!rateAvailable ? (
              <div
                className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
                role="alert"
              >
                GSA mileage rate is missing or invalid. Set{" "}
                <code className="font-mono text-xs">
                  NEXT_PUBLIC_GSA_MILEAGE_RATE
                </code>{" "}
                to a value greater than zero before submitting.
              </div>
            ) : null}

            <FormSection title="Transportation">
              <label className="flex items-start gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-4 text-sm text-zinc-800">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 rounded border-zinc-300 text-red-700 focus:ring-red-700"
                  checked={draft.requestDepartmentVehicle}
                  onChange={(event) =>
                    handleDepartmentVehicleChange(event.target.checked)
                  }
                />
                <span>
                  <span className="font-medium">Request Department Vehicle</span>
                  <span className="mt-1 block text-zinc-600">
                    Check this box when a department vehicle will be used and
                    personal mileage reimbursement does not apply.
                  </span>
                </span>
              </label>

              {draft.requestDepartmentVehicle ? (
                <p
                  className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900"
                  role="status"
                >
                  Personal mileage reimbursement does not apply when a
                  department vehicle is requested.
                </p>
              ) : null}

              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  id="totalReimbursableMiles"
                  label="Total Reimbursable Miles"
                  error={errors.totalReimbursableMiles}
                  optional
                >
                  <Input
                    id="totalReimbursableMiles"
                    inputMode="decimal"
                    value={
                      draft.requestDepartmentVehicle
                        ? "0"
                        : draft.totalReimbursableMiles
                    }
                    onChange={(event) =>
                      updateField("totalReimbursableMiles", event.target.value)
                    }
                    placeholder="0"
                    disabled={draft.requestDepartmentVehicle}
                    aria-invalid={
                      errors.totalReimbursableMiles ? true : undefined
                    }
                    aria-describedby={
                      errors.totalReimbursableMiles
                        ? "totalReimbursableMiles-error"
                        : undefined
                    }
                  />
                </Field>
                <Field id="gsaMileageRateDisplay" label="GSA Mileage Rate">
                  <Input
                    id="gsaMileageRateDisplay"
                    value={
                      rateAvailable
                        ? `${formatMileageRate(activeRate)} / mile`
                        : "Not configured"
                    }
                    disabled
                    readOnly
                  />
                </Field>
                <Field id="mileageReimbursementDisplay" label="Mileage Reimbursement">
                  <Input
                    id="mileageReimbursementDisplay"
                    value={formatCurrency(expenseSummary.mileageReimbursement)}
                    disabled
                    readOnly
                  />
                </Field>
                <Field
                  id="transportationNotes"
                  label="Transportation Notes"
                  optional
                  className="sm:col-span-2"
                >
                  <Textarea
                    id="transportationNotes"
                    value={draft.transportationNotes}
                    onChange={(event) =>
                      updateField("transportationNotes", event.target.value)
                    }
                  />
                </Field>
              </div>
            </FormSection>

            <FormSection title="Course and Travel Expenses">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  id="registrationFee"
                  label="Registration Fee"
                  error={errors.registrationFee}
                  optional
                >
                  <CurrencyInput
                    id="registrationFee"
                    value={draft.registrationFee}
                    error={errors.registrationFee}
                    onChange={(value) => updateField("registrationFee", value)}
                    onBlur={() => handleCurrencyBlur("registrationFee")}
                  />
                </Field>
                <Field
                  id="lodging"
                  label="Lodging"
                  error={errors.lodging}
                  optional
                >
                  <CurrencyInput
                    id="lodging"
                    value={draft.lodging}
                    error={errors.lodging}
                    onChange={(value) => updateField("lodging", value)}
                    onBlur={() => handleCurrencyBlur("lodging")}
                  />
                </Field>
                <Field
                  id="airfare"
                  label="Airfare"
                  error={errors.airfare}
                  optional
                >
                  <CurrencyInput
                    id="airfare"
                    value={draft.airfare}
                    error={errors.airfare}
                    onChange={(value) => updateField("airfare", value)}
                    onBlur={() => handleCurrencyBlur("airfare")}
                  />
                </Field>
                <Field
                  id="rentalVehicle"
                  label="Rental Vehicle"
                  error={errors.rentalVehicle}
                  optional
                >
                  <CurrencyInput
                    id="rentalVehicle"
                    value={draft.rentalVehicle}
                    error={errors.rentalVehicle}
                    onChange={(value) => updateField("rentalVehicle", value)}
                    onBlur={() => handleCurrencyBlur("rentalVehicle")}
                  />
                </Field>
              </div>
            </FormSection>

            <FormSection title="Food Expenses">
              <Field
                id="foodExpenses"
                label="Food / Meals"
                error={errors.foodExpenses}
                optional
              >
                <CurrencyInput
                  id="foodExpenses"
                  value={draft.foodExpenses}
                  error={errors.foodExpenses}
                  onChange={(value) => updateField("foodExpenses", value)}
                  onBlur={() => handleCurrencyBlur("foodExpenses")}
                />
              </Field>
            </FormSection>

            <FormSection title="Other">
              <Field
                id="otherExpenses"
                label="Other Expenses"
                error={errors.otherExpenses}
                optional
              >
                <CurrencyInput
                  id="otherExpenses"
                  value={draft.otherExpenses}
                  error={errors.otherExpenses}
                  onChange={(value) => updateField("otherExpenses", value)}
                  onBlur={() => handleCurrencyBlur("otherExpenses")}
                />
              </Field>
            </FormSection>

            {errors.gsaMileageRate ? (
              <p role="alert" className="text-sm text-red-700">
                {errors.gsaMileageRate}
              </p>
            ) : null}

            <ExpenseSummary
              values={expenseSummary}
              rateAvailable={rateAvailable}
            />
          </section>
        ) : null}

        {step === 4 ? (
          <section className="space-y-6" aria-labelledby="step-4-heading">
            <div>
              <h2
                id="step-4-heading"
                className="text-lg font-semibold text-zinc-900"
              >
                Review and Submit
              </h2>
              <p className="mt-1 text-sm text-zinc-600">
                Confirm the details below, then submit your training request.
              </p>
            </div>

            <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-4">
              <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase">
                Request identifier
              </p>
              <p className="mt-1 text-sm font-semibold text-zinc-900">
                {requestNumberPreview}
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                Drafts display as Draft until submission. New requests receive a
                human-readable identifier such as {TRAINING_REQUEST_NUMBER_PREVIEW}
                when submitted.
              </p>
            </div>

            {statusMessage ? (
              <p className="text-sm text-green-800" role="status">
                {statusMessage}
              </p>
            ) : null}

            {errors.submit ? (
              <p role="alert" className="text-sm text-red-700">
                {errors.submit}
              </p>
            ) : null}

            <ReviewSection title="Requester">
              <ReviewItem
                label="Requester Name"
                value={
                  formatPersonnelFullName(personnel) ?? "Name not entered"
                }
              />
              <ReviewItem label="Badge Number" value={draft.badgeNumber} />
              <ReviewItem
                label="Department Email"
                value={draft.departmentEmail}
              />
            </ReviewSection>

            <ReviewSection title="Course">
              <ReviewItem label="Course Name" value={draft.courseName} />
              <ReviewItem label="Course Number" value={draft.courseNumber} />
              <ReviewItem
                label="Training Provider"
                value={draft.trainingProvider || "—"}
              />
              <ReviewItem label="Location" value={draft.location} />
              <ReviewItem
                label="Course Start Date"
                value={formatDisplayDate(draft.courseStartDate)}
              />
              <ReviewItem
                label="Course End Date"
                value={formatDisplayDate(draft.courseEndDate)}
              />
              <ReviewItem
                label="Total Days Including Travel"
                value={draft.totalDaysIncludingTravel || "—"}
              />
              <ReviewItem
                label="Days On Duty"
                value={draft.numberOfDaysOnDuty || "0"}
              />
              <ReviewItem
                label="On-Duty Dates"
                value={
                  draft.onDutyDates.filter((value) => value.trim()).length > 0
                    ? draft.onDutyDates
                        .filter((value) => value.trim())
                        .map((value) => formatDisplayDate(value))
                        .join(", ")
                    : "—"
                }
                wide
              />
              <ReviewItem
                label="Course Description or Purpose"
                value={draft.courseDescription || "—"}
                wide
              />
            </ReviewSection>

            <ReviewSection title="Travel and Expenses">
              <ReviewItem
                label="Department Vehicle Requested"
                value={formatDepartmentVehicle(draft.requestDepartmentVehicle)}
              />
              <ReviewItem
                label="Total Reimbursable Miles"
                value={expenseSummary.totalReimbursableMiles.toLocaleString(
                  "en-US",
                  { maximumFractionDigits: 2 },
                )}
              />
              <ReviewItem
                label="GSA Mileage Rate Used"
                value={
                  rateAvailable
                    ? `${formatMileageRate(activeRate)} / mile`
                    : "Not configured"
                }
              />
              <ReviewItem
                label="Mileage Reimbursement"
                value={formatCurrency(expenseSummary.mileageReimbursement)}
              />
              <ReviewItem
                label="Registration Fee"
                value={formatCurrency(registrationFee)}
              />
              <ReviewItem label="Lodging" value={formatCurrency(lodging)} />
              <ReviewItem label="Airfare" value={formatCurrency(airfare)} />
              <ReviewItem
                label="Rental Vehicle"
                value={formatCurrency(rentalVehicle)}
              />
              <ReviewItem
                label="Food / Meals"
                value={formatCurrency(foodExpenses)}
              />
              <ReviewItem
                label="Other Expenses"
                value={formatCurrency(otherExpenses)}
              />
              <ReviewItem
                label="Transportation Notes"
                value={draft.transportationNotes || "—"}
                wide
              />
              <ReviewItem
                label="Total Estimated Expenses"
                value={formatCurrency(expenseSummary.totalEstimatedExpenses)}
              />
            </ReviewSection>

            <ExpenseSummary
              values={expenseSummary}
              rateAvailable={rateAvailable}
            />

            <div className="space-y-2 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-4">
              <label className="flex items-start gap-3 text-sm text-zinc-800">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 rounded border-zinc-300 text-red-700 focus:ring-red-700"
                  checked={draft.confirmedAccurate}
                  onChange={(event) =>
                    updateField("confirmedAccurate", event.target.checked)
                  }
                  aria-invalid={errors.confirmedAccurate ? true : undefined}
                  aria-describedby={
                    errors.confirmedAccurate
                      ? "confirmedAccurate-error"
                      : undefined
                  }
                />
                <span>
                  I confirm that the information in this training request is
                  accurate to the best of my knowledge.
                </span>
              </label>
              {errors.confirmedAccurate ? (
                <p
                  id="confirmedAccurate-error"
                  role="alert"
                  className="text-sm text-red-700"
                >
                  {errors.confirmedAccurate}
                </p>
              ) : null}
            </div>
          </section>
        ) : null}

        <div className="mt-8 flex flex-col gap-3">
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
            <Button
              type="button"
              variant="secondary"
              onClick={handleBack}
              disabled={step === 1 || isSubmitting || isSavingDraft}
              className="w-full sm:w-auto sm:min-w-28"
            >
              Back
            </Button>

            {step < TOTAL_STEPS ? (
              <Button
                type="button"
                onClick={handleNext}
                disabled={isSubmitting || isSavingDraft}
                className="w-full sm:w-auto sm:min-w-36"
              >
                Continue
              </Button>
            ) : (
              <Button
                type="submit"
                disabled={isSubmitting || isSavingDraft}
                className="w-full sm:w-auto sm:min-w-36"
              >
                {isSubmitting
                  ? editableStatus === "returned_for_correction"
                    ? "Resubmitting…"
                    : "Submitting…"
                  : editableStatus === "returned_for_correction"
                    ? "Resubmit Request"
                    : "Submit Request"}
              </Button>
            )}
          </div>

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="secondary"
              disabled={isSubmitting || isSavingDraft}
              className="w-full sm:w-auto sm:min-w-36"
              onClick={() => {
                void handleSaveDraft();
              }}
            >
              {isSavingDraft ? "Saving Draft…" : "Save Draft"}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}

function FormSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4">
      <h3 className="text-sm font-semibold tracking-wide text-zinc-500 uppercase">
        {title}
      </h3>
      {children}
    </section>
  );
}

function CurrencyInput({
  id,
  value,
  error,
  onChange,
  onBlur,
}: {
  id: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
  onBlur: () => void;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-sm text-zinc-400">
        $
      </span>
      <Input
        id={id}
        inputMode="decimal"
        className="pl-7"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        placeholder="0.00"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
      />
    </div>
  );
}

function ReviewSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-zinc-200 p-4 sm:p-5">
      <h3 className="mb-4 text-sm font-semibold tracking-wide text-zinc-500 uppercase">
        {title}
      </h3>
      <dl className="grid gap-3 sm:grid-cols-2">{children}</dl>
    </section>
  );
}

function ReviewItem({
  label,
  value,
  wide = false,
}: {
  label: string;
  value: string;
  wide?: boolean;
}) {
  return (
    <div className={cn(wide && "sm:col-span-2")}>
      <dt className="text-xs font-medium tracking-wide text-zinc-500 uppercase">
        {label}
      </dt>
      <dd className="mt-1 text-sm whitespace-pre-wrap text-zinc-900">
        {value || "—"}
      </dd>
    </div>
  );
}
