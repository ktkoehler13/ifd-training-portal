import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { APPROVED_PACKET_VISUAL_FIXTURE_INPUT as fixture } from "./approved-packet-visual-fixture";
import { createTrainingRequestPdf, trainingRequestExpenseRows, type TrainingRequestDrawnItem } from "./render-training-request";
import { wrapPdfText as wrapTrainingRequestText } from "./wrap-pdf-text";
import { generateApprovedPacketBytes } from "./generate-approved-packet";
import type { TrainingRequestRecord } from "@/types/training-request";

async function render(overrides: Partial<TrainingRequestRecord> = {}) {
  return createTrainingRequestPdf(await PDFDocument.load(await readFile("lib/pdf/templates/training-request-form-2026.pdf")), { ...fixture, request: { ...fixture.request, ...overrides } });
}
function words(items: TrainingRequestDrawnItem[]) {
  return items.filter(item => item.kind === "text").map(item => item.text).join("\n");
}
function assertGeometry(items: TrainingRequestDrawnItem[]) {
  for (const item of items.filter(item => item.kind === "text" || item.kind === "signature")) {
    assert.ok(item.x >= 42 && item.x + item.width <= 570.01, `horizontal overflow: ${item.text}`);
    assert.ok(item.y >= 31 && item.y + item.height <= 676, `vertical overflow: ${item.text}`);
    const travel = items.find(region => region.kind === "travel" && region.pageIndex === item.pageIndex);
    if (travel && item.y > 31) assert.ok(item.y >= travel.y + travel.height, `overlaps Travel Authorization: ${item.text}`);
  }
  const signatures = items.filter(item => item.kind === "signature");
  assert.equal(signatures.length, 2);
  assert.equal(signatures[0].pageIndex, signatures[1].pageIndex);
  assert.ok(signatures[1].y + signatures[1].height < signatures[0].y);
}

describe("redesigned Training Request", () => {
  it("fits a typical request on one page, retaining section order and bottom authorization", async () => {
    const { pdf, items } = await render({ otherExpenseDescription: "Parking & Tolls" });
    assert.equal(pdf.getPageCount(), 1);
    const text = words(items);
    assert.ok(text.indexOf("GENERAL INFORMATION") < text.indexOf("ESTIMATED EXPENSES"));
    assert.ok(text.indexOf("ESTIMATED EXPENSES") < text.indexOf("APPROVALS"));
    assert.match(text, /Other – Parking & Tolls/);
    assert.equal(items.filter(item => item.kind === "travel").length, 1);
    assertGeometry(items);
  });
  it("shows every expense including zeroes, right aligns currency, and uses a bold total", async () => {
    const { items } = await render();
    const labels = trainingRequestExpenseRows(fixture.request).map(row => row.label);
    assert.deepEqual(labels, ["Registration Fee", "Mileage Reimbursement", "Lodging", "Airfare", "Rental Vehicle", "Food / Meals", "Other Expense"]);
    const money = items.filter(item => /^\$/.test(item.text ?? ""));
    assert.equal(money.length, 8);
    assert.equal(money.filter(item => item.text === "$0.00").length, 2);
    for (const item of money) assert.ok(Math.abs(item.x + item.width - 570) < 0.001);
    assert.equal(money.at(-1)?.text, "$427.00");
    assert.equal(money.at(-1)?.bold, true);
  });
  it("uses the stored historical rate and estimate, preserving three decimal places", async () => {
    const { items } = await render({ gsaMileageRate: 0.725, totalReimbursableMiles: 100, mileageReimbursement: 72.5, totalEstimatedExpenses: 457.5 });
    assert.match(words(items), /\$0\.725 \/ mile/);
    assert.ok(items.some(item => item.text === "$72.50"));
    assert.ok(items.some(item => item.text === "$457.50"));
    assert.equal(trainingRequestExpenseRows({ ...fixture.request, requestDepartmentVehicle: true })[1].amount, 0);
  });
  it("generates historical packets with optional values null or absent", async () => {
    const request = { ...fixture.request, otherExpenseDescription: null, trainingProvider: undefined, courseDescription: null, transportationNotes: undefined, onDutyDates: undefined, totalDaysIncludingTravel: null, courseNumber: undefined, requesterEmail: undefined } as unknown as TrainingRequestRecord;
    await assert.doesNotReject(() => generateApprovedPacketBytes({ ...fixture, request }));
    const { items } = await render(request);
    assert.match(words(items), /Other Expense/);
    assert.doesNotMatch(words(items), /undefined|null/);
  });
  it("wraps long paragraphs, unbroken tokens, dates, and Other descriptions without losing the tail", async () => {
    const { pdf, items } = await render({
      courseName: `Course ${"X".repeat(240)} COURSE_END`,
      trainingProvider: "Provider ".repeat(30) + "PROVIDER_END",
      courseDescription: "Multi-line description\n" + "Training details ".repeat(350) + "DESCRIPTION_END",
      otherExpenseDescription: "Parking and tolls ".repeat(200) + "OTHER_END",
      onDutyDates: Array.from({ length: 28 }, (_, i) => `2026-08-${String(i + 1).padStart(2, "0")}`),
    });
    assert.ok(pdf.getPageCount() > 2);
    for (const end of ["COURSE_END", "PROVIDER_END", "DESCRIPTION_END", "OTHER_END", "08/28/2026"]) assert.ok(words(items).includes(end));
    assert.equal(items.find(item => item.kind === "travel")?.pageIndex, pdf.getPageCount() - 1);
    assertGeometry(items);
    const packet = await PDFDocument.load(await generateApprovedPacketBytes({ ...fixture, request: { ...fixture.request, courseDescription: "details ".repeat(900) } }));
    assert.ok(packet.getPageCount() > 3);
    assert.equal(packet.getForm().getFields().length, 0);
  });
  it("keeps committed approval names and dates, with safe wrapping for long snapshots", async () => {
    const template = await PDFDocument.load(await readFile("lib/pdf/templates/training-request-form-2026.pdf"));
    const { items } = await createTrainingRequestPdf(template, { ...fixture,
      mtoAction: { ...fixture.mtoAction, signatureName: "Historical Approver", actorName: "Different Actor Name" },
      deputyAction: { ...fixture.deputyAction, signatureName: "Deputy ".repeat(180) + "SNAPSHOT_END" },
    });
    assert.match(words(items), /Historical Approver/);
    assert.doesNotMatch(words(items), /Different Actor Name/);
    assert.match(words(items), /SNAPSHOT_END/);
    assert.match(words(items), /DATE: 07\/08\/2026/);
    assertGeometry(items);
  });
  it("breaks overlong words and tolerates unsupported characters in optional text", async () => {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const lines = wrapTrainingRequestText("x".repeat(500), font, 100);
    assert.equal(lines.join(""), "x".repeat(500));
    assert.ok(lines.every(line => font.widthOfTextAtSize(line, 9) <= 100));
    await assert.doesNotReject(() => render({ otherExpenseDescription: "Parking 🚒", courseDescription: "First line\nSecond line" }));
  });
});
