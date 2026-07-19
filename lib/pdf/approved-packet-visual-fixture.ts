import type { TrainingRequestActionRecord } from "@/types/training-request-action";
import type { TrainingRequestRecord } from "@/types/training-request";
import { VALID_TEST_PNG } from "@/lib/test-utils/valid-test-png";

export const APPROVED_PACKET_VISUAL_FIXTURE_REQUEST: TrainingRequestRecord = {
  id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  requestNumber: "Fire Fighter, Testing Sig, 2026.1",
  requesterPersonnelId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
  requesterBadgeNumber: "207",
  requesterEmail: "firefighter@ifd.example",
  requesterName: "Fire Fighter",
  courseName: "Testing Sig",
  courseNumber: "TS-1",
  trainingProvider: "IFD Training",
  courseDescription: "Signature placement verification course",
  location: "Where ever",
  courseStartDate: "2026-08-10",
  courseEndDate: "2026-08-12",
  numberOfDaysOnDuty: 3,
  registrationFee: 100,
  lodging: 200,
  foodExpenses: 75,
  airfare: 0,
  rentalVehicle: 0,
  otherExpenses: 10,
  mileageReimbursement: 42,
  totalReimbursableMiles: 60,
  gsaMileageRate: 0.7,
  totalEstimatedExpenses: 427,
  requestDepartmentVehicle: false,
  transportationNotes: "Personal Vehicle",
  status: "approved",
  currentActionRole: null,
  submittedAt: "2026-07-10T12:00:00.000Z",
  createdAt: "2026-07-09T12:00:00.000Z",
  updatedAt: "2026-07-11T12:00:00.000Z",
};

function buildFixtureAction(
  overrides: Partial<TrainingRequestActionRecord>,
): TrainingRequestActionRecord {
  return {
    id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
    trainingRequestId: APPROVED_PACKET_VISUAL_FIXTURE_REQUEST.id,
    actorPersonnelId: "dddddddd-dddd-dddd-dddd-dddddddddddd",
    actorName: "Kevin Koehler",
    actorBadgeNumber: "100",
    actorRole: "mto",
    action: "mto_approved",
    comments: null,
    signatureName: "Kevin Koehler",
    signedAt: "2026-07-10T15:00:00.000Z",
    electronicSignatureConfirmed: true,
    signatureStorageBucket: "training-request-signature-snapshots",
    signatureStoragePath: `${APPROVED_PACKET_VISUAL_FIXTURE_REQUEST.id}/cccccccc-cccc-cccc-cccc-cccccccccccc/signature.png`,
    signatureSha256: "abc",
    signatureMimeType: "image/png",
    signatureFileSizeBytes: 100,
    createdAt: "2026-07-10T15:00:00.000Z",
    ...overrides,
  };
}

export const APPROVED_PACKET_VISUAL_FIXTURE_INPUT = {
  request: APPROVED_PACKET_VISUAL_FIXTURE_REQUEST,
  mtoAction: buildFixtureAction({ action: "mto_approved", actorRole: "mto" }),
  deputyAction: buildFixtureAction({
    id: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
    action: "deputy_chief_approved",
    actorRole: "deputy_chief",
    actorName: "Deputy Chief Reviewer",
    signatureName: "Deputy Chief Reviewer",
    signedAt: "2026-07-11T10:00:00.000Z",
    createdAt: "2026-07-11T10:00:00.000Z",
    signatureStoragePath: `${APPROVED_PACKET_VISUAL_FIXTURE_REQUEST.id}/eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee/signature.png`,
  }),
  mtoSignaturePng: VALID_TEST_PNG,
  deputySignaturePng: VALID_TEST_PNG,
};
