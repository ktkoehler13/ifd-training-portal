import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PDFDocument } from "pdf-lib";
import { academyDigitPlacements, academyRegistrationValues, createAcademyRegistrationPdf } from "./render-academy-registration";
import { generateApprovedPacketBytes, inspectTalPopulationForTest } from "./generate-approved-packet";
import { APPROVED_PACKET_VISUAL_FIXTURE_INPUT as fixture } from "./approved-packet-visual-fixture";
import { validateFinalMergedPacketNonInteractive, countWidgetAnnotations } from "./validate-merged-packet";

const academy = { ...fixture, request: { ...fixture.request, locationType: "nys_fire_academy" as const, location: "NYS Fire Academy", academyMealDays: 3,
  requesterName: "Sample Requester", requesterAddress: "123 Example St", requesterCity: "Ithaca", requesterState: "NY", requesterZip: "14850", requesterPhone: "607-555-0100", nyTrainingId: "NY0012345", academySsnLast4: "0012", requestContactEmail: "alternate@example.test", registrationFee: 25, foodExpenses: 24 } };

describe("official Academy registration page", () => {
  it("centers each ID and SSN digit in the original printed cells without losing leading zeroes", () => {
    const training = academyDigitPlacements("Training ID", "0012345")!;
    const ssn = academyDigitPlacements("last 4 of SSN", "0012")!;
    assert.equal(training.map(p => p.digit).join(""), "0012345");
    assert.equal(ssn.map(p => p.digit).join(""), "0012");
    const idEdges = [162.2644, 179.1166, 195.9689, 212.8211, 229.6734, 246.5256, 263.3779, 280.2301];
    const ssnEdges = [212.8211, 229.6734, 246.5256, 263.3779, 280.2301];
    for (const [positions, edges] of [[training, idEdges], [ssn, ssnEdges]] as const) {
      positions.forEach((p, i) => assert.ok(Math.abs(p.centerX - (edges[i] + edges[i + 1]) / 2) < 0.001));
    }
    assert.equal(academyDigitPlacements("Training ID", "00123456"), null);
    assert.equal(academyDigitPlacements("last 4 of SSN", "123456789"), null);
    assert.equal(academyDigitPlacements("last 4 of SSN", "12"), null);
  });
  it("fills request details and final approved estimates while leaving uncollected fields blank", () => {
    const values = academyRegistrationValues(academy);
    assert.equal(values.Name, "Requester, Sample"); assert.equal(values["Training ID"], "0012345");
    assert.equal(values.Email, "alternate@example.test"); assert.equal(values.FeeRegistration, "25.00"); assert.equal(values.Feemealsandlodging, "24.00");
    assert.equal(values["Home Address"], "123 Example St");
    assert.equal(values.FDID, "55009"); assert.equal(values["last 4 of SSN"], "0012");
    for (const field of ["Date of Birth", "Male", "Female", "FeeTotalEnclosed", "FeeBalanceDue", "visa", "mastercard", "discover", "total charge", "card 1", "card 2", "card 3", "card 4", "Expiration Date", "Expiration year", "Security Code", "Check", "Money Order", "Signed Voucher", "Purchase Order", "Signature"]) assert.equal(values[field], undefined);
    const revised = academyRegistrationValues({ ...academy, request: { ...academy.request, registrationFee: 50, foodExpenses: 0 } });
    assert.equal(revised.FeeRegistration, "50.00"); assert.equal(revised.Feemealsandlodging, "0.00");
  });
  it("uses the committed MTO name and signing date for the sponsoring agency", () => {
    const values = academyRegistrationValues({ ...academy, mtoAction: { ...fixture.mtoAction, signatureName: "Historical Approver", actorName: "Different Name", signedAt: "2026-07-08T15:00:00Z" } });
    assert.equal(values["Sponsor Name / Title"], "Historical Approver / MTO"); assert.equal(values["Signature Date"], "07/08/2026");
  });
  it("keeps missing historical SSN suffixes blank and never prints a full SSN", async () => {
    for (const academySsnLast4 of [undefined, null, "", "123456789", "12a4"]) {
      const input = { ...academy, request: { ...academy.request, academySsnLast4 } };
      assert.equal(academyRegistrationValues(input)["last 4 of SSN"], "");
      assert.equal((await createAcademyRegistrationPdf(input)).getPageCount(), 1);
    }
  });
  it("preserves an overlong historical Training ID on a continuation page", async () => {
    assert.equal((await createAcademyRegistrationPdf({ ...academy, request: { ...academy.request, nyTrainingId: "00123456" } })).getPageCount(), 2);
  });
  it("preserves the one-page artwork and removes interactive widgets from the approved copy", async () => {
    const pdf = await createAcademyRegistrationPdf(academy);
    assert.equal(pdf.getPageCount(), 1); assert.equal(pdf.getForm().getFields().length, 0); assert.equal(countWidgetAnnotations(pdf), 0);
  });
  it("adds registration only for requests explicitly identified as Academy training", async () => {
    const original = await PDFDocument.load(await generateApprovedPacketBytes({ ...academy, request: { ...academy.request, locationType: "other" } }));
    const bytes = await generateApprovedPacketBytes(academy); const included = await PDFDocument.load(bytes);
    assert.equal(included.getPageCount(), original.getPageCount() + 1);
    await validateFinalMergedPacketNonInteractive(bytes);
  });
  it("continues excessive text onto extra pages instead of overflowing official form fields", async () => {
    const pdf = await createAcademyRegistrationPdf({ ...academy, request: { ...academy.request, requesterAddress: "Long street ".repeat(200), courseName: "Unbroken".repeat(300), requestContactEmail: "email".repeat(35) + "@example.test" } });
    assert.ok(pdf.getPageCount() > 1); assert.equal(countWidgetAnnotations(pdf), 0);
  });
  it("keeps long course and contact text readable in the existing TAL boxes", async () => {
    const populated = await inspectTalPopulationForTest({ ...academy, request: { ...academy.request, courseName: "Long course title ".repeat(30), requestContactEmail: "email".repeat(40) + "@example.test" } });
    assert.equal(populated.courseName, "See Training Request for course");
    assert.equal(populated.contactEmail, "See request contact email in audit trail");
  });
});
