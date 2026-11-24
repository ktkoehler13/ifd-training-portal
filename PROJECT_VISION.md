# IFD Training Portal — project vision

## Purpose and authority

Help Ithaca Fire Department personnel request training, obtain accountable approvals, receive the correct official forms, and complete the related City authorization and post-training compensation work in one portal.

The earliest recoverable specification in the referenced “Fillable PDF with Signatures” conversation concerns improving the generated Training Request while preserving official content. An existing portal already provided personnel, requests and approvals. Later explicit user requests extended the product to Academy registration, signatures, email, recovery, Office processing and compensation. A complete original pre-portal specification was not available; do not invent one.

This document preserves confirmed user intent. **Confirmed** below means explicitly requested or selected by the user in the available history. **Implementation choice** means current behavior inferred from code or recorded implementation, not a separately confirmed requirement. Later explicit choices supersede earlier ones. See [DECISIONS.md](DECISIONS.md) for that evolution and [PROJECT_STATUS.md](PROJECT_STATUS.md) for verification and gaps.

## Intended users and use cases

- **Requester:** IFD personnel requesting training, updating returned requests, obtaining approved forms, providing a signature, and submitting actual hours, mileage, voucher details and receipts.
- **MTO:** reviews training and estimates, signs decisions, reviews/signs compensation, and performs administrative work.
- **Deputy Chief (DC):** final training approval; a designated DC receives routine approval emails while other DCs can act as backups.
- **Office:** completes City authorization after DC approval and compensation coding/submission after MTO signature. Office also has the same administrative access as Admin (user request, Nov 24).
- **Admin:** personnel/settings administration and backup Office processing. An administrative role does not automatically grant MTO/DC training-signing authority.

