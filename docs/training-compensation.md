# Training compensation packets

A requester can open **Complete Compensation Packet** on an approved training request once the training end date has arrived (America/New_York), or use **Compensation Packets** on the dashboard. One packet belongs to one approved request. The requester explicitly confirms that the training is complete before signing.

The packet records actual daily time in two sessions, excluding the lunch interval; EMT travel Yes/No; compensation Time/Pay; instructor name/title; dated mileage destinations and distances; city voucher lines; and receipt attachments. Name, badge, course and request identifier are captured when the draft is created. Compensation mileage uses the current rate maintained in **System Settings** by an Admin, MTO or Deputy Chief; it does not reuse the training request’s earlier estimated-expense rate. Drafts and returned packets display the current setting. Signing checks that the displayed rate is still current and preserves that rate in the submission. If the rate changes while the form is open, totals update and the requester must confirm their signature again; their entered data remains in place. The mailing address starts from the saved profile address, falling back to the training request, and can be edited for this packet.

Workflow:

1. Requester saves a draft, attaches receipts, confirms the certification and signs **Submit to MTO**. The requester’s signature appears on the mileage Employee Signature line and the general fund voucher. The voucher date is the requester’s submission date in America/New_York; later MTO and office actions do not change it.
2. An active MTO reviews the frozen submission, then either returns it with a correction reason or signs **Sign & Send to Office**. The MTO signature appears on the compensation and mileage forms.
3. An Office user selects the applicable time/pay compensation codes and clicks **Mark as Submitted** once office processing is done. The displayed status becomes **Submitted**, the Office action alert clears, and the actor/date remain recorded in history. This step cannot precede the MTO signature. The office actor and date appear on page 2. Admin, MTO and Deputy Chief users retain backup access through **All Packets** to complete this step, but do not receive Office-stage action alerts or bold action rows. Only Office receives the handoff alert after the MTO signs.

An MTO may be the requester and then perform the separate MTO review/signature step on their own packet. Both signatures are captured independently. **Office** is a separate Application Role assigned under User Management → Add/Edit User → Application Role. Its compensation view opens on **Requiring My Action**, with a red badge and bold requests needing office coding. Office can view packets, receipts and signed history after MTO signature, and submitted packets afterward. Other requesters’ drafts and packets still awaiting MTO are not visible. Office does not grant training-approval, user-management, request-deletion or System Settings permissions. Office users retain ordinary requester access to their own training and signatures.

A returned packet can be corrected and signed again, using the current mileage setting for the new submission while preserving the prior signed rate. Every requester-submitted, returned, MTO-approved and office-submitted version is recorded in immutable history. Signature PNGs, packet PDFs and receipt objects are private; each download checks the active user's access and the recorded file hash. Removing a receipt from a returned draft preserves objects referenced by prior submissions. Concurrent/stale mutations cannot overwrite newer versions. Deleted training requests hide their compensation packet and block further actions.

The supplied **Training Compensation Package 2026.pdf** is the source artwork. The source remains unchanged in `lib/pdf/templates/training-compensation-2026.pdf`. Portal-generated PDFs are fixed snapshots; editable drafts are maintained in the portal. Source PDF calculation JavaScript and duplicate field identities are not used. Time sheets support 16 entries, mileage sheets 17, and further entries continue on extra copies of the appropriate form. Combined mileage reimbursement appears once, on the first mileage sheet, to avoid rounding differences or duplicate claims. Long text wraps or continues on labeled details pages. The voucher page has an offset media box and its placements account for that origin.

Receipt limits: PDF, PNG or JPEG; 4 MB per file and 20 files per packet. Receipts download separately from the four-form PDF. Each data section supports up to 100 rows. Time entries are same-day; sessions crossing midnight use separate dated rows. The one-month submission reminder comes from the supplied form; late submissions are not blocked. Office-only voucher accounting, audit and payment fields remain blank. The requested 18% meal-tip policy is displayed as guidance; the portal does not infer eligible charges from receipts.

Review queues and dashboard badges provide action notices in the portal. Office-stage alerts are separate from backup processing permissions: only the Office role gets an action alert after MTO signature, and no role gets an outstanding Office alert after the final submission. This feature does not add compensation email delivery or payroll integration. Existing training request approval emails, Training Request PDFs, Travel Authorization, TAL and Academy forms are unchanged.

## Database and deployment

The initial migration was installed November 16, 2026; the mileage and Office-role refinements below were installed November 19 with production commit `ccc7e5a`. See [PROJECT_STATUS.md](../PROJECT_STATUS.md) for current verification and outstanding acceptance. Apply only missing migrations when preparing another environment.

Apply **20261116160000_training_compensation_packets.sql** before publishing the website. It creates:

- `training_compensation_packets` and immutable `training_compensation_events`.
- The private `training-compensation` storage bucket.
- Restricted read policies and the service-only, version-checked `save_training_compensation` workflow function.

No changes to existing request rows or approval signatures are required. No new environment variables are needed; authenticated server routes use the existing Supabase service credential. The migration has been exercised with the full migration chain in isolated PGlite tests. It was installed on the live database on November 16, 2026. Verification confirmed both tables have row-level security, receipt storage is private, direct client writes and workflow calls are blocked, the server workflow is enabled, and immutable history is active.

**Mileage refinement:** apply `20261119160000_compensation_current_mileage_rate.sql` before publishing the corresponding website update. It replaces the service-only workflow function to lock and verify the configured mileage rate when committing a submission. It creates no tables or columns and does not rewrite existing packets, signatures or history. The rate must be configured in System Settings; no historical or environment fallback is used for new compensation submissions.

The final Office state retains the stored key `completed` and history action `office_completed` for compatibility with existing records, while displaying **Submitted** / **Marked as Submitted** in the portal. This wording and alert-routing refinement requires no additional migration.

**Office role:** then apply `20261119170000_office_application_role.sql`. It adds the allowed role, preserves ordinary requester/signature capabilities for Office users, limits Office compensation reads to MTO-signed or completed packets, and permits office coding with the existing administrative roles as backups. It assigns no accounts automatically. The packet read policy checks the actual request and packet through a narrow helper so Office does not depend on broader training request access. The subsequent City Authorization migration separately permits Office to read approved requests for City processing. Existing administrative permissions are unchanged.

After publication, verify the entry link on an eligible request, the dashboard card, requester draft access, MTO review and office completion with an explicitly designated test request. Do not approve real claims as a deployment test. Feature rollback can revert the website commit while retaining the private compensation tables and immutable records.

## Validation

Automated coverage includes time/lunch and mileage totals, input validation, role/privacy checks, stale versions, required signatures, MTO-to-office order, returned corrections, original receipt retention, immutable events, denied/deleted/future requests, private downloads and hash checks, signature/PDF capture, ambiguous completion handling and PDF continuation/long-text behavior.

The browser preview uses the real React components with isolated sample data and fake API responses. It verifies adding rows, exclusive checkboxes, draft saving, receipts, requester submission, missing MTO signatures, correction returns, signed advancement, office code completion and the action queue. No live request or signature was changed during testing.
