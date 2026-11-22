# Project status

Updated **November 21, 2026**. Read [PROJECT_VISION.md](PROJECT_VISION.md) for user intent and [DECISIONS.md](DECISIONS.md) before changing behavior.

## Checkpoint

- Last functional production release: approval routing, ktkoehler13/ifd-training-portal#4 (see below), November 21. Previous releases: `f3e4db6` (City Authorization removal, PR #2) and `ccc7e5a` (November 19).
- Canonical site: https://ifdtraining.org. Production Supabase project: `dnvowshtloojgnerxydx` (misleading dashboard name: `ifd-training-portal-dev`).
- Handoff commit **06fe67954e4c40513009190acc31d69b0127d0a8**, **docs: create self-contained agent handoff**, was created from a clean `main` worktree. The user subsequently authorized pushing the handoff on November 21. This publication-status follow-up changes documentation only; no application migration or functional update accompanies it. Check the current remote SHA and Vercel status for publication evidence.
- Production database changes, all installed and verified:
  1. November 19: `20261119160000_compensation_current_mileage_rate.sql`
  2. November 19: `20261119170000_office_application_role.sql`
  3. November 19: `20261119180000_city_authorizations.sql`
  4. November 21, with the user's approval: `20261121120000_city_authorization_file_removal.sql`
  5. November 21, with the user's approval: `20261121180000_approval_routing_settings.sql`
  6. November 22, with the user's approval: `20261122120000_decision_changes_and_expense_edits.sql`
  7. November 22, with the user's approval: `20261122180000_no_email_for_expense_resign.sql` (history name `no_email_for_expense_resign`). Verified: the completion function skips the requester email for approved-expense re-signatures, stays security definer and service-role only (not `authenticated`/`anon`); notifications (35), actions (34) and requests (15) unchanged. Decision changes still email. Website change (ktkoehler13/ifd-training-portal#11) is signing-dialog wording only.
