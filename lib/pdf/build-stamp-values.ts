import {
  TRAINING_REQUEST_FORM_SIGNATURE_PLACEMENTS,
  TRAINING_REQUEST_FORM_TEXT_PLACEMENTS,
  TAL_ORIGINAL_INITIAL_PLACEMENTS,
} from "@/lib/pdf/field-mapping";
import { deriveApprovalInitials } from "@/lib/pdf/derive-approval-initials";
import {
  formatPdfCurrency,
  formatPdfDate,
  formatPdfNumber,
  formatTrainingDatesIncludingTravel,
  formatTransportationSelection,
} from "@/lib/pdf/format-pdf-values";
import { PdfFormFieldError } from "@/lib/pdf/pdf-form-fields";
import type { TrainingRequestActionRecord } from "@/types/training-request-action";
import type { TrainingRequestRecord } from "@/types/training-request";

export interface ApprovedPacketStampInput {
  request: TrainingRequestRecord;
  mtoAction: TrainingRequestActionRecord;
  deputyAction: TrainingRequestActionRecord;
}

function requireValue(value: string, label: string): string {
  if (!value.trim()) {
    throw new PdfFormFieldError(
      `Approved packet generation requires ${label}, but no value was available.`,
    );
  }

  return value.trim();
}

export function resolveMtoApprovalInitials(
  mtoAction: TrainingRequestActionRecord,
): string {
  const initials =
    deriveApprovalInitials(mtoAction.signatureName) ||
    deriveApprovalInitials(mtoAction.actorName);

  if (!initials) {
    throw new PdfFormFieldError(
      "Approved packet generation requires MTO approval initials, but none could be derived from the committed approval record.",
    );
  }

  return initials;
}

export function buildTrainingRequestFormStampValues(
  input: ApprovedPacketStampInput,
): Record<keyof typeof TRAINING_REQUEST_FORM_TEXT_PLACEMENTS, string> {
  const { request } = input;
  const trainingDates = formatTrainingDatesIncludingTravel(
    request.courseStartDate,
    request.courseEndDate,
  );

  return {
    requesterName: requireValue(request.requesterName, "requester name"),
    badge: requireValue(request.requesterBadgeNumber, "badge number"),
    applicationDate: requireValue(
      formatPdfDate(request.submittedAt ?? request.createdAt),
      "application date",
    ),
    trainingName: requireValue(request.courseName, "training name"),
    trainingLocation: requireValue(request.location, "training location"),
    trainingDatesIncludingTravel: requireValue(trainingDates, "training dates"),
    totalDaysIncludingTravel: formatPdfNumber(request.numberOfDaysOnDuty),
    transportation: formatTransportationSelection({
      requestDepartmentVehicle: request.requestDepartmentVehicle,
      transportationNotes: request.transportationNotes,
    }),
    registrationFees: formatPdfCurrency(request.registrationFee),
    mileage: formatPdfNumber(request.totalReimbursableMiles),
    mileageRate: formatPdfCurrency(request.gsaMileageRate),
    mileageTotal: formatPdfCurrency(request.mileageReimbursement),
    mealFoodTotal: formatPdfCurrency(request.foodExpenses),
    lodgingTotal: formatPdfCurrency(request.lodging),
    otherTotal: formatPdfCurrency(request.otherExpenses),
    airfareTotal: formatPdfCurrency(request.airfare),
    rentalVehicleTotal: formatPdfCurrency(request.rentalVehicle),
    totalEstimatedExpenses: formatPdfCurrency(request.totalEstimatedExpenses),
    onDutyDatePrimary: "",
    onDutyDateSecondary: "",
  };
}

export function buildTrainingRequestApprovalStampValues(
  input: ApprovedPacketStampInput,
): {
  mtoApprovalDate: string;
  deputyApprovalDate: string;
} {
  const { mtoAction, deputyAction } = input;

  return {
    mtoApprovalDate: requireValue(
      formatPdfDate(mtoAction.signedAt ?? mtoAction.createdAt),
      "MTO approval date",
    ),
    deputyApprovalDate: requireValue(
      formatPdfDate(deputyAction.signedAt ?? deputyAction.createdAt),
      "Deputy Chief approval date",
    ),
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

export function getApprovedPacketStampPlan(input: ApprovedPacketStampInput): {
  trainingRequestText: ReturnType<typeof buildTrainingRequestFormStampValues>;
  trainingRequestApprovalDates: ReturnType<typeof buildTrainingRequestApprovalStampValues>;
  talOriginalInitials: ReturnType<typeof buildTalOriginalInitialStampValues>;
  signaturePlacements: typeof TRAINING_REQUEST_FORM_SIGNATURE_PLACEMENTS;
  talOriginalInitialPlacements: typeof TAL_ORIGINAL_INITIAL_PLACEMENTS;
} {
  return {
    trainingRequestText: buildTrainingRequestFormStampValues(input),
    trainingRequestApprovalDates: buildTrainingRequestApprovalStampValues(input),
    talOriginalInitials: buildTalOriginalInitialStampValues(input),
    signaturePlacements: TRAINING_REQUEST_FORM_SIGNATURE_PLACEMENTS,
    talOriginalInitialPlacements: TAL_ORIGINAL_INITIAL_PLACEMENTS,
  };
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

export function inspectApprovedPacketPdfContent(pdfBytes: Uint8Array): string {
  return Buffer.from(pdfBytes).toString("latin1");
}
