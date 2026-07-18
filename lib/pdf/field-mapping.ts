/**
 * AcroForm field names discovered via scripts/inspect-pdf-fields.ts
 * against lib/pdf/templates/*.pdf
 */

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
 * PDF coordinates use bottom-left origin (pdf-lib convention).
 * Signature boxes are documented here because the training request form
 * does not expose dedicated AcroForm image fields for MTO/Deputy signatures.
 */
export const TRAINING_REQUEST_FORM_SIGNATURE_PLACEMENTS = {
  /** Left signature box below the MTO approval date field (`undefined_2`). */
  mtoSignature: { pageIndex: 0, x: 75, y: 312, width: 260, height: 26 },
  /** Right signature box below the Deputy Chief approval date field (`undefined_3`). */
  deputySignature: { pageIndex: 0, x: 350, y: 312, width: 220, height: 26 },
} as const;

export const TAL_SIGNATURE_PLACEMENTS = {
  agencyAuthorization: { pageIndex: 0, x: 386.5, y: 503.2, width: 190.5, height: 24.1 },
} as const;

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
  "scbaClearance",
] as const;
