# IFD Training Portal

Next.js application for Ithaca Fire Department training request workflows and personnel access.

## Getting Started

Copy the example environment file and set local values:

```bash
cp .env.local.example .env.local
```

Required local variables:

- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase anon/public key
- `NEXT_PUBLIC_GSA_MILEAGE_RATE` — example mileage rate only; replace it with the approved current GSA rate before calculating real reimbursements
- `SUPABASE_SERVICE_ROLE_KEY` — server-only secret for immutable approval signature snapshots and approved PDF packet storage. Never prefix with `NEXT_PUBLIC_`.

Never commit `.env.local`. Never add a Supabase service-role key to browser code or to `.env.local.example`.

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Supabase Setup

### 1. Create a Supabase project

1. Sign in to [Supabase](https://supabase.com/).
2. Create a new project for development.
3. Choose a strong database password and save it securely.

### 2. Find the project URL and anon key

In the Supabase dashboard:

1. Open **Project Settings**.
2. Open **API**.
3. Copy **Project URL** into `NEXT_PUBLIC_SUPABASE_URL`.
4. Copy **anon public** key into `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

Use only the anon key in this application. Do not expose the service-role key in the browser or in committed files.

### 3. Configure `.env.local`

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_GSA_MILEAGE_RATE=0.70
```

Restart `npm run dev` after changing environment variables.

### 4. Run the migrations

Apply these files in order using the Supabase SQL editor:

1. `supabase/migrations/20260718140000_create_personnel.sql`
2. `supabase/migrations/20260718150000_personnel_login_allowed.sql`
3. `supabase/migrations/20260718160000_expand_administrative_roles.sql`
4. `supabase/migrations/20260718170000_create_training_requests.sql`
5. `supabase/migrations/20260718180000_add_personnel_names.sql`
6. `supabase/migrations/20260718190000_training_request_approval_workflow.sql`
7. `supabase/migrations/20260718200000_human_readable_request_numbers.sql`
8. `supabase/migrations/20260718210000_personnel_signatures.sql`
9. `supabase/migrations/20260718220000_approval_signature_snapshots_and_packets.sql`
10. `supabase/migrations/20260718230000_delete_own_training_request_drafts.sql`
11. `supabase/migrations/20260718240000_password_authentication.sql`
12. `supabase/migrations/20260718250000_personnel_must_change_password.sql`
13. `supabase/migrations/20260718260000_legacy_password_setup.sql`

### 5. Create the first administrator manually

Because public signup is disabled, the first administrator must be created manually:

1. In the Supabase dashboard, open **Authentication -> Users** and create a user with the personnel department email and a strong temporary password.
2. Insert the matching personnel row:

```sql
insert into public.personnel (
  badge_number,
  email,
  first_name,
  last_name,
  role,
  active
)
values (
  '207',
  'ifd.mto@gmail.com',
  'Kevin',
  'Koehler',
  'mto',
  true
);
```

3. Sign in at `/` using badge number and password.

After the first administrator exists, additional personnel should be created through **User Management**, which provisions both the `public.personnel` row and the Supabase Auth account server-side.

Do not add real personnel information to the repository.

## Password Authentication

The login page uses badge number and password only. Users do not enter their department email during sign-in.

Internally, Supabase Auth still uses the personnel email address. The application resolves that email on the server from `public.personnel` using the submitted badge number, then calls `signInWithPassword()` through the Supabase SSR server client.

Normal login does not send magic links, OTP messages, or sign-in emails.

After an administrator assigns a temporary password, users with `must_change_password = true` are redirected to `/settings/password` before accessing other application pages.

### Legacy magic-link transition

Some existing personnel signed in only through Supabase email magic links and therefore do not have a badge-number password yet.

The login page keeps badge number and password as the normal sign-in method and adds a secondary action:

- **Set up my password** → `/setup-password`

That page accepts badge number only. Trusted server code resolves the department email, confirms a matching Supabase Auth account exists, and sends a one-time password-setup link through Supabase Auth. The browser always receives the same generic response:

`If an active account matches that badge number, a password setup link has been sent to the department email on file.`

Password-setup links redirect to:

`/auth/callback?flow=password-setup`

After the callback establishes a session, the user is forced to create a password at `/settings/password?required=1&setup=legacy` before accessing the rest of the portal.

Successful first password creation:

- clears `must_change_password`
- sets `personnel.password_setup_completed_at`
- redirects to `/dashboard`

Future sign-ins use badge number and password only.

Migration `20260718260000_legacy_password_setup.sql` adds `password_setup_completed_at` and documents a reviewed one-time backfill for active legacy accounts. Review that commented SQL before applying it in production.

### Administrator temporary-password alternative

Administrators can still reset passwords from **User Management**. That workflow assigns a temporary password server-side, sets `must_change_password = true`, and shows the temporary password once to the administrator.

Use this when:

- the user cannot access their department email
- Auth email delivery is rate-limited or unavailable
- a password-setup email fails

Administrator reset never requires the user's old password.

### Auth email quota warning

The legacy password-setup workflow sends a Supabase Auth email and therefore consumes the project's Auth email quota. Do not treat this workflow as unlimited while using Supabase's default email sender.

For production rollout, configure either:

- custom SMTP in Supabase, or
- administrator-assigned temporary passwords

Ordinary badge-number and password login does not send email after setup is complete.

### Required Supabase callback URLs

Add these redirect URLs in **Authentication -> URL Configuration**:

- `http://localhost:3000/auth/callback`
- your production application URL, for example `https://training.example.gov/auth/callback`

Set `APP_BASE_URL` in server environment configuration so password-setup links use the correct production origin.

### Enable email/password authentication

In the Supabase dashboard:

1. Open **Authentication**.
2. Open **Providers**.
3. Ensure **Email** is enabled for password sign-in.

Disable unrestricted public signup. This portal provisions accounts only through administrative personnel management or manual first-administrator setup.

### Sign-in flow

1. The user enters badge number and password on `/`.
2. The browser POSTs to `/api/auth/login`.
3. Trusted server code resolves exactly one active personnel row by badge number using a server-only lookup.
4. The server calls `signInWithPassword()` with the resolved personnel email and submitted password.
5. The server verifies the authenticated Supabase user email matches the personnel email, the personnel row is still active, and the role is valid.
6. On success, the SSR session cookie is established and the user is redirected to `/dashboard`.
7. On any failure, the server returns the generic error: `Unable to sign in. Check your badge number and password.`

The application does not reveal whether a badge exists, whether an account is active, or which email belongs to a badge.

### Password requirements

**Permanent passwords** (forced first-login setup and ordinary Change Password) must be at least 12 characters and include upper- and lowercase letters, a number, and a special character.

**Initial passwords** (Add User and administrator reset) require only at least 6 characters and cannot be entirely whitespace. They are temporary credentials meant to be easy to remember, communicate, and enter.

After first sign-in, users with `must_change_password = true` must replace an initial password with a permanent password that meets the stronger rules.

### Administrator account provisioning

Administrators with `mto`, `deputy_chief`, or `admin` roles can create personnel from `/admin/users`.

The Add User form assigns an **initial password** of at least 6 characters. Initial passwords are intentionally easy to remember and enter. They are temporary credentials only.

The protected server route `/api/admin/personnel`:

1. Verifies the signed-in administrator.
2. Validates the administrator-assigned initial password server-side.
3. Creates the Supabase Auth user with the personnel email and that initial password.
4. Creates the matching `public.personnel` row with `must_change_password = true`.
5. Reconciles partial failures so an Auth user is not left behind without a personnel row.

Passwords are stored only in Supabase Auth. They are never saved to `public.personnel`, returned in the API response, or displayed after account creation.

Administrators must communicate the initial password to the user securely outside the portal. After first sign-in, the user must choose a stronger permanent password before accessing the rest of the application.

Administrator password reset uses the same relaxed initial-password policy and generates memorable temporary passwords such as `Cedar7` or `Ladder4`.

### Change password

Authenticated users can update their password at `/settings/password`.

When `must_change_password` is true, the page shows only **New Password** and **Confirm New Password**. The server decides whether Current Password is required from the personnel record; the browser cannot bypass that check.

When `must_change_password` is false, the page verifies the current password, validates the new password against the same strength rules, and updates the Supabase Auth password through a protected server route.

### Email confirmation and recovery callback

`/auth/callback` handles Supabase email confirmation, invitation, recovery, and legacy password-setup links. It is not used for ordinary badge-number sign-in.

Password-setup links use `flow=password-setup` and redirect to forced password creation.

Recovery links may redirect to `/settings/password`.

## Authentication and Authorization

- Login uses Supabase secure session cookies through `@supabase/ssr`
- The app does not use `sessionStorage` or `localStorage` for authentication
- Middleware refreshes Supabase sessions and protects authenticated routes
- After password sign-in, the app confirms the authenticated email matches an active personnel row
- Roles come only from `public.personnel`, never from browser input after login
- Passwords remain entirely in Supabase Auth; `public.personnel` does not store passwords

Protected routes:

- `/dashboard`
- `/requests`
- `/requests/new`
- `/approvals`
- `/admin/users`
- `/admin/requests`
- `/settings/password`
- `/settings/signature`

Authorization:

- `firefighter`, `mto`, `deputy_chief`, and `admin` may use normal request routes
- `firefighter` is the only non-administrative role and has no personnel-management permissions
- `mto`, `deputy_chief`, and `admin` have equal administrative permissions: read, add, edit, activate, deactivate, assign any valid role (including `admin`), reset passwords, and hard-delete personnel records
- Administrative roles may access `/admin/users` and manage personnel through Supabase RLS plus protected server provisioning routes
- Distinct role values remain for future workflow routing only: MTO approval actions go to `mto`, Deputy Chief approval actions go to `deputy_chief`, and `admin` has administrative access without an automatic approval stage

## Personnel Data Model

The `personnel` table stores only:

- badge number
- email
- first name
- last name
- role
- active status
- created/updated timestamps

First and last names are trimmed on write and stored as null when blank. Names are required before a personnel user can create a training request. Login uses badge number and password only; the department email remains linked to Supabase Auth internally and must match the Auth user email.

Active badge numbers must be unique. The database enforces case-insensitive uniqueness among active personnel records.

It intentionally does not store phone numbers, addresses, passwords, medical information, or payroll information.

Do not add real personnel data to shared environments until production authentication and governance are complete.

After applying the personnel names migration, update existing personnel records manually in the Supabase SQL editor. Example for a development test user:

```sql
update public.personnel
set first_name = 'Kevin', last_name = 'Koehler'
where badge_number = '207';
```

Do not commit real personnel names into shared migrations or seed files.

## Training Requests

Training requests are stored in Supabase in `public.training_requests`. They are shared across browsers and devices for authenticated personnel.

### Request schema

Each request stores requester identity, course details, expense fields, workflow status, and timestamps. Additional preserved form fields include:

- requester name
- course number
- number of days on duty
- airfare, rental vehicle, and other expense amounts
- GSA mileage rate and total reimbursable miles
- transportation notes in `department_vehicle_details`

### Request numbers

Human-readable request numbers are assigned by the database at submission time, not when a draft is inserted.

Format:

`LastName, FirstInitial, CourseName, Year.Sequence`

Example:

`Koehler, K, Fire Officer I, 2026.1`

Rules:

- the yearly sequence is department-wide and resets each calendar year
- the sequence is not zero-padded
- drafts use `request_number = null` and display as **Draft**
- the final number is immutable after first assignment
- resubmitted returned requests keep their original number
- the browser never supplies the final request number

Existing IFD-format test records created before this migration remain unchanged. Newly submitted requests use the human-readable format.

Optional disposable cleanup before re-testing numbering:

```sql
delete from public.training_requests where request_number like 'IFD-%';
```

Drafts remain editable by the requester only. Submitted requests follow the approval workflow below.

## Approval Workflow

Training requests move through role-specific signing steps. MTO, Deputy Chief, and Admin have equal administrative permissions for personnel management, but workflow signing remains role-specific:

- only active personnel with role `mto` may perform MTO review actions
- only active personnel with role `deputy_chief` may perform Deputy Chief review actions
- `admin` may view all requests but is not treated as MTO or Deputy Chief for signing unless their personnel role is changed

### Workflow stages

1. Firefighter submits request:
   - status = `pending_mto`
   - `current_action_role` = `mto`
   - notify all active MTO personnel
2. MTO approves:
   - record MTO electronic signature
   - status = `pending_deputy_chief`
   - `current_action_role` = `deputy_chief`
   - notify all active Deputy Chief personnel
3. MTO returns for correction:
   - status = `returned_for_correction`
   - `current_action_role` = `firefighter`
   - requester may edit and resubmit
4. MTO denies:
   - status = `denied`
   - `current_action_role` = `null`
5. Deputy Chief approves:
   - record Deputy Chief electronic signature
   - status = `approved`
   - `current_action_role` = `null`
6. Deputy Chief returns for correction:
   - status = `returned_for_correction`
   - `current_action_role` = `firefighter`
   - resubmission restarts at `pending_mto`
7. Deputy Chief denies:
   - status = `denied`
   - `current_action_role` = `null`

Supported statuses:

- `draft`
- `submitted`
- `pending_mto`
- `pending_deputy_chief`
- `returned_for_correction`
- `approved`
- `denied`
- `cancelled`

### Electronic signatures

Approvals use authenticated electronic signature acknowledgment rather than handwritten drawing. Reviewers must:

- confirm they are signing electronically in the review dialog
- see their authenticated full name and badge number
- optionally enter comments on approve, or required comments on return/deny
- click a role-specific button such as **Sign and Approve as MTO**

Signature intent is enforced in both places:

- the approval review dialog requires the acknowledgment checkbox before calling the workflow RPC
- the database approval RPC functions require `p_electronic_signature_confirmed = true` and reject false or missing acknowledgment with a clear error

The database stores trusted actor identity snapshots and signature metadata in `public.training_request_actions`, including `electronic_signature_confirmed`. Browser clients cannot supply signature identity fields directly.

### Action history

`public.training_request_actions` stores immutable workflow history including:

- actor personnel ID, name, badge, and role snapshots
- action type (`submitted`, `mto_approved`, `mto_returned`, `deputy_chief_approved`, etc.)
- comments
- `signature_name`, `signed_at`, and `electronic_signature_confirmed` for approval actions

History rows are inserted only by trusted `SECURITY DEFINER` workflow functions.

### Workflow database functions

Apply workflow transitions through RPC functions rather than direct table updates:

- `submit_training_request(request_id)`
- `resubmit_training_request(request_id)`
- `mto_approve_training_request(request_id, comments, electronic_signature_confirmed)`
- `mto_return_training_request(request_id, comments)`
- `mto_deny_training_request(request_id, comments)`
- `deputy_approve_training_request(request_id, comments, electronic_signature_confirmed)`
- `deputy_return_training_request(request_id, comments)`
- `deputy_deny_training_request(request_id, comments)`

### Approval UI

- `/approvals` — queue for the signed-in user's exact workflow role
- `/approvals/[id]` — full request review page with signing actions
- `/admin/requests` — administrative view of all requests without automatic signing rights for `admin`

Dashboard quick actions include:

- **Requests Requiring My Action** for MTO and Deputy Chief users
- **Administrative Request View** for administrative roles

### Email notification outbox

Workflow functions enqueue rows in `public.training_request_notifications` in the same database transaction as the workflow action. The outbox is not exposed to browser users except for administrative delivery-status visibility on review/detail pages.

Notification events:

- `pending_mto`
- `pending_deputy_chief`
- `returned_for_correction`
- `denied`
- `approved`

Duplicate notifications for the same workflow transition and recipient are prevented by a unique constraint on `(source_action_id, event_type, recipient_email)`.

Workflow commits even if email delivery is temporarily unavailable. Failed sends remain retry-safe in the outbox.

### Edge Function: `send-training-request-notifications`

Deploy the function from:

`supabase/functions/send-training-request-notifications/index.ts`

Required Supabase Edge Function secrets:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `APP_BASE_URL`

Do not place service-role or Resend secrets in `NEXT_PUBLIC_*` variables.

Supported delivery options:

1. **Database webhook (preferred):** invoke the Edge Function when a row with `status = pending` is inserted into `public.training_request_notifications`
2. **Scheduled invocation:** run the Edge Function periodically to process pending rows

Example webhook target:

`https://<project-ref>.supabase.co/functions/v1/send-training-request-notifications`

The function claims pending rows safely, sends email through Resend, marks successful rows `sent`, and records failed attempts without exposing provider secrets to the browser.

Set `APP_BASE_URL` to the deployed application origin, for example:

`https://training.example.gov`

Email links use:

- `APP_BASE_URL/approvals/[request-id]` for reviewer alerts
- `APP_BASE_URL/requests/[request-id]/confirmation` for requester alerts

### Approval workflow test procedure

1. Apply all migrations in order.
2. Ensure at least one active `mto`, one active `deputy_chief`, and one active `firefighter` test user exist with first and last names populated.
3. Sign in as the firefighter, submit a training request, and confirm status becomes `pending_mto`.
4. Sign in as MTO, open `/approvals`, review the request, and sign/approve.
5. Sign in as Deputy Chief, review the request from `/approvals`, and sign/approve.
6. Confirm the requester sees the full approval timeline on the request detail page.
7. Repeat a return-for-correction path and confirm the requester can edit/resubmit without changing the request number.
8. Confirm a newly submitted 2026 request receives `LastName, F, Course, 2026.1`, the next request receives `.2`, and resubmission does not consume another sequence.
9. Verify notification rows are created in `public.training_request_notifications`.
10. Deploy the Edge Function, configure Resend secrets and `APP_BASE_URL`, then trigger the webhook or scheduled job and confirm rows move to `sent`.

### Personnel signatures (Phase 1)

Migration `20260718210000_personnel_signatures.sql` adds secure stored signatures for active **MTO** and **Deputy Chief** personnel only. Admin users do not receive signature access unless their personnel role is exactly `mto` or `deputy_chief`.

**Private storage bucket:** `personnel-signatures`

- The bucket is private (`public = false`).
- Each owner stores one normalized final object at `<personnel-id>/signature.png`.
- Staged replacements upload to `<personnel-id>/pending/<uuid>.png` and only promote to the final path after server-side PNG validation succeeds.
- If a final signature already exists, the server backs it up under `<personnel-id>/pending/backup-<uuid>.png` before promotion and restores it when promotion or metadata save fails.
- Storage policies allow an authenticated owner to read, write, replace, and delete only their own final object and owner-scoped pending objects. Path traversal is rejected.
- All Storage mutations run through protected `/api/settings/signature` route handlers using the authenticated server Supabase client. The browser does not upload directly to Storage.
- Cross-user access and anonymous access are denied.
- The browser never receives a permanent public URL. Previews use short-lived signed URLs for `<authenticated-personnel-id>/signature.png` only; arbitrary storage paths from the client or metadata are not trusted.
- Future PDF generation will use the Supabase service role to read signature bytes server-side. Do not add a service-role key to browser code or `NEXT_PUBLIC_*` variables.

**Supported roles:** `mto`, `deputy_chief`

**Upload rules:**

- PNG only (`image/png`), verified from actual file bytes on the server
- Maximum file size: 1 MB (actual byte length)
- IHDR dimensions must be at least 150 × 50 px and no larger than 2000 × 1000 px
- Rejected formats include JPEG, SVG, GIF, and PDF even when mislabeled in the browser

**Certification:** Before saving, the owner must confirm:

“I certify that this is my official signature and authorize the IFD Training Portal to place it on training documents I electronically approve.”

The save API rejects any request where `certificationConfirmed` is not literal `true`. The database trigger requires `certification_confirmed = true` and assigns `certified_at` on the server. Client-supplied personnel IDs or certification timestamps are not trusted.

Storage policy helper functions (`can_manage_own_personnel_signature`, `expected_personnel_signature_storage_path`, `is_personnel_signature_pending_object_path`, and `is_personnel_signature_owner_object_path`) are executable by `authenticated` users only so Storage RLS can evaluate owner-scoped paths. They do not grant cross-user access.

**Application route:** `/settings/signature`

MTO and Deputy Chief users can draw or upload a signature, preview the stored PNG, replace it, or delete it. Firefighters and admin-only accounts see access denied. Stale metadata can be deleted even when the Storage object is already missing.

**Approval snapshot preparation:** Phase 2 copies the reviewer's stored PNG into immutable approval snapshots and records metadata on `public.training_request_actions`. Replacing a live personnel signature later does not change historical action snapshots.

### Phase 2 — Approval Snapshots and Approved PDF Packets

Apply migration #9 after migration #8.

**Server environment variable**

- `SUPABASE_SERVICE_ROLE_KEY` — required on the Next.js server for snapshot uploads, packet uploads, and protected downloads. Never expose this value in browser code or `NEXT_PUBLIC_*` variables.

**Private storage buckets**

- `training-request-signature-snapshots` — immutable approval PNG copies at `<request-id>/<action-id>/signature.png`
- `training-request-packets` — approved merged PDF packets at `<request-id>/approved-packet.pdf`

**PDF templates (server-side only)**

- `lib/pdf/templates/training-request-form-2026.pdf`
- `lib/pdf/templates/tal.pdf`

Inspect AcroForm field names during development:

```bash
npx tsx scripts/inspect-pdf-fields.ts
npx tsx scripts/inspect-pdf-field-rects.ts
```

Field mappings live in `lib/pdf/field-mapping.ts`.

**Signature snapshot workflow**

1. Authenticated reviewer calls `POST /api/training-requests/[id]/workflow`.
2. Database reserves an action ID and immutable reviewer identity through `reserve_training_request_signature_action`.
3. Server downloads and re-validates the reviewer's current personnel signature PNG.
4. Server uploads immutable snapshot bytes to the private snapshot bucket using the service role.
5. Server re-downloads the uploaded snapshot object, verifies the PNG bytes, and derives SHA-256 from the actual stored object.
6. Database completes the workflow through `complete_training_request_signature_action` using the **service-role client only**.
7. If database completion fails, the unused snapshot object is deleted.

`complete_training_request_signature_action` is **not** executable by browser sessions. Completion derives the actor from the reservation identity snapshot rather than `auth.uid()`.

Signature-required actions:

- `mto_approve`, `mto_deny`, `deputy_approve`, `deputy_deny`

Return-for-correction does not require a signature snapshot.

Error when no signature exists:

`You must save your signature before signing this training request action.`

**Approved packet generation**

After Deputy Chief approval:

1. Request status becomes `approved`.
2. A `training_request_packets` row is upserted with status `pending`.
3. Server-side code generates a two-page PDF (Training Request Form + TAL), validates required AcroForm fields, verifies the final merged PDF is noninteractive, uploads it to the private packet bucket, and marks the packet `ready`.
4. Failed generation leaves the request approved, marks the packet `failed`, stores a safe error message, and allows authorized administrative retry.

Repeated generation replaces `<request-id>/approved-packet.pdf` and reuses the single packet metadata row.

**Protected download**

`GET /api/training-requests/[id]/approved-packet`

Authorized roles:

- request owner
- `mto`
- `deputy_chief`
- `admin`

Requirements:

- request status is `approved`
- packet status is `ready`
- response streams the private PDF with `Content-Type: application/pdf`
- `Content-Disposition` filename uses the exact safe request-number filename such as `Koehler, K, Fire Officer I, 2026.1.pdf`

Administrative retry:

`POST /api/training-requests/[id]/approved-packet/retry`

**Signature placement**

- Training Request Form: MTO snapshot on the MTO line, Deputy Chief snapshot on the Deputy Chief line, with approval dates in `undefined_2` and `undefined_3`
- TAL agency authorization: same immutable MTO snapshot at the `Signature1` box
- Firefighter/student TAL signature fields remain blank; the firefighter signs after downloading the approved packet

**Future TAL personnel fields left blank until trusted data exists**

- middle initial
- address
- city
- state
- ZIP
- phone
- NY training ID
- SCBA clearance

**Phase 3**

Approval email delivery with the saved PDF attached will be implemented in the next phase. Phase 2 does not attach PDFs to approval emails.

### Row Level Security

- Authenticated personnel may create and update their own draft requests only when the requester fields match their active personnel record
- Requesters may submit their own drafts into `pending_mto`
- Requesters may read their own requests
- MTO, Deputy Chief, and Admin may read all requests
- Requesters may edit draft or returned requests and resubmit through trusted workflow functions
- Workflow signing and status transitions occur only through `SECURITY DEFINER` RPC functions
- Anonymous access is denied

Authorization uses the authenticated personnel record from Supabase Auth. The browser cannot assign another user's personnel ID or role for authorization.

On insert, a database trigger assigns `requester_personnel_id`, `requester_badge_number`, `requester_email`, and `requester_name` from the authenticated personnel row. `requester_personnel_id` is the stable ownership key. Email, badge, and name values stored on the request are historical snapshots and do not change when personnel records are edited later.

Personnel must have both a first and last name before creating a training request.

### Document filename standard

Approved packet downloads and packet metadata use the exact submitted request number as the filename base:

`Koehler, K, Fire Officer I, 2026.1.pdf`

The confirmation and request detail pages display this filename for approved packets. Only characters unsafe for the operating system are removed from the filename helper; the visible request number and filename base otherwise match exactly.

Request detail and confirmation routes use the stable request UUID:

`/requests/[id]/confirmation`

### localStorage removal

Older prototype requests saved in browser `localStorage` are not migrated automatically. The app now reads and writes requests only through Supabase.

## Useful Commands

```bash
npm run lint
npx tsc --noEmit
npm run build
npm run test
```

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [Supabase Documentation](https://supabase.com/docs)
