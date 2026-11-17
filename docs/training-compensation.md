# Training compensation packets

A requester can open **Complete Compensation Packet** on an approved training request once the training end date has arrived (America/New_York), or use **Compensation Packets** on the dashboard. One packet belongs to one approved request. The requester explicitly confirms that the training is complete before signing.

The packet records actual daily time in two sessions, excluding the lunch interval; EMT travel Yes/No; compensation Time/Pay; instructor name/title; dated mileage destinations and distances; city voucher lines; and receipt attachments. Name, badge, course, request identifier and the stored request mileage rate are captured when the draft is created. The mailing address starts from the saved profile address, falling back to the training request, and can be edited for this packet.

Workflow:

1. Requester saves a draft, attaches receipts, confirms the certification and signs **Submit to MTO**.
2. An active MTO reviews the frozen submission, then either returns it with a correction reason or signs **Sign & Send to Office**. The MTO signature appears on the compensation and mileage forms.
3. A user with administrative privileges (Admin, MTO or Deputy Chief) selects the office compensation codes and completes office processing. This step cannot precede the MTO signature. The office actor and date appear on page 2.

A returned packet can be corrected and signed again. Every submitted, returned, MTO-approved and office-completed version is recorded in immutable history. Signature PNGs, packet PDFs and receipt objects are private; each download checks the active user's access and the recorded file hash. Removing a receipt from a returned draft preserves objects referenced by prior submissions. Concurrent/stale mutations cannot overwrite newer versions. Deleted training requests hide their compensation packet and block further actions.

The supplied **Training Compensation Package 2026.pdf** is the source artwork. The source remains unchanged in `lib/pdf/templates/training-compensation-2026.pdf`. Portal-generated PDFs are fixed snapshots; editable drafts are maintained in the portal. Source PDF calculation JavaScript and duplicate field identities are not used. Time sheets support 16 entries, mileage sheets 17, and further entries continue on extra copies of the appropriate form. Combined mileage reimbursement appears once, on the first mileage sheet, to avoid rounding differences or duplicate claims. Long text wraps or continues on labeled details pages. The voucher page has an offset media box and its placements account for that origin.

Receipt limits: PDF, PNG or JPEG; 4 MB per file and 20 files per packet. Receipts download separately from the four-form PDF. Each data section supports up to 100 rows. Time entries are same-day; sessions crossing midnight use separate dated rows. The one-month submission reminder comes from the supplied form; late submissions are not blocked. Office-only voucher accounting, audit and payment fields remain blank. The requested 18% meal-tip policy is displayed as guidance; the portal does not infer eligible charges from receipts.

Review queues and dashboard badges provide action notices in the portal. This feature does not add compensation email delivery or payroll integration. Existing training request approval emails, Training Request PDFs, Travel Authorization, TAL and Academy forms are unchanged.

## Database and deployment

Apply **20261116160000_training_compensation_packets.sql** before publishing the website. It creates:

- `training_compensation_packets` and immutable `training_compensation_events`.
- The private `training-compensation` storage bucket.
- Restricted read policies and the service-only, version-checked `save_training_compensation` workflow function.

No changes to existing request rows or approval signatures are required. No new environment variables are needed; authenticated server routes use the existing Supabase service credential. The migration has been exercised with the full migration chain in isolated PGlite tests. It was installed on the live database on November 16, 2026. Verification confirmed both tables have row-level security, receipt storage is private, direct client writes and workflow calls are blocked, the server workflow is enabled, and immutable history is active.

After publication, verify the entry link on an eligible request, the dashboard card, requester draft access, MTO review and office completion with an explicitly designated test request. Do not approve real claims as a deployment test. Feature rollback can revert the website commit while retaining the private compensation tables and immutable records.

## Validation

Automated coverage includes time/lunch and mileage totals, input validation, role/privacy checks, stale versions, required signatures, MTO-to-office order, returned corrections, original receipt retention, immutable events, denied/deleted/future requests, private downloads and hash checks, signature/PDF capture, ambiguous completion handling and PDF continuation/long-text behavior.

The browser preview uses the real React components with isolated sample data and fake API responses. It verifies adding rows, exclusive checkboxes, draft saving, receipts, requester submission, missing MTO signatures, correction returns, signed advancement, office code completion and the action queue. No live request or signature was changed during testing.
