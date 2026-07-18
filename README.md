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

### 5. Insert test personnel manually

Use `supabase/seed.example.sql` as a development-only guide, or insert your initial MTO test user directly:

```sql
insert into public.personnel (badge_number, email, role, active)
values ('207', 'ifd.mto@gmail.com', 'mto', true);
```

Do not add real personnel information to the repository.

## Magic Link Authentication

The login page uses badge number plus department email verification, followed by a Supabase magic-link email.

### Enable email authentication

In the Supabase dashboard:

1. Open **Authentication**.
2. Open **Providers**.
3. Ensure **Email** is enabled.

### Use the default Supabase magic-link template

For current development and testing, you can use Supabase's default **Magic Link** email template. The application does not require a custom `{{ .Token }}` template.

The login flow works like this:

1. The user enters badge number and department email.
2. The app calls `personnel_login_allowed`.
3. The app stores a short-lived HTTP-only badge cookie.
4. Supabase sends a magic-link email.
5. The user clicks the link and returns to `/auth/callback`.
6. The callback exchanges the auth code, validates badge + email against `public.personnel`, and creates a secure session.

### Configure redirect URLs

In the Supabase dashboard:

1. Open **Authentication**.
2. Open **URL Configuration**.
3. Add your callback URL to **Redirect URLs**, for example:
   - `http://localhost:3000/auth/callback`
   - your production URL when deployed

Keep **Site URL** aligned with the environment you are testing.

### Email delivery notes

Supabase can send magic-link emails without custom SMTP during development.

Custom SMTP may still be needed later for production reliability and branding, but it is not required for current testing.

Optional dashboard settings that help reduce abuse:

- Keep Supabase auth rate limits enabled
- Review **Authentication -> Rate Limits** in the Supabase dashboard

The application also enforces a 60-second resend cooldown in the login UI.

## Authentication and Authorization

- Login uses Supabase secure session cookies through `@supabase/ssr`
- The app does not use `sessionStorage` or `localStorage` for authentication
- Middleware refreshes Supabase sessions and protects authenticated routes
- After the magic link callback, the app confirms the signed-in email and badge number match an active personnel row
- Roles come only from `public.personnel`, never from browser input after login

Protected routes:

- `/dashboard`
- `/requests`
- `/requests/new`
- `/approvals`
- `/admin/users`
- `/admin/requests`

Authorization:

- `firefighter`, `mto`, `deputy_chief`, and `admin` may use normal request routes
- `firefighter` is the only non-administrative role and has no personnel-management permissions
- `mto`, `deputy_chief`, and `admin` have equal administrative permissions: read, add, edit, activate, deactivate, assign any valid role (including `admin`), and hard-delete personnel records
- Administrative roles may access `/admin/users` and manage personnel through Supabase RLS
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

First and last names are trimmed on write and stored as null when blank. Names are required before a personnel user can create a training request. Login continues to use badge number and department email only.

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

Request numbers are generated in the database using a per-year counter, for example:

`IFD-2026-0001`

The browser does not assign final request numbers. A trigger assigns the number when a draft is first inserted.

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
- `APP_BASE_URL/requests/[request-number]/confirmation` for requester alerts

### Approval workflow test procedure

1. Apply all migrations in order.
2. Ensure at least one active `mto`, one active `deputy_chief`, and one active `firefighter` test user exist with first and last names populated.
3. Sign in as the firefighter, submit a training request, and confirm status becomes `pending_mto`.
4. Sign in as MTO, open `/approvals`, review the request, and sign/approve.
5. Sign in as Deputy Chief, review the request from `/approvals`, and sign/approve.
6. Confirm the requester sees the full approval timeline on the request detail page.
7. Repeat a return-for-correction path and confirm the requester can edit/resubmit without changing the request number.
8. Verify notification rows are created in `public.training_request_notifications`.
9. Deploy the Edge Function, configure Resend secrets and `APP_BASE_URL`, then trigger the webhook or scheduled job and confirm rows move to `sent`.

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

PDF export is not implemented yet. The application generates a deterministic filename from the immutable request snapshot:

`LastName_FirstInitial_TrainingName_RequestNumber.pdf`

Example:

`Koehler_K_Fire_Officer_I_IFD-2026-0001.pdf`

The confirmation screen displays this planned filename. It will become the downloaded PDF filename when export is added.

### localStorage removal

Older prototype requests saved in browser `localStorage` are not migrated automatically. The app now reads and writes requests only through Supabase.

## Useful Commands

```bash
npm run lint
npx tsc --noEmit
npm run build
```

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [Supabase Documentation](https://supabase.com/docs)
