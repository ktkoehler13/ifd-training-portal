import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  canDownloadApprovedPacket,
  canRetryApprovedPacketGeneration,
} from "./training-request-packet-access";
import type { AuthenticatedPersonnel } from "@/lib/auth/personnel";
import type { TrainingRequestRecord } from "@/types/training-request";
import type { TrainingRequestPacketRecord } from "@/types/training-request-packet";

const owner: AuthenticatedPersonnel = {
  id: "11111111-1111-1111-1111-111111111111",
  badgeNumber: "207",
  email: "owner@ifd.example",
  firstName: "Kevin",
  lastName: "Koehler",
  title: "firefighter",
  role: "firefighter",
  active: true,
  mustChangePassword: false,
  passwordSetupCompletedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const otherFirefighter: AuthenticatedPersonnel = {
  ...owner,
  id: "22222222-2222-2222-2222-222222222222",
  email: "other@ifd.example",
};

const mto: AuthenticatedPersonnel = {
  ...owner,
  id: "33333333-3333-3333-3333-333333333333",
  role: "mto",
};

const approvedRequest: TrainingRequestRecord = {
  id: "44444444-4444-4444-4444-444444444444",
  requestNumber: "Koehler, K, Fire Officer I, 2026.1",
  requesterPersonnelId: owner.id,
  requesterBadgeNumber: "207",
  requesterEmail: "owner@ifd.example",
  requesterName: "Kevin Koehler",
  requesterTitleSnapshot: "firefighter",
  courseName: "Fire Officer I",
  courseNumber: "FO-1",
  trainingProvider: "Provider",
  courseDescription: "Description",
  location: "Montour Falls, NY",
  courseStartDate: "2026-08-01",
  courseEndDate: "2026-08-05",
  numberOfDaysOnDuty: 5,
  registrationFee: 0,
  lodging: 0,
  foodExpenses: 0,
  airfare: 0,
  rentalVehicle: 0,
  otherExpenses: 0,
  mileageReimbursement: 0,
  totalReimbursableMiles: 0,
  gsaMileageRate: 0.7,
  totalEstimatedExpenses: 0,
  requestDepartmentVehicle: false,
  transportationNotes: "",
  status: "approved",
  currentActionRole: null,
  submittedAt: "2026-07-01T12:00:00.000Z",
  createdAt: "2026-06-30T12:00:00.000Z",
  updatedAt: "2026-07-02T12:00:00.000Z",
};

const readyPacket: TrainingRequestPacketRecord = {
  id: "55555555-5555-5555-5555-555555555555",
  requestId: approvedRequest.id,
  storageBucket: "training-request-packets",
  storagePath: `${approvedRequest.id}/approved-packet.pdf`,
  filename: "Koehler, K, Fire Officer I, 2026.1.pdf",
  sha256: "a".repeat(64),
  fileSizeBytes: 1000,
  status: "ready",
  generationAttempts: 1,
  lastError: null,
  generatedAt: "2026-07-02T12:30:00.000Z",
  createdAt: "2026-07-02T12:00:00.000Z",
  updatedAt: "2026-07-02T12:30:00.000Z",
};

describe("approved packet download authorization", () => {
  it("blocks download before approval", () => {
    assert.equal(
      canDownloadApprovedPacket({
        personnel: owner,
        request: { ...approvedRequest, status: "pending_deputy_chief" },
        packet: readyPacket,
      }),
      false,
    );
  });

  it("blocks unrelated firefighters with 403-equivalent authorization", () => {
    assert.equal(
      canDownloadApprovedPacket({
        personnel: otherFirefighter,
        request: approvedRequest,
        packet: readyPacket,
      }),
      false,
    );
  });

  it("allows the request owner after the packet is ready", () => {
    assert.equal(
      canDownloadApprovedPacket({
        personnel: owner,
        request: approvedRequest,
        packet: readyPacket,
      }),
      true,
    );
  });

  it("allows administrative roles after the packet is ready", () => {
    assert.equal(
      canDownloadApprovedPacket({
        personnel: mto,
        request: approvedRequest,
        packet: readyPacket,
      }),
      true,
    );
  });

  it("blocks download when the packet is not ready", () => {
    assert.equal(
      canDownloadApprovedPacket({
        personnel: owner,
        request: approvedRequest,
        packet: { ...readyPacket, status: "pending" },
      }),
      false,
    );
  });
});

describe("approved packet retry authorization", () => {
  it("allows administrative roles to retry failed generation", () => {
    assert.equal(canRetryApprovedPacketGeneration("mto"), true);
    assert.equal(canRetryApprovedPacketGeneration("deputy_chief"), true);
    assert.equal(canRetryApprovedPacketGeneration("admin"), true);
  });

  it("does not expose retry controls to firefighters", () => {
    assert.equal(canRetryApprovedPacketGeneration("firefighter"), false);
  });

  it("leaves approved requests downloadable even when packet generation failed", () => {
    assert.equal(
      canDownloadApprovedPacket({
        personnel: owner,
        request: approvedRequest,
        packet: { ...readyPacket, status: "failed", lastError: "Generation failed." },
      }),
      false,
    );
    assert.equal(approvedRequest.status, "approved");
  });
});