Rank and application role are separate concepts. Exact implemented access, including exceptions, is in [README.md](README.md#roles-and-access).

## Confirmed requirements

### V1 — Training requests and review

- Keep the request journey clear and usable: each wizard page starts at the top; the accuracy certification is visible before submitting; users do not need to submit once just to reveal it.
- Prefill known requester information. Name and badge remain tied to the signed-in person; contact information, including the email for that request, may be changed.
- Offer **NYS Fire Academy**, **SPTC**, or **Other** for location; Other opens a free-text field.
- MTO may revise estimated expenses during MTO review, and the Deputy Chief during DC review. Require a reason and preserve original/revised values and actor history. *(Broadened by the user on November 22 from the original MTO-review-only rule; see D27.)*
- Before the course start date, MTO or Deputy Chief may change a final decision (Approved ↔ Denied) or edit an approved request's expenses, with a reason and their signature. Signed records are never altered; each change is a new signed action, and the requester receives the usual approval/denial email.
- Show a red badge on action controls and bold entries requiring action in administrative review.
- Permit recoverable request deletion and restoration for **any administrative role, including MTO**. Preserve signatures/history. The earlier Admin-only choice was explicitly broadened.
- Retain approved-training visibility and existing request history; do not break established working features.

### V2 — Training Request PDF and official content

- Generate the form from portal data, preserving the existing IFD header.
- Order: existing header → cleaned-up General Information → Estimated Expenses → existing approvals → original Travel Authorization at the bottom.
- Expenses are one vertical list with right-aligned amounts and a bold total: Registration Fee, Mileage Reimbursement, Lodging, Airfare, Rental Vehicle, Food/Meals, Other Expense, Total. Keep zero-value rows.
- Positive Other Expenses require a description on new submissions; show “Other – [description]”. Historical records without one must still generate.
- Historical training PDFs use the rate stored on the request, not the current global mileage setting.
- Missing optional fields must not prevent generation. Long text must wrap or continue safely without overlaps or illegible shrinking.
- Preserve immutable approval identity/signature snapshots; replacing a profile signature must not change earlier approvals.
- Preserve actual source Travel Authorization artwork and wording. Inspected contents are “City of Ithaca Travel Authorization”, “FOR OFFICE USE ONLY:”, “Account #:”, “Approval”, “Fire Chief:” and “City Controller:”, with their lines/borders. No additional certification text was found in that block; do not invent any.
- TAL remains a separate **second form**, not necessarily physical page 2 when the Training Request continues. The original “do not redesign TAL yet” restriction was later amended only for the explicitly requested student information/signature/date filling below.

### V3 — State courses, Academy registration and signatures

- For state-run courses, collect address, phone and New York Training ID. Current scope interprets state-run as the OFPC course selection; a broader provider classification has not been specified.
- Offer an opt-in **Save this address to my profile** checkbox during request entry. Saved addresses can be edited in My Profile and prefill future requests without changing existing records.
- Show a fixed NY prefix and accept numeric training-ID input. Short input is left-padded: 1336 becomes NY0001336; Academy digits align individually in its printed cells.
- Fill TAL requester last/first name and printed student name, then the requester's saved, explicitly authorized signature. **Use the final approval date beside that signature**, as selected by the user; retain the actual signing date in history.
- Add the Fire Academy Registration form for Academy requests. Prefill known information. Center training-ID and last-four-SSN digits in the correct individual boxes.
- Collect and print **only the last four SSN digits** for Academy requests. This later choice supersedes the initial decision to leave them blank.
- Ignore Academy payment information fields; the requester does not need to handle them. Date of birth remains outside portal entry.
- Prefill Academy registration at $25 and commuter meals at $8/day, allowing adjustments. The user chose commuter, not the proposed $40/day resident option. These are configured defaults, not a guarantee of current external fees.
- Signature setup should support drawing, PNG upload and typed creation within submission/approval workflows. **Sign and Save Signature** (originally "Add Signature") saves to the profile for reuse and closes the setup window, making the next step clear; a failed save stays open. Saving a signature does not itself approve or submit a request.
- Keep the supplied IFD crest on website headers.

### V4 — Approval communications and account access

- Provide email alerts when a training request requires action and when the requester receives a decision.
- Designate the routine DC email recipient; other DCs can still approve as backups without routine DC approval emails.
- After signed final DC approval, send the requester the approved forms. Denials must not receive approved-form attachments.
- Approval email instructions cover course registration, arranging time off, recording actual class contact hours, retaining itemized **meal** receipts, and recording mileage. State the user-provided policy that the City reimburses tips up to **18%**; do not substitute a different policy.
- Keep approval notification independent of Office's subsequent City Authorization upload. DC approval starts both paths; email waits for approved forms to be ready, not Office completion.
- Use ifdtraining.org for the website and the authorized sending domain. Maintain working badge/password access, self-service recovery and synchronized personnel/Auth email changes.

### V5 — Compensation

- Allow a requester to complete a compensation packet after training, from the request details or a separate compensation area.
- Use the supplied Training Compensation Package 2026 artwork. Provide dated time rows with start/end and a second start/end pair to exclude lunch; **Add a row** supports additional days.
- Provide dated mileage rows, voucher entry, receipt attachments, EMT Yes/No and Time/Pay choices.
- On **Submit to MTO**, put the requester's employee signature on mileage and general fund voucher; use the requester submission date on the voucher. Leave the voucher Total and certified-amount boxes blank (Nov 24).
- Use the current mileage rate entered by an appropriate administrator for compensation; preserve signed historical versions.
- MTO reviews, returns corrections or signs before the packet advances to Office. MTO may be both requester and MTO and sign in both capacities.
- Office selects compensation codes. The Training Assignment Compensation Form's Compensation Approved By name and Date lines stay blank (Nov 24). Admin, MTO and DC retain backup completion access.
- After MTO signs, **only Office** receives the Office action alert. Backups retain access without that alert.
- Office can **Mark as Submitted** after processing; that clears its action alert.

### V6 — City Authorization

- A new signed DC approval also creates an Office City Authorization task.
- Provide **Upload City Authorization** on the approved request and keep the uploaded document with it.
- A successful upload completes the Office step and clears the action alert.
- Start the queue with **new approvals only**, not existing approvals.
- **Confirmed, Nov 21:** allow removing a wrong document. This covers the file picked before upload and an already-uploaded file. A removed file is hidden from the request and downloads but kept, with who removed it and when, for the audit trail. If no file remains, the request returns to Awaiting Office and Office's action alert returns.

### V7 — Approval routing (confirmed Nov 21)

- System Settings has an **Approval routing** section. Next to the existing primary DC, administrators choose a **primary MTO**, a **primary Office** person and the **Fire Chief**. The model is one primary person per role, not a general rules editor.
- **Primary MTO**, same model as the DC: only that MTO gets MTO review emails. Other MTOs keep reviewing and signing as backups. Until one is chosen, all active MTOs get the emails.
- **Primary Office:** gets the Office action badge **and** new Office emails for City Authorization tasks and MTO-signed compensation packets. Other Office users can still process tasks quietly. Until one is chosen, all Office users get the badge and emails.
- **Fire Chief:** recorded only, for later use. No alerts or approval steps.

## Desired experience and nonfunctional constraints

The product should feel like a straightforward department tool, with familiar terms, clear next actions, sensible prefilling, a visible completion result and readable official documents. Avoid development notes and implementation terminology in normal user flows. Preserve mobile usability and existing branding.

User-confirmed constraints include historical compatibility, saved signature integrity, safe long text, required validation, no unrelated changes, meaningful tests, and reviewing changes/migrations before publishing. The user prefers action over repeated permission questions; a specific publishing approval need not be requested again for the same reviewed release.

Existing architectural safeguards are part of the baseline to preserve: authenticated access, server-derived identity, database row security, private file storage, signed snapshots, restricted mutations, stale-version protection and recoverable request deletion. No numeric uptime, performance, retention, accessibility certification, legal-signature compliance standard or payroll integration target has been specified. Do not present those as settled requirements.

## Implementation choices and limits, not additional promises

- Approved PDFs are flattened, noninteractive snapshots; editing occurs in the portal. The historical conversation title alone does not establish a requirement for editable downloaded PDFs.
- Compensation is one packet per approved request, available when its end date has arrived in America/New_York and the requester certifies completion. Standalone packets for unapproved training are not implemented.
- UI says **EMT Travel Time?**, while the initial user wording was “EMT time”; confirm any intended broader distinction before changing it.
- Fire Chief is recorded in System Settings only; it drives no alert or approval step.
- City uploads accept PDF/PNG/JPEG up to 4 MB and retain prior revisions. Requesters download their own files; administrative backups can upload. These limits/access details are implementation choices.
- The City process itself remains external; uploaded authorization is the completion evidence. No automated City approval or payroll transmission is promised.
- Office-use Travel Authorization account/Chief/Controller lines remain blank in the generated training form; no portal data entry for those fields was requested.

## Remaining vision gaps and completion standard

Confirmed major workflows are implemented. Beta readiness still requires the operational assignments and real-user acceptance in [PROJECT_STATUS.md](PROJECT_STATUS.md); implementation is not the same as a successful live end-to-end test. Help & Instructions remains a placeholder. Backup-DC portal alert behavior needs clarification if expected.

A successfully completed product lets authorized personnel finish the full request → MTO → DC → approved forms/notification journey, Office City processing, and post-training compensation → MTO signature → Office submission without losing work or history. It must preserve official artwork and prior signed records, enforce role/ownership boundaries, handle corrections and failures clearly, and pass documented automated checks plus authorized beta acceptance. Final beta sign-off and any expansion of this vision belong to the user.
