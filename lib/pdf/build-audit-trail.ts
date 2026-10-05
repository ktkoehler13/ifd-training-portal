import {
  PDFDocument,
  rgb,
  StandardFonts,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import { wrapPdfText } from "@/lib/pdf/wrap-pdf-text";
import { warnApprovedPacketFieldUnavailable } from "@/lib/pdf/warn-approved-packet-fields";
import { getOnDutyDatesPdfOverflow } from "@/lib/pdf/build-stamp-values";
import { formatOnDutyDatesForDisplay } from "@/lib/training-day-details";
import { TRAINING_REQUEST_STATUS_LABELS } from "@/types/training-request";
import type { TrainingRequestActionRecord, TrainingRequestActionType } from "@/types/training-request-action";
import type { TrainingRequestRecord } from "@/types/training-request";

export const AUDIT_TRAIL_TIME_ZONE = "America/New_York";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN_LEFT = 48;
const MARGIN_RIGHT = 48;
const MARGIN_TOP = 52;
const MARGIN_BOTTOM = 48;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;
const FOOTER_HEIGHT = 24;
const TIMELINE_X = MARGIN_LEFT + 6;
const EVENT_TEXT_X = MARGIN_LEFT + 18;
const COMMENT_INDENT_X = MARGIN_LEFT + 28;
const COMMENT_WRAP_WIDTH = CONTENT_WIDTH - (COMMENT_INDENT_X - MARGIN_LEFT);

const FONT_SIZE_DEPARTMENT = 13;
const FONT_SIZE_TITLE = 16;
const FONT_SIZE_SUMMARY_LABEL = 9;
const FONT_SIZE_SUMMARY_VALUE = 9;
const FONT_SIZE_EVENT = 10;
const FONT_SIZE_COMMENT = 9;
const FONT_SIZE_FOOTER = 8;
const FONT_SIZE_CONTINUED = 12;

const EVENT_LINE_HEIGHT = 14;
const COMMENT_LINE_HEIGHT = 11;
const EVENT_BLOCK_SPACING = 10;
const SUMMARY_LINE_HEIGHT = 13;

const REQUESTER_ACTIONS = new Set<TrainingRequestActionType>([
  "submitted",
  "resubmitted",
  "cancelled",
]);

const SIGNED_APPROVAL_ACTIONS = new Set<TrainingRequestActionType>([
  "mto_approved",
  "deputy_chief_approved",
]);

export const AUDIT_ACTION_PHRASES: Record<TrainingRequestActionType, string> = {
  submitted: "Submitted request",
  mto_approved: "Approved request",
  mto_returned: "Returned request for correction",
  mto_denied: "Denied request",
  deputy_chief_approved: "Approved request",
  deputy_chief_returned: "Returned request for correction",
  deputy_chief_denied: "Denied request",
  resubmitted: "Resubmitted request",
  cancelled: "Cancelled request",
};

export interface AuditTrailEntry {
  actor: string;
  actionPhrase: string;
  timestamp: string;
  commentLabel: string | null;
  commentText: string | null;
  eventLine: string;
  sortTimestamp: string;
}

function extractLastName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts[parts.length - 1] ?? name.trim();
}

export function formatRequesterAuditActor(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    return "Unknown user";
  }

  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const lastName = parts[parts.length - 1]!;
    const initial = parts[0]!.replace(/[^a-zA-Z]/g, "").charAt(0).toUpperCase();
    if (lastName && initial) {
      return `${lastName}, ${initial}.`;
    }
  }

  return trimmed;
}

export function formatAuditActor(action: TrainingRequestActionRecord): string {
  const name = action.actorName?.trim();
  if (!name) {
    return "Unknown user";
  }

  if (REQUESTER_ACTIONS.has(action.action)) {
    return formatRequesterAuditActor(name);
  }

  const lastName = extractLastName(name);

  switch (action.actorRole) {
    case "mto":
      return `MTO ${lastName}`;
    case "deputy_chief":
      return `Deputy Chief ${lastName}`;
    case "admin":
      return `Admin ${lastName}`;
    default:
      return name;
  }
}

export function formatAuditAction(action: TrainingRequestActionRecord): string {
  return AUDIT_ACTION_PHRASES[action.action];
}

export function getAuditTimestampSource(action: TrainingRequestActionRecord): string {
  if (SIGNED_APPROVAL_ACTIONS.has(action.action) && action.signedAt?.trim()) {
    return action.signedAt;
  }

  return action.createdAt;
}

export function formatAuditTimestamp(
  value: string | null | undefined,
  timeZone: string = AUDIT_TRAIL_TIME_ZONE,
): string {
  if (!value?.trim()) {
    return "Time unavailable";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Time unavailable";
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  }).formatToParts(date);

  const lookup = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  const hour = lookup.hour ?? "00";
  const minute = lookup.minute ?? "00";
  const month = lookup.month ?? "01";
  const day = lookup.day ?? "01";
  const year = lookup.year ?? "0000";

  return `${hour}:${minute} ${month}/${day}/${year}`;
}

