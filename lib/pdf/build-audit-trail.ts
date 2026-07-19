import {
  PDFDocument,
  rgb,
  StandardFonts,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
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

function wrapText(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return [];
  }

  const lines: string[] = [];
  let currentLine = words[0]!;

  for (const word of words.slice(1)) {
    const candidate = `${currentLine} ${word}`;
    if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
      currentLine = candidate;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }

  lines.push(currentLine);
  return lines;
}

function drawWrappedText(
  page: PDFPage,
  font: PDFFont,
  text: string,
  x: number,
  y: number,
  fontSize: number,
  maxWidth: number,
  lineHeight: number,
): number {
  const lines = wrapText(text, font, fontSize, maxWidth);
  let cursorY = y;

  for (const line of lines) {
    page.drawText(line, {
      x,
      y: cursorY,
      size: fontSize,
      font,
      color: rgb(0, 0, 0),
    });
    cursorY -= lineHeight;
  }

  return cursorY;
}

function estimateEntryHeight(
  entry: AuditTrailEntry,
  regularFont: PDFFont,
  commentFont: PDFFont,
): number {
  let height = EVENT_LINE_HEIGHT + EVENT_BLOCK_SPACING;

  if (entry.commentText && entry.commentLabel) {
    const wrapped = wrapText(
      `${entry.commentLabel}: ${entry.commentText}`,
      commentFont,
      FONT_SIZE_COMMENT,
      COMMENT_WRAP_WIDTH,
    );
    height += wrapped.length * COMMENT_LINE_HEIGHT + 4;
  }

  return height;
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

function drawSummaryBlock(
  page: PDFPage,
  request: TrainingRequestRecord,
  generatedAt: Date,
  regularFont: PDFFont,
  boldFont: PDFFont,
): number {
  let cursorY = PAGE_HEIGHT - MARGIN_TOP - 34;

  const summaryRows: Array<{ label: string; value: string }> = [
    {
      label: "Request Number:",
      value: request.requestNumber?.trim() || "Not assigned",
    },
    { label: "Requester:", value: request.requesterName?.trim() || "" },
    { label: "Badge Number:", value: request.requesterBadgeNumber?.trim() || "" },
    { label: "Course:", value: request.courseName?.trim() || "" },
    {
      label: "Current Status:",
      value: TRAINING_REQUEST_STATUS_LABELS[request.status],
    },
    {
      label: "Generated:",
      value: formatAuditGeneratedTimestamp(generatedAt),
    },
  ];

  for (const row of summaryRows) {
    page.drawText(row.label, {
      x: MARGIN_LEFT,
      y: cursorY,
      size: FONT_SIZE_SUMMARY_LABEL,
      font: boldFont,
      color: rgb(0, 0, 0),
    });

    if (row.value) {
      const labelWidth = boldFont.widthOfTextAtSize(row.label, FONT_SIZE_SUMMARY_LABEL);
      page.drawText(row.value, {
        x: MARGIN_LEFT + labelWidth + 6,
        y: cursorY,
        size: FONT_SIZE_SUMMARY_VALUE,
        font: regularFont,
        color: rgb(0, 0, 0),
      });
    }

    cursorY -= SUMMARY_LINE_HEIGHT;
  }

  const overflowDates = getOnDutyDatesPdfOverflow(request);
  if (overflowDates.length > 0) {
    page.drawText("Additional On-Duty Dates:", {
      x: MARGIN_LEFT,
      y: cursorY,
      size: FONT_SIZE_SUMMARY_LABEL,
      font: boldFont,
      color: rgb(0, 0, 0),
    });
    cursorY -= SUMMARY_LINE_HEIGHT;
    page.drawText(overflowDates.join(", "), {
      x: MARGIN_LEFT,
      y: cursorY,
      size: FONT_SIZE_SUMMARY_VALUE,
      font: regularFont,
      color: rgb(0, 0, 0),
      maxWidth: CONTENT_WIDTH,
    });
    cursorY -= SUMMARY_LINE_HEIGHT;
  } else if (request.onDutyDates.length > 0) {
    page.drawText("On-Duty Dates:", {
      x: MARGIN_LEFT,
      y: cursorY,
      size: FONT_SIZE_SUMMARY_LABEL,
      font: boldFont,
      color: rgb(0, 0, 0),
    });
    cursorY -= SUMMARY_LINE_HEIGHT;
    page.drawText(formatOnDutyDatesForDisplay(request.onDutyDates), {
      x: MARGIN_LEFT,
      y: cursorY,
      size: FONT_SIZE_SUMMARY_VALUE,
      font: regularFont,
      color: rgb(0, 0, 0),
      maxWidth: CONTENT_WIDTH,
    });
    cursorY -= SUMMARY_LINE_HEIGHT;
  }

  const dividerY = cursorY - 4;
  page.drawLine({
    start: { x: MARGIN_LEFT, y: dividerY },
    end: { x: PAGE_WIDTH - MARGIN_RIGHT, y: dividerY },
    thickness: 0.75,
    color: rgb(0.65, 0.65, 0.65),
  });

  return dividerY - 18;
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

function drawAuditEntry(
  page: PDFPage,
  entry: AuditTrailEntry,
  cursorY: number,
  regularFont: PDFFont,
  commentFont: PDFFont,
): number {
  page.drawCircle({
    x: TIMELINE_X,
    y: cursorY - 3,
    size: 2,
    color: rgb(0.25, 0.25, 0.25),
  });

  page.drawText(entry.eventLine, {
    x: EVENT_TEXT_X,
    y: cursorY,
    size: FONT_SIZE_EVENT,
    font: regularFont,
    color: rgb(0, 0, 0),
  });

  let nextY = cursorY - EVENT_LINE_HEIGHT;

  if (entry.commentText && entry.commentLabel) {
    nextY = drawWrappedText(
      page,
      commentFont,
      `${entry.commentLabel}: ${entry.commentText}`,
      COMMENT_INDENT_X,
      nextY - 2,
      FONT_SIZE_COMMENT,
      COMMENT_WRAP_WIDTH,
      COMMENT_LINE_HEIGHT,
    );
  }

  return nextY - EVENT_BLOCK_SPACING;
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

  const minimumY = MARGIN_BOTTOM + FOOTER_HEIGHT + 12;
  const firstPageStartY = PAGE_HEIGHT - MARGIN_TOP - 150;
  const continuedPageStartY = PAGE_HEIGHT - MARGIN_TOP - 28;

  const pageLayouts: AuditTrailEntry[][] = [[]];
  let currentPageIndex = 0;
  let cursorY =
    pageLayouts[0]!.length === 0 && currentPageIndex === 0
      ? firstPageStartY
      : continuedPageStartY;

  for (const entry of entries) {
    const entryHeight = estimateEntryHeight(entry, regularFont, regularFont);

    if (pageLayouts[currentPageIndex]!.length > 0 && cursorY - entryHeight < minimumY) {
      currentPageIndex += 1;
      pageLayouts[currentPageIndex] = [];
      cursorY = continuedPageStartY;
    }

    pageLayouts[currentPageIndex]!.push(entry);
    cursorY -= entryHeight;
  }

  const totalPages = Math.max(pageLayouts.length, 1);

  if (entries.length === 0) {
    pageLayouts[0] = [];
  }

  for (let pageIndex = 0; pageIndex < totalPages; pageIndex += 1) {
    const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    const pageEntries = pageLayouts[pageIndex] ?? [];
    const isContinued = pageIndex > 0;

    let cursorY = drawAuditHeader(page, isContinued, regularFont, boldFont);

    if (pageIndex === 0) {
      cursorY = drawSummaryBlock(page, request, generatedAt, regularFont, boldFont);
    } else {
      cursorY -= 8;
    }

    for (const entry of pageEntries) {
      cursorY = drawAuditEntry(page, entry, cursorY, regularFont, regularFont);
    }

    drawAuditFooter(page, regularFont, pageIndex + 1, totalPages);
  }

  return totalPages;
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
