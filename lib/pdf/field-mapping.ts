/**
 * AcroForm field names discovered via scripts/inspect-pdf-fields.ts
 * against lib/pdf/templates/*.pdf
 *
 * Widget rectangles were captured with scripts/inspect-pdf-field-rects.ts.
 * PDF coordinates use a bottom-left origin (pdf-lib convention).
 */

export interface PdfTextBoxPlacement {
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize?: number;
}

export interface PdfImageBoxPlacement {
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export const TRAINING_REQUEST_FORM_FIELDS = {
  requesterName: "Name",
  badge: "Badge",
  applicationDate: "Application Date",
  trainingName: "Training Name",
  trainingLocation: "Training Location",
  trainingDatesIncludingTravel: "Training Dates including travel",
  totalDaysIncludingTravel: "Total Number of Days including travel",
  transportation: "Transportation circle one",
  registrationFees: "Total Registration Fees",
  mileage: "Mileage",
  mileageRate: "Mileage Rate",
  mileageTotal: "Mileage Total",
  meals: "Meals",
  mealFoodTotal: "MealFood Total",
  lodgingNights: "Nights",
  lodgingTotal: "Lodging Total",
  otherTotal: "Other Total",
  otherRow: "OtherRow1",
  airfareTotal: "Airfare Total",
  rentalVehicleTotal: "Rental Vehicle Total",
  totalEstimatedExpenses: "Total Estimated Expenses",
  approvedCheckbox: "Check Box1",
  deniedCheckbox: "Check Box2",
  mtoApprovalCheckbox: "Check Box3",
  deputyApprovalCheckbox: "Check Box4",
  denialReason: "Text4",
  onDutyDatePrimary: "Dates",
  onDutyDateSecondary: "Personnel must indicate all dates on duty during training below",
  mtoApprovalDate: "undefined_2",
  deputyApprovalDate: "undefined_3",
} as const;

/**
 * Visible widget metadata for training-request-form-2026.pdf (612×792).
 * Each critical field has a single widget; no duplicate or hidden widgets were found.
 * Text is stamped at these coordinates after flattening because AcroForm appearances
 * are not reliably preserved through flatten/copyPages/merge.
 */
export const TRAINING_REQUEST_FORM_TEXT_PLACEMENTS = {
  requesterName: {
    fieldName: TRAINING_REQUEST_FORM_FIELDS.requesterName,
    fieldType: "text",
    pageIndex: 0,
    x: 81.7,
    y: 647.2,
    width: 142.7,
    height: 17.3,
  },
  badge: {
    fieldName: TRAINING_REQUEST_FORM_FIELDS.badge,
    fieldType: "text",
    pageIndex: 0,
    x: 271.4,
    y: 648.1,
    width: 61.1,
    height: 17.3,
  },
  applicationDate: {
    fieldName: TRAINING_REQUEST_FORM_FIELDS.applicationDate,
    fieldType: "text",
    pageIndex: 0,
    x: 418.7,
    y: 648.1,
    width: 102.4,
    height: 17.3,
  },
  trainingName: {
    fieldName: TRAINING_REQUEST_FORM_FIELDS.trainingName,
    fieldType: "text",
    pageIndex: 0,
    x: 124.9,
    y: 629.4,
    width: 396.1,
    height: 17.3,
  },
  trainingLocation: {
    fieldName: TRAINING_REQUEST_FORM_FIELDS.trainingLocation,
    fieldType: "text",
    pageIndex: 0,
    x: 137.3,
    y: 610.8,
    width: 383.8,
    height: 17.3,
  },
  trainingDatesIncludingTravel: {
    fieldName: TRAINING_REQUEST_FORM_FIELDS.trainingDatesIncludingTravel,
    fieldType: "text",
    pageIndex: 0,
    x: 221.4,
    y: 592.2,
    width: 111.0,
    height: 17.3,
  },
  totalDaysIncludingTravel: {
    fieldName: TRAINING_REQUEST_FORM_FIELDS.totalDaysIncludingTravel,
    fieldType: "text",
    pageIndex: 0,
    x: 246.7,
    y: 574.0,
    width: 91.8,
    height: 17.3,
  },
  transportation: {
    fieldName: TRAINING_REQUEST_FORM_FIELDS.transportation,
    fieldType: "text",
    pageIndex: 0,
    x: 456.1,
    y: 591.7,
    width: 86.6,
    height: 14.3,
  },
  registrationFees: {
    fieldName: TRAINING_REQUEST_FORM_FIELDS.registrationFees,
    fieldType: "text",
    pageIndex: 0,
    x: 433.2,
    y: 525.2,
    width: 142.8,
    height: 13.3,
  },
  mileage: {
    fieldName: TRAINING_REQUEST_FORM_FIELDS.mileage,
    fieldType: "text",
    pageIndex: 0,
    x: 91.8,
    y: 511.0,
    width: 83.6,
    height: 13.2,
  },
  mileageRate: {
    fieldName: TRAINING_REQUEST_FORM_FIELDS.mileageRate,
    fieldType: "text",
    pageIndex: 0,
    x: 195.2,
    y: 511.5,
    width: 47.4,
    height: 13.2,
  },
  mileageTotal: {
    fieldName: TRAINING_REQUEST_FORM_FIELDS.mileageTotal,
    fieldType: "text",
    pageIndex: 0,
    x: 381.2,
    y: 511.0,
    width: 194.8,
    height: 13.2,
  },
  mealFoodTotal: {
    fieldName: TRAINING_REQUEST_FORM_FIELDS.mealFoodTotal,
    fieldType: "text",
    pageIndex: 0,
    x: 396.0,
    y: 496.8,
    width: 180.0,
    height: 13.1,
  },
  lodgingTotal: {
    fieldName: TRAINING_REQUEST_FORM_FIELDS.lodgingTotal,
    fieldType: "text",
    pageIndex: 0,
    x: 382.3,
    y: 482.5,
    width: 193.7,
    height: 13.2,
  },
  otherTotal: {
    fieldName: TRAINING_REQUEST_FORM_FIELDS.otherTotal,
    fieldType: "text",
    pageIndex: 0,
    x: 369.8,
    y: 468.2,
    width: 206.2,
    height: 13.2,
  },
  airfareTotal: {
    fieldName: TRAINING_REQUEST_FORM_FIELDS.airfareTotal,
    fieldType: "text",
    pageIndex: 0,
    x: 375.7,
    y: 454.0,
    width: 200.3,
    height: 13.2,
  },
  rentalVehicleTotal: {
    fieldName: TRAINING_REQUEST_FORM_FIELDS.rentalVehicleTotal,
    fieldType: "text",
    pageIndex: 0,
    x: 418.0,
    y: 439.8,
    width: 158.0,
    height: 13.1,
  },
  totalEstimatedExpenses: {
    fieldName: TRAINING_REQUEST_FORM_FIELDS.totalEstimatedExpenses,
    fieldType: "text",
    pageIndex: 0,
    x: 503.6,
    y: 425.9,
    width: 74.0,
    height: 12.8,
  },
  onDutyDatePrimary: {
    fieldName: TRAINING_REQUEST_FORM_FIELDS.onDutyDatePrimary,
    fieldType: "text",
    pageIndex: 0,
    x: 75.1,
    y: 375.4,
    width: 85.8,
    height: 17.3,
  },
  onDutyDateSecondary: {
    fieldName: TRAINING_REQUEST_FORM_FIELDS.onDutyDateSecondary,
    fieldType: "text",
    pageIndex: 0,
    x: 194.0,
    y: 375.4,
    width: 74.9,
    height: 17.3,
  },
} as const satisfies Record<
  string,
  PdfTextBoxPlacement & { fieldName: string; fieldType: string }
>;

export const TAL_FORM_FIELDS = {
  courseName: "Course Name",
  courseNumber: "Course Number",
  courseLocation: "Course Location",
  agencyName: "Agency Name",
  fdid: "FDID#",
  authorizationDate: "Date",
  authorizedRepresentativeName: "Name of authorized rep",
  studentAuthorized: "Yes - student authorized",
  scbaClearanceText:
    "Authorized Rep InitialsThe student listed below has medical clearance to use SelfContained Breathing Apparatus SCBA in accordance with 29 CFR part 1910134",
  scbaClearance: "Yes - scba clearance",
  studentAuthorizationInitials:
    "Authorized Rep InitialsThe student listed below has the medical clearance to perform the skills required during this training course",
  lastName: "Last Name",
  firstName: "First Name",
  middleInitial: "MI",
  address: "Address",
  city: "City",
  state: "State",
  nyTrainingId: "New York Training ID",
  phone: "primary",
  zip: "Zip",
  email: "Email Address",
  studentPrintName: "PRINT NAME OF STUDENT",
  studentSignatureDate: "DATE OF STUDENT SIGNATURE",
  agencySignatureField: "Signature1",
  studentSignatureField: "Student signature",
} as const;

export const TAL_CONSTANTS = {
  agencyName: "Ithaca Fire Department",
  fdid: "55009",
} as const;

/**
 * Signature and approval-date placements for training-request-form-2026.pdf.
 * MTO and Deputy Chief signatures are stacked vertically on the left side of the
 * form. The Deputy Chief signature sits on the line below the MTO signature.
 */
export const TRAINING_REQUEST_FORM_SIGNATURE_PLACEMENTS = {
  /** Left signature line following "MTO:"; vertically above the Deputy Chief line. */
  mtoSignature: { pageIndex: 0, x: 75, y: 328, width: 215, height: 22 },
  /** DATE field on the MTO approval row (`undefined_2`). */
  mtoApprovalDate: { pageIndex: 0, x: 302.0, y: 375.4, width: 75.0, height: 17.3 },
  /** Left signature line following "Deputy Chief:"; vertically below the MTO line. */
  deputySignature: { pageIndex: 0, x: 75, y: 298, width: 215, height: 22 },
  /** DATE field on the Deputy Chief approval row (`undefined_3`). */
  deputyApprovalDate: { pageIndex: 0, x: 410.2, y: 375.4, width: 74.9, height: 17.3 },
} as const satisfies Record<string, PdfTextBoxPlacement | PdfImageBoxPlacement>;

export const TAL_SIGNATURE_PLACEMENTS = {
  agencyAuthorization: { pageIndex: 0, x: 386.5, y: 503.2, width: 190.5, height: 24.1 },
} as const;

/**
 * ORIGINAL INITIAL boxes on tal.pdf (612×792).
 * Both boxes receive the committed MTO initials after flattening.
 */
export const TAL_ORIGINAL_INITIAL_PLACEMENTS = {
  /** Box aligned with "Yes - student authorized". */
  studentAuthorization: {
    fieldName: TAL_FORM_FIELDS.scbaClearanceText,
    pageIndex: 0,
    x: 462.9,
    y: 455.4,
    width: 93.7,
    height: 22.0,
  },
  /** Box aligned with "Yes - scba clearance". */
  scbaClearance: {
    fieldName: TAL_FORM_FIELDS.studentAuthorizationInitials,
    pageIndex: 0,
    x: 462.4,
    y: 428.1,
    width: 93.7,
    height: 22.2,
  },
} as const satisfies Record<
  string,
  PdfTextBoxPlacement & { fieldName: string }
>;

/**
 * Future personnel fields not yet stored in the portal schema.
 * Leave corresponding TAL AcroForm fields blank until available.
 */
export const TAL_PERSONNEL_FIELDS_NOT_YET_AVAILABLE = [
  "middleInitial",
  "address",
  "city",
  "state",
  "zip",
  "phone",
  "nyTrainingId",
] as const;

/**
 * Individual on-duty dates are not stored separately in the portal schema.
 * Only `numberOfDaysOnDuty` is available, so the on-duty date boxes remain blank.
 */
export const TRAINING_REQUEST_ON_DUTY_DATE_LIMITATION =
  "Individual on-duty dates are not stored; only the total day count is available." as const;