export function formatAuditGeneratedTimestamp(
  generatedAt: Date = new Date(),
  timeZone: string = AUDIT_TRAIL_TIME_ZONE,
): string {
  return formatAuditTimestamp(generatedAt.toISOString(), timeZone);
}

export function getAuditCommentLabel(
  action: TrainingRequestActionRecord,
): string | null {
  const comments = action.comments?.trim();
  if (!comments) {
    return null;
  }

  switch (action.action) {
    case "mto_denied":
    case "deputy_chief_denied":
      return "Reason";
    case "mto_returned":
    case "deputy_chief_returned":
      return "Correction requested";
    default:
      return "Comment";
  }
}

export function prepareAuditTrailActions(
  request: TrainingRequestRecord,
  actions: TrainingRequestActionRecord[],
): TrainingRequestActionRecord[] {
  return actions
    .filter((action) => action.trainingRequestId === request.id)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

export function buildAuditTrailEntry(
  action: TrainingRequestActionRecord,
  requestId: string,
): AuditTrailEntry {
  const actor = formatAuditActor(action);
  const actionPhrase = formatAuditAction(action);
  const timestamp = formatAuditTimestamp(getAuditTimestampSource(action));
  const commentLabel = getAuditCommentLabel(action);
  const commentText = action.comments?.trim() || null;

  if (!action.actorName?.trim()) {
    warnApprovedPacketFieldUnavailable(requestId, "auditActorName");
  }

  if (timestamp === "Time unavailable") {
    warnApprovedPacketFieldUnavailable(requestId, "auditTimestamp");
  }

  return {
    actor,
    actionPhrase,
    timestamp,
    commentLabel,
    commentText,
    eventLine: `${actor} — ${actionPhrase} — ${timestamp}`,
    sortTimestamp: action.createdAt,
  };
}

export function buildAuditTrailEntries(
  request: TrainingRequestRecord,
  actions: TrainingRequestActionRecord[],
): AuditTrailEntry[] {
  return prepareAuditTrailActions(request, actions).map((action) =>
    buildAuditTrailEntry(action, request.id),
  );
}

function drawAuditFooter(
  page: PDFPage,
  font: PDFFont,
  pageNumber: number,
  totalPages: number,
): void {
  page.drawText("Generated from the IFD Training Portal", {
    x: MARGIN_LEFT,
    y: MARGIN_BOTTOM - 6,
    size: FONT_SIZE_FOOTER,
    font,
    color: rgb(0.35, 0.35, 0.35),
  });
  page.drawText(`Page ${pageNumber} of ${totalPages}`, {
    x: PAGE_WIDTH - MARGIN_RIGHT - font.widthOfTextAtSize(`Page ${pageNumber} of ${totalPages}`, FONT_SIZE_FOOTER),
    y: MARGIN_BOTTOM - 6,
    size: FONT_SIZE_FOOTER,
    font,
    color: rgb(0.35, 0.35, 0.35),
  });
}

function drawAuditHeader(
  page: PDFPage,
  continued: boolean,
  regularFont: PDFFont,
  boldFont: PDFFont,
): number {
  if (continued) {
    page.drawText("Training Request Audit Trail — Continued", {
      x: MARGIN_LEFT,
      y: PAGE_HEIGHT - MARGIN_TOP,
      size: FONT_SIZE_CONTINUED,
      font: boldFont,
      color: rgb(0, 0, 0),
    });
    return PAGE_HEIGHT - MARGIN_TOP - 28;
  }

  page.drawText("ITHACA FIRE DEPARTMENT", {
    x: MARGIN_LEFT,
    y: PAGE_HEIGHT - MARGIN_TOP,
    size: FONT_SIZE_DEPARTMENT,
    font: boldFont,
    color: rgb(0, 0, 0),
  });
  page.drawText("TRAINING REQUEST AUDIT TRAIL", {
    x: MARGIN_LEFT,
    y: PAGE_HEIGHT - MARGIN_TOP - 18,
    size: FONT_SIZE_TITLE,
    font: boldFont,
    color: rgb(0, 0, 0),
  });

  return PAGE_HEIGHT - MARGIN_TOP - 36;
}

export async function createAuditTrailPages(
  pdf: PDFDocument,
  request: TrainingRequestRecord,
  actions: TrainingRequestActionRecord[],
  generatedAt: Date = new Date(),
): Promise<number> {
  const entries = buildAuditTrailEntries(request, actions);
  const regularFont = await pdf.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pages: PDFPage[] = [];
  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  pages.push(page);
  let cursorY = drawAuditHeader(page, false, regularFont, boldFont) + 2;
  const minimumY = MARGIN_BOTTOM + FOOTER_HEIGHT + 12;
  const continuedStartY = PAGE_HEIGHT - MARGIN_TOP - 36;

  function ensure(height: number) {
    if (cursorY - height < minimumY) {
      page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      pages.push(page);
      cursorY = drawAuditHeader(page, true, regularFont, boldFont) - 8;
    }
  }
  function write(value: string, x: number, size: number, lineHeight: number) {
    for (const line of wrapPdfText(value, regularFont, PAGE_WIDTH - MARGIN_RIGHT - x, size)) {
      ensure(lineHeight);
      page.drawText(line, { x, y: cursorY, font: regularFont, size, color: rgb(0, 0, 0) });
      cursorY -= lineHeight;
    }
  }
  const summaryRows = [
    { label: "Request Number:", value: request.requestNumber?.trim() || "Not assigned" },
    { label: "Requester:", value: request.requesterName?.trim() || "" },
    { label: "Badge Number:", value: request.requesterBadgeNumber?.trim() || "" },
    { label: "Course:", value: request.courseName?.trim() || "" },
    { label: "Current Status:", value: TRAINING_REQUEST_STATUS_LABELS[request.status] },
    { label: "Generated:", value: formatAuditGeneratedTimestamp(generatedAt) },
  ];
  for (const row of summaryRows) {
    ensure(SUMMARY_LINE_HEIGHT);
    page.drawText(row.label, { x: MARGIN_LEFT, y: cursorY, font: boldFont, size: FONT_SIZE_SUMMARY_LABEL });
    const x = MARGIN_LEFT + boldFont.widthOfTextAtSize(row.label, FONT_SIZE_SUMMARY_LABEL) + 6;
    write(row.value, x, FONT_SIZE_SUMMARY_VALUE, SUMMARY_LINE_HEIGHT);
  }
  const overflowDates = getOnDutyDatesPdfOverflow(request);
  if ((request.onDutyDates ?? []).length > 0) {
    ensure(SUMMARY_LINE_HEIGHT * 2);
    page.drawText(overflowDates.length ? "Additional On-Duty Dates:" : "On-Duty Dates:", {
      x: MARGIN_LEFT, y: cursorY, font: boldFont, size: FONT_SIZE_SUMMARY_LABEL,
    });
    cursorY -= SUMMARY_LINE_HEIGHT;
    write(overflowDates.length ? overflowDates.join(", ") : formatOnDutyDatesForDisplay(request.onDutyDates), MARGIN_LEFT, FONT_SIZE_SUMMARY_VALUE, SUMMARY_LINE_HEIGHT);
  }
  ensure(24);
  page.drawLine({ start: { x: MARGIN_LEFT, y: cursorY - 4 }, end: { x: PAGE_WIDTH - MARGIN_RIGHT, y: cursorY - 4 }, thickness: 0.75, color: rgb(0.65, 0.65, 0.65) });
  cursorY -= 22;

  for (const entry of entries) {
    const comment = entry.commentText && entry.commentLabel ? `${entry.commentLabel}: ${entry.commentText}` : "";
    const height = wrapPdfText(entry.eventLine, regularFont, PAGE_WIDTH - MARGIN_RIGHT - EVENT_TEXT_X, FONT_SIZE_EVENT).length * EVENT_LINE_HEIGHT
      + (comment ? wrapPdfText(comment, regularFont, COMMENT_WRAP_WIDTH, FONT_SIZE_COMMENT).length * COMMENT_LINE_HEIGHT + 2 : 0)
      + EVENT_BLOCK_SPACING;
    // Keep ordinary entries together; an entry taller than a page may continue.
    if (height <= continuedStartY - minimumY) ensure(height);
    else ensure(EVENT_LINE_HEIGHT);
    page.drawCircle({ x: TIMELINE_X, y: cursorY - 3, size: 2, color: rgb(0.25, 0.25, 0.25) });
    write(entry.eventLine, EVENT_TEXT_X, FONT_SIZE_EVENT, EVENT_LINE_HEIGHT);
    if (comment) {
      cursorY -= 2;
      write(comment, COMMENT_INDENT_X, FONT_SIZE_COMMENT, COMMENT_LINE_HEIGHT);
    }
    cursorY -= EVENT_BLOCK_SPACING;
  }
  pages.forEach((auditPage, index) => drawAuditFooter(auditPage, regularFont, index + 1, pages.length));
  return pages.length;
}

export function serializeAuditTrailForInspection(entries: AuditTrailEntry[]): string {
  return entries
    .map((entry) => {
      const lines = [entry.eventLine];
      if (entry.commentText && entry.commentLabel) {
        lines.push(`${entry.commentLabel}: ${entry.commentText}`);
      }
      return lines.join("\n");
    })
    .join("\n");
}
