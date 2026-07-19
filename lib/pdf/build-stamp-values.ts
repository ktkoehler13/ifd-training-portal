import {
  TRAINING_REQUEST_FORM_SIGNATURE_PLACEMENTS,
  TRAINING_REQUEST_FORM_TEXT_PLACEMENTS,
  TAL_ORIGINAL_INITIAL_PLACEMENTS,
} from "@/lib/pdf/field-mapping";
import { deriveApprovalInitials } from "@/lib/pdf/derive-approval-initials";
import {
  formatOptionalPdfCurrency,
  formatOptionalPdfNumber,
  formatPdfDate,
  formatTrainingDatesIncludingTravel,
  formatTransportationSelection,
} from "@/lib/pdf/format-pdf-values";
import { partitionOnDutyDatesForPdf } from "@/lib/training-day-details";
import { warnApprovedPacketFieldUnavailable } from "@/lib/pdf/warn-approved-packet-fields";
import type { TrainingRequestActionRecord } from "@/types/training-request-action";
import type { TrainingRequestRecord } from "@/types/training-request";

export interface ApprovedPacketStampInput {
  request: TrainingRequestRecord;
  mtoAction: TrainingRequestActionRecord;
  deputyAction: TrainingRequestActionRecord;
}

function optionalText(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

export function resolveMtoApprovalInitials(
  mtoAction: TrainingRequestActionRecord,
): string {
  return (
    deriveApprovalInitials(mtoAction.signatureName) ||
    deriveApprovalInitials(mtoAction.actorName)
  );
}

export function buildTrainingRequestFormStampValues(
  input: ApprovedPacketStampInput,
): Record<keyof typeof TRAINING_REQUEST_FORM_TEXT_PLACEMENTS, string> {
  const { request } = input;
  const trainingDates = formatTrainingDatesIncludingTravel(
    request.courseStartDate,
    request.courseEndDate,
  );
  const onDutyDates = partitionOnDutyDatesForPdf(request.onDutyDates);

  return {
    requesterName: optionalText(request.requesterName),
    badge: optionalText(request.requesterBadgeNumber),
    applicationDate: formatPdfDate(request.submittedAt ?? request.createdAt),
    trainingName: optionalText(request.courseName),
    trainingLocation: optionalText(request.location),
    trainingDatesIncludingTravel: trainingDates,
    totalDaysIncludingTravel: formatOptionalPdfNumber(
      request.totalDaysIncludingTravel,
    ),
    transportation: formatTransportationSelection({
      requestDepartmentVehicle: request.requestDepartmentVehicle,
      transportationNotes: request.transportationNotes,
    }),
    registrationFees: formatOptionalPdfCurrency(request.registrationFee),
    mileage: formatOptionalPdfNumber(request.totalReimbursableMiles),
    mileageRate: formatOptionalPdfCurrency(request.gsaMileageRate),
    mileageTotal: formatOptionalPdfCurrency(request.mileageReimbursement),
    mealFoodTotal: formatOptionalPdfCurrency(request.foodExpenses),
    lodgingTotal: formatOptionalPdfCurrency(request.lodging),
    otherTotal: formatOptionalPdfCurrency(request.otherExpenses),
    airfareTotal: formatOptionalPdfCurrency(request.airfare),
    rentalVehicleTotal: formatOptionalPdfCurrency(request.rentalVehicle),
    totalEstimatedExpenses: formatOptionalPdfCurrency(request.totalEstimatedExpenses),
    onDutyDatePrimary: onDutyDates.primary,
    onDutyDateSecondary: onDutyDates.secondary,
  };
}

export function getOnDutyDatesPdfOverflow(
  request: TrainingRequestRecord,
): string[] {
  return partitionOnDutyDatesForPdf(request.onDutyDates).overflow;
}

export function buildTrainingRequestApprovalStampValues(
  input: ApprovedPacketStampInput,
): {
  mtoApprovalDate: string;
  deputyApprovalDate: string;
} {
  const { mtoAction, deputyAction } = input;

  return {
    mtoApprovalDate: formatPdfDate(mtoAction.signedAt ?? mtoAction.createdAt),
    deputyApprovalDate: formatPdfDate(deputyAction.signedAt ?? deputyAction.createdAt),
  };
}

export function buildTalOriginalInitialStampValues(
  input: ApprovedPacketStampInput,
): Record<keyof typeof TAL_ORIGINAL_INITIAL_PLACEMENTS, string> {
  const initials = resolveMtoApprovalInitials(input.mtoAction);

  return {
    studentAuthorization: initials,
    scbaClearance: initials,
  };
}

function warnIfBlank(
  requestId: string,
  field: string,
  value: string,
): void {
  if (!value.trim()) {
    warnApprovedPacketFieldUnavailable(requestId, field);
  }
}

export function warnForMissingApprovedPacketContent(
  input: ApprovedPacketStampInput,
  plan: ReturnType<typeof getApprovedPacketStampPlan>,
): void {
  const { request } = input;
  const requestId = request.id;

  warnIfBlank(requestId, "requesterName", plan.trainingRequestText.requesterName);
  warnIfBlank(requestId, "requesterBadgeNumber", plan.trainingRequestText.badge);
  warnIfBlank(requestId, "courseName", plan.trainingRequestText.trainingName);
  warnIfBlank(requestId, "location", plan.trainingRequestText.trainingLocation);
  warnIfBlank(
    requestId,
    "trainingDatesIncludingTravel",
    plan.trainingRequestText.trainingDatesIncludingTravel,
  );
  warnIfBlank(requestId, "mtoApprovalDate", plan.trainingRequestApprovalDates.mtoApprovalDate);
  warnIfBlank(
    requestId,
    "deputyApprovalDate",
    plan.trainingRequestApprovalDates.deputyApprovalDate,
  );
  warnIfBlank(
    requestId,
    "mtoOriginalInitials",
    plan.talOriginalInitials.studentAuthorization,
  );
}

export function getApprovedPacketStampPlan(input: ApprovedPacketStampInput): {
  trainingRequestText: ReturnType<typeof buildTrainingRequestFormStampValues>;
  trainingRequestApprovalDates: ReturnType<typeof buildTrainingRequestApprovalStampValues>;
  talOriginalInitials: ReturnType<typeof buildTalOriginalInitialStampValues>;
  signaturePlacements: typeof TRAINING_REQUEST_FORM_SIGNATURE_PLACEMENTS;
  talOriginalInitialPlacements: typeof TAL_ORIGINAL_INITIAL_PLACEMENTS;
} {
  const plan = {
    trainingRequestText: buildTrainingRequestFormStampValues(input),
    trainingRequestApprovalDates: buildTrainingRequestApprovalStampValues(input),
    talOriginalInitials: buildTalOriginalInitialStampValues(input),
    signaturePlacements: TRAINING_REQUEST_FORM_SIGNATURE_PLACEMENTS,
    talOriginalInitialPlacements: TAL_ORIGINAL_INITIAL_PLACEMENTS,
  };

  warnForMissingApprovedPacketContent(input, plan);

  return plan;
}

export function rectanglesOverlap(
  left: { x: number; y: number; width: number; height: number },
  right: { x: number; y: number; width: number; height: number },
): boolean {
  return !(
    left.x + left.width <= right.x ||
    right.x + right.width <= left.x ||
    left.y + left.height <= right.y ||
    right.y + right.height <= left.y
  );
}

export function inspectApprovedPacketGeometry(
  plan: ReturnType<typeof getApprovedPacketStampPlan>,
): {
  mtoSignatureAboveDeputySignature: boolean;
  mtoSignatureDoesNotOverlapMtoDate: boolean;
  deputySignatureDoesNotOverlapDeputyDate: boolean;
} {
  const { mtoSignature, deputySignature, mtoApprovalDate, deputyApprovalDate } =
    plan.signaturePlacements;

  return {
    mtoSignatureAboveDeputySignature: mtoSignature.y > deputySignature.y,
    mtoSignatureDoesNotOverlapMtoDate: !rectanglesOverlap(mtoSignature, mtoApprovalDate),
    deputySignatureDoesNotOverlapDeputyDate: !rectanglesOverlap(
      deputySignature,
      deputyApprovalDate,
    ),
  };
}