- **Decision changes and later expense edits released November 22** (ktkoehler13/ifd-training-portal#9, merge commit `fa5f821`, D27). Migration `20261122120000_decision_changes_and_expense_edits.sql` was applied first via Supabase MCP (history name `decision_changes_and_expense_edits`) and verified: new constraint/columns present, completion stays service-only, reserve/DC-edit callable by `authenticated` only (not `anon`), no existing rows altered. Vercel production deploy reported success; a signed-out POST of the new action returned 403 (new route), with no data change. No email worker change.
  - MTO/DC can switch Approved ↔ Denied, and edit expenses on an approved request with a re-signature, until the course start date. DC can edit expenses during DC review.
  - Checks run November 22: `npm test` 742 passed (adds `lib/decision-changes.test.ts` and PGlite `lib/decision-changes-db.test.ts`); `tsc`, lint and production build passed. A synthetic approved packet's audit page was rendered (pdf-lib + macOS `sips`) and showed the new entries without overlap. Not yet exercised with a real decision change; do not test on a real request.
- **Shorter password rule released November 22** (ktkoehler13/ifd-training-portal#7, merge commit `d1afe5f`; Vercel production deploy reported success and the live site's scripts contain the new 8-character message). Website only: no migration or worker change. Permanent passwords need 8+ characters with uppercase, lowercase and a special character; a number is no longer required (D26). Checks run November 22: `npm test` 726 passed, `tsc` and lint on changed areas passed.
- **Navigation and dashboard refresh released November 21** (ktkoehler13/ifd-training-portal#5, merge commit `f0a9547`; Vercel production deploy reported success, site returned HTTP 200). Website only: no migration or worker change.
  - Every signed-in page gets a shared top bar inside `AuthGate`: crest, role-based sections, Admin menu, and an account menu with profile, signature, password and sign out. Page headers became a simple `PageHeader`.
  - The dashboard has a greeting, a "needs your attention" row, icon action cards and recent requests with colored status badges.
  - Checks run November 21: `npm test` gave 726 passed. `tsc`, lint and build passed. The user chose to skip the signed-in visual review before release; signed-in pages (top bar, menus, dashboard) have not yet been visually checked on production.
- **Approval routing released November 21** (ktkoehler13/ifd-training-portal#4), in this order:
  1. Migration `20261121180000_approval_routing_settings.sql` applied to production. Supabase history records it as `20261121181047 approval_routing_settings`.
  2. Email worker deployed as version 12 (bundled with esbuild, JWT verification kept on). Before replacing it, live version 11 was compared to the `main` source and matched. The worker logs showed a clean boot and 200 responses on its every-minute runs.
  3. Website merged.
  - **The order matters:** the migration must go first. The new worker treats a missing `primary_approval_mto` setting as an error and retries, so deploying it first would stall MTO review emails.
  - Verified after the migration: the four routing settings exist and are empty; the new event types, one-source check and compensation source column exist; the City and compensation Office triggers and the personnel protection trigger are enabled; `set_approval_routing` is executable by `authenticated` only (not `anon`); `enqueue_office_notifications` isn't callable by clients; the email queue was unchanged (16 sent, 19 skipped). Production had 1 MTO, 2 DCs, no Office users and nobody ranked Fire Chief, so no new emails result until those are assigned.
  - Checks run November 21: `npm test` gave 718 passed, 0 failed. Worker typecheck, `tsc`, lint and build passed.
  - Not done: browser check of the settings section; a live Office email.
- **City Authorization removal release details:** the migration was applied before the website merge. Supabase history records it as version `20261121165918 city_authorization_file_removal`, the only row in that history, so earlier manual installs still need reconciling before any CLI push. Verified after applying: the three removal columns exist; the old pending-state check was replaced; the file-read policy hides removed rows; the removal function is security definer and executable by `service_role` only, not `authenticated` or `anon`; the immutability trigger is enabled; existing data was unchanged (1 pending task, 0 files). Checks run November 21: all City Authorization tests passed (22), and the full `npm test` run gave 695 passed, 1 failed. The failure was the pre-existing README redirect-URL check, fixed in the follow-up docs PR. Lint, `tsc` and `npm run build` passed. **Not yet done:** a live removal. The panel wasn't checked in a browser, and production had no uploaded files to remove at release time.

## Implemented baseline and vision comparison

| Vision | Code / entry points | Evidence and remaining limits |
| --- | --- | --- |
| V1 requests and review | `components/requests/TrainingRequestWizard.tsx`, `lib/training-requests.ts`, `lib/training-request-workflow-server.ts`, `lib/mto-expense-review*` | Drafts, numbering, MTO/DC review, returns/denials, contact edits, location selection, scroll-to-top and visible certification implemented. Automated domain/DB checks pass. MTO expense changes are stage-limited and audited. |
| V1 deletion/action visibility | `lib/training-request-admin-deletion*`, dashboard/admin views | Recoverable deletion/restoration for MTO/DC/Admin; badges/bold action rows. Earlier Admin-only restriction superseded. Office does not get deletion access. |
| V2 official Training Request | `lib/pdf/render-training-request.ts`, `generate-approved-packet.ts`, `build-audit-trail.ts` | Original header/Travel Authorization, vertical expenses, description fallback, stored rate, long-text continuation and immutable signing inputs covered by tests; historical visual comparisons recorded. |
| V3 state/Academy/signatures | `lib/state-course-details.ts`, `lib/ny-training-id.ts`, `lib/training-location.ts`, `lib/pdf/render-academy-registration.ts`, `components/signature/` | OFPC details, saved address, fixed/padded NY ID, Academy last-four SSN, commuter presets, TAL requester signature/final-approval date, inline draw/upload/type setup implemented. Payment fields remain blank. |
| V4 accounts/recovery | `lib/auth/`, `supabase/templates/recovery.html` | Badge login, forced setup, email synchronization and session-bound recovery proof tested. Latest real-user recovery-email/password completion is still unverified. |
| V4 request emails | `supabase/functions/send-training-request-notifications/`, `supabase/ops/` | Outbox/eligibility/retries and approved-only attachments/responsibilities implemented; primary DC email setting exists. Automated checks pass. Delivery was historically confirmed, but not retested end-to-end today. |
| V5 compensation | `lib/compensation/`, `components/compensation/`, `lib/pdf/render-compensation-packet.ts` | Time/lunch/mileage/voucher/receipts, employee and MTO signatures, current-rate capture, returns and Office coding/Submitted implemented. Tests and prior mocked browser review passed; no live claim was signed as a release test. |
| V6 City Authorization | `lib/city-authorization/`, `components/city-authorization/`, `app/api/training-requests/[id]/city-authorization/` | New DC approvals queue Office; successful private upload completes it, preserves revisions and permits requester download. Removal of wrong files (hide, keep the record, return to Awaiting Office if none remain) released November 21; no live removal has been exercised yet. Tests pass; live queue/upload controls verified November 19 without making a real upload. |

The later TAL changes, Academy SSN collection, expanded administrative deletion and compensation current-rate rule are **authorized evolution**, not accidental departures from the original narrower PDF task. Approved outputs remain flattened rather than editable downloaded forms; editable PDFs were not established as an additional requirement.

## Verification ledger

**Fresh local checks on November 21**, same application source as production checkpoint:

| Check | Result |
| --- | --- |
| `npm test` | **692 passed, 0 failed, 0 skipped; 138 suites**. Recheck after `npm ci` on handoff commit `0b8c8fd`: 691 passed, 1 failed. The README rewrite had dropped the explicit `localhost:3000/reset-password` redirect that `lib/auth/password-recovery.test.ts` requires. README restored in the follow-up docs PR. |
| `npm run lint` | Passed |
| `npx tsc --noEmit --incremental false` | Passed |
| `npm run build` | Passed; existing Next.js middleware-to-proxy deprecation notice |
| Standalone portable notification-module TypeScript check | Passed for handler/email/attachment; Deno entrypoint/runtime not exercised |
| Markdown local-link and staged-diff/secret review | Completed for handoff documents before commit |

Runtime: Node 26.5.0, npm 11.17.0. Poppler `pdftoppm` was available. Tests used a local Fontconfig file pointing at system fonts and a writable cache; README includes a portable recreation rather than requiring the old chat workspace. Build fetched existing Google fonts with network access. Dependencies were already installed; a clean-machine `npm ci` was **not** rerun.

**Prior live evidence, November 19:** Vercel success for the exact production SHA; 12 database checks passed for roles, current-rate enforcement, RLS/private storage, service-only mutation, active triggers, unchanged existing packet and no historical City queue. Authenticated dashboard/City queue, Office selector and approved-request upload controls loaded. No users were assigned Office, claims approved, City files uploaded or emails sent during those checks.

**Earlier recorded evidence:** controlled request-alert email receipt confirmed October 10; later worker/attachment updates passed automated checks and deployment monitoring. Password recovery and inline-signature flows passed mocked browser/service tests November 16. These are not a fresh live multi-role acceptance test.

No live site, account, password, delivery queue, database or deployment was changed during this documentation handoff. Logs used for this run were temporary local artifacts; the results above are the durable record.

## Outstanding work, in priority order

1. **Operational assignments and beta acceptance — user/designated tester.**
   - Confirm the intended Office personnel, primary DC and current mileage setting; last observed November 19, Office accounts had not been assigned.
   - Acceptance: intended Office user gets City tasks after new DC approval and compensation tasks after signed MTO handoff; backups can process but receive no Office-stage action badge. Existing approved requests do not appear as new City tasks. Do not choose or elevate a person without authorization.

2. **Real-user password recovery acceptance — no new code assumed.**
   - Request a fresh email; confirm GET does not consume it; user privately completes the password change and signs in by badge; reused/expired links fail.
   - Also verify an authorized email edit retains the existing password and recovery goes to the correct new address.
   - Acceptance: evidence from a named consenting tester, no credentials/tokens in reports. If it fails, inspect SMTP/template/redirects and `lib/auth/password-recovery-server.ts` before changing the proof policy.

3. **Controlled full training/Office/compensation journey — approved test identities and record.**
   - Submit an Academy request (including synthetic student information), exercise MTO expense edit and return/resubmit, then signed MTO/DC approval.
   - Verify approved forms reach the request contact email with the responsibility wording and 18% meal-tip guidance; denied requests never receive those attachments. Confirm new Office City task appears independently.
   - Upload an explicitly approved test City file; confirm Office alert clears, requester downloads it and revisions retain prior files.
   - Complete a finished-course compensation packet, verify requester mileage/voucher signatures and submission date, MTO signature, Office time/pay codes and Mark as Submitted. Include MTO self-request and quiet backup paths.
   - Acceptance: correct files/roles/notifications and immutable history throughout; no actual reimbursement/City submission performed just to test software. Automated tests already cover these transitions, but production integrations require controlled acceptance.

4. **Clarify gaps before implementing.**
   - Should backup DC portal indicators also be suppressed? (The primary MTO and Office questions were settled November 21; see D24.)
   - Does “EMT time” mean something broader than the current EMT Travel Time field?
   - Acceptance: explicit decisions recorded in DECISIONS/PROJECT_VISION, then scoped tests and implementation. Do not mark these as confirmed unimplemented features without that clarification.

5. **Beta polish and operational hardening — proposed, not authorized implementation.**
   - Define Help & Instructions content (dashboard still says Coming soon); review mobile/accessibility with actual users.
   - Establish retention/backup/restore/monitoring ownership, especially for receipts, signatures and Academy SSN fragments. No retention policy is encoded.
   - Consider runtime pinning, CI and a reproducible safe environment/bootstrap; repository has no CI workflow or complete Supabase CLI configuration.
   - Acceptance: approved scope and measurable checks before changes; no infrastructure rewrite is implied.

## Known issues / technical debt / limits

- No new failing automated check was found; this does **not** close the unverified live password-recovery report.
- Documentation drift was substantial and is corrected in this handoff: old README omitted migrations/Office/address support and misstated signature eligibility, TAL student signing and completed email attachments.
- Recovery/login rate limiting uses in-memory maps; it is not a durable cross-instance limit. Distributed enforcement has not been specified or validated.
- Node/runtime is not pinned. Tests use `registerHooks`; Next.js minimum runtime alone is insufficient. Test files and the Deno function are outside the main TypeScript project.
- New tests must be added to the explicit npm test list. Browser preview harnesses from prior work were outside this repo; there is no checked-in automated browser suite.
- Manual SQL installs require migration-history reconciliation before CLI automation. Production's “dev” project label is misleading.
- Existing Next.js middleware convention is deprecated. Historical duplicate generated type files and restricted font caches caused environment-only check failures; do not weaken source checks to hide them.
- Failed/ambiguous uploads can leave private unreferenced objects deliberately retained to protect committed snapshots. No scheduled orphan cleanup is implemented; any future cleanup must prove absence of historical references.
- No compensation/City email delivery, standalone unapproved compensation, payroll transmission, automatic City submission or automated 18% receipt-tip calculation. These are limits, not approved backlog promises.

## Next agent's first actions

Read the six root documents and the relevant feature doc. Inspect `git status`, recent commits and the current remote state; the handoff push was explicitly authorized, but future releases need their own applicable authorization. Ask which acceptance/clarification item the user wants next, while doing only independent read-only preparation. Follow README's commands and record results in this file. Remove resolved tasks rather than appending permanent historical status reports.

## Evidence basis and uncertainty

This handoff reconciles the available user conversation, the recoverable referenced “Fillable PDF with Signatures” conversation (five turns; no older cursor), repository history/tests/migrations, and earlier release notes available during this task. Relevant release facts are incorporated above; continuation does not require those external notes. Some preexisting implementation choices lack an original rationale, and external provider configuration/current role assignments were not re-audited November 21. Where evidence conflicts, preserve the latest explicit user choice and identify the uncertainty rather than inventing a historical decision.
