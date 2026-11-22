# IFD Training Portal

Ithaca Fire Department's portal for training requests, MTO/DC approvals, official forms, City authorizations and post-training compensation.

Production: [ifdtraining.org](https://ifdtraining.org)

Source: [ktkoehler13/ifd-training-portal](https://github.com/ktkoehler13/ifd-training-portal)

## Start here

- [PROJECT_VISION.md](PROJECT_VISION.md): confirmed requirements, user preferences and scope boundaries.
- [PROJECT_STATUS.md](PROJECT_STATUS.md): current release, evidence, gaps and exact next steps.
- [AGENTS.md](AGENTS.md): shared working/testing/documentation rules.
- [DECISIONS.md](DECISIONS.md): significant decisions, rationale and unresolved choices.
- [Compensation workflow](docs/training-compensation.md) and [City Authorizations](docs/city-authorizations.md): detailed access, state and file behavior.

The repository is the source of project knowledge. Files in a developer's chat workspace, downloads folder or another clone are not setup dependencies.

## Stack and layout

Next.js **16.2.10**, React **19.2.4**, strict TypeScript, Tailwind CSS 4, Supabase SSR/Auth/PostgreSQL/private Storage, pdf-lib, Resend and Vercel. Install the versions in `package-lock.json`; dependency ranges in `package.json` alone are not a tested lock.

| Path | Responsibility |
| --- | --- |
| `app/` | App Router pages, auth callbacks and protected API routes |
| `components/requests/`, `components/approvals/` | Request wizard, review, signatures, approved packet UI |
| `components/compensation/`, `components/city-authorization/` | Post-training compensation and Office City tasks |
| `lib/auth/`, `lib/supabase/` | Auth/personnel identity, password recovery, authorized clients |
| `lib/training-request-*.ts`, `types/` | Request validation, mapping, transitions and action/snapshot records |
| `lib/pdf/` | Renderers, immutable snapshot inputs, field geometry and source templates |
| `lib/compensation/`, `lib/city-authorization/` | Domain rules, protected services and isolated workflow tests |
| `supabase/migrations/` | Ordered schema/RLS/workflow evolution; later files replace earlier functions |
| `supabase/functions/send-training-request-notifications/` | Separately deployed request-email worker |
| `supabase/ops/`, `supabase/templates/` | Email scheduling and Auth recovery template |
| `scripts/` | PDF inspection/sample rendering and privileged password support utilities |

## Local installation

Use an isolated development Supabase project, not production credentials/data for routine tests.

1. Install Node and npm. The November 21 handoff verified **Node 26.5.0 / npm 11.17.0**. No `engines` or version-manager pin exists yet; other runtimes are not certified by this check. Tests use `node:module.registerHooks`, so an older Node that can run Next.js may still fail this suite.
2. From the repository root, run `npm ci`.
3. Copy `.env.local.example` to `.env.local` and supply the variables below through local/deployment secrets. The example intentionally does not contain the server secret.
4. Initialize the development database and an administrator as described below.
5. Run:

```bash
npm run dev
# Open http://localhost:3000
```

Production-style local run:

```bash
npm run build
npm start
```

The build fetches the existing Geist/Geist Mono fonts from Google. Allow network access for those downloads or report the environment blocker; don't change fonts just to bypass the check.

### Website environment variables

| Variable | Where / purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser/server project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser-safe public/anon key; RLS still required |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server secret** for account provisioning, signed workflows and private files; also signs session-bound recovery proofs. Never expose through `NEXT_PUBLIC_`. |
| `APP_BASE_URL` | Server origin; use `http://localhost:3000` locally and `https://ifdtraining.org` for production |
| `NEXT_PUBLIC_GSA_MILEAGE_RATE` | Transitional fallback for training-request estimates when the database setting is unavailable. Example `0.00` is not an approved live rate. Compensation submissions require the actual database setting. |
| `VERCEL_URL` | Platform-provided fallback only when APP_BASE_URL is absent; set the canonical origin explicitly in production |

Do not commit `.env.local`, service credentials, SMTP/API keys or authentication links. `.gitignore` excludes environment files except the blank example, build output, dependencies and `.vercel`. Restart the dev server after environment changes.

## Database, Auth and initial administrator

Apply **all** `supabase/migrations/*.sql` files in filename order to an empty development Supabase project. Obtain the inventory rather than relying on an obsolete numbered subset:

```bash
find supabase/migrations -maxdepth 1 -name '*.sql' -print | sort
```

Migrations rely on Supabase's Auth/Storage schemas and roles; a bare PostgreSQL instance is insufficient without that platform setup. Automated PGlite fixtures supply isolated stand-ins.

For existing environments, determine which migrations actually ran. Prior production releases used the SQL Editor; CLI migration history may not reflect those installations. **Do not blindly run a bulk database push or replay migrations.** Reconcile first, apply only missing reviewed files, then:

```sql
notify pgrst, 'reload schema';
```

A schema-cache “column not found” error often indicates an unapplied migration or stale cache. Check the schema and ordered migration dependencies before changing the app or removing constraints.

Enable Supabase Email/password authentication and disable unrestricted public signup. For a fresh development environment:

1. Create a confirmed Auth user with an example development email and temporary password privately through Supabase.
2. Insert its matching personnel record using that exact email; the email-link trigger establishes the Auth association:

```sql
-- Development example only. First create the matching confirmed Auth account.
insert into public.personnel
  (badge_number, email, first_name, last_name, title, role, active, must_change_password)
values
  ('DEV-ADMIN', 'admin@example.test', 'Example', 'Administrator',
   'firefighter', 'admin', true, true);
```

3. Sign in by badge and password and complete the required personal-password setup.
4. Use **User Management** for further accounts; it provisions Auth and personnel together. The old commented `supabase/seed.example.sql` is not a complete account bootstrap and does not establish a future SSO requirement.

Passwords stay in Auth. Temporary initial passwords require at least 6 characters; permanent passwords require at least 8 with an uppercase letter, a lowercase letter and a special character (numbers optional). Ordinary login sends no email. Account email edits run through User Management's dedicated email operation; self-email changes sign out the user, who should retain the same badge/password. Do not update only `personnel.email` or relink an account by name.

Set Supabase Site URL and allowlisted callback/recovery URLs (**Authentication → URL Configuration → Redirect URLs**) to match each environment. Recovery redirects must be explicitly allowlisted; Site URL alone is not enough.

- Production Site URL: `https://ifdtraining.org`.
- `https://ifdtraining.org/auth/callback` and `https://ifdtraining.org/reset-password`.
- Development project: `http://localhost:3000/auth/callback` and `http://localhost:3000/reset-password`.
- Preserve any separately approved legacy password-setup redirect paths.

Configure the mileage rate and primary DC in **System Settings**. Assign Office to the intended office personnel in **User Management**; migrations do not choose people.

## Roles and access

| Capability | User (`firefighter`) | MTO | DC | Admin | Office |
| --- | --- | --- | --- | --- | --- |
| Own requests/profile/signature/compensation | Yes | Yes | Yes | Yes | Yes |
| MTO training decision / expense review | No | Yes | No | No | No |
| Final DC training decision / DC-review expense edits | No | No | Yes | No | No |
| Change a final decision or re-sign approved expenses (before course start) | No | Yes | Yes | No | No |
| Personnel / settings / recoverable request deletion | No | Yes | Yes | Yes | No |
| Reset another user's password | No | Yes | No | Yes | No |
| MTO compensation review/signature | No | Yes | No | No | No |
| Office compensation coding/submission | No | Backup | Backup | Backup | Yes |
| City Authorization upload / remove | No | Backup | Backup | Backup | Yes |

All access requires an active authorized session; sensitive actions also enforce password setup and workflow state. Office can read other users' compensation only after signed MTO handoff, and approved undeleted requests/forms for City processing. Requesters can download their own City files but cannot upload. Office has no general administration power.

The primary DC setting controls routine review **email**, not DC signing eligibility or backup review queues. Until selected it preserves all-active-DC emailing. **Approval routing** in System Settings adds a primary MTO (review emails only; other MTOs remain backups), a primary Office person (Office badge plus Office emails; other Office users process quietly) and the Fire Chief (recorded only). An empty choice means everyone in that role. Office-stage badges never go to Admin/MTO/DC backup processors.

## Workflow and documents

Requests follow `draft → pending_mto → pending_deputy_chief → approved`. Either reviewing role may deny or return for correction; resubmission restarts MTO review with the original request number. Legacy `submitted`/`cancelled` values may exist; do not assume every enum value has a current user-facing transition.

Database-assigned identifiers use `LastName, FirstInitial, CourseName, Year.Sequence`; drafts display Draft. Ownership uses personnel UUID. Saved name/badge/account email and request contact email serve different purposes; contact edits never change ownership.

Approval/denial signatures use reserved, immutable actor metadata, private PNG copies and verified bytes before service-only completion. Returns require comments but no signature. MTO (MTO review) and DC (DC review) expense edits require a reason and produce history; they are not approval. Before the course start date, MTO or DC may switch Approved ↔ Denied or re-sign edited expenses on an approved request; each is a new signed action with a reason (D27). Decision changes email the requester as usual; an expense re-signature does not. Switching to Approved goes to the other role's queue if that role has no current approval.

The approved packet consists of the Training Request, separate TAL, conditional Academy Registration and audit/continuation pages. Do not promise exactly two or three physical pages. Source templates:

- `lib/pdf/templates/training-request-form-2026.pdf`
- `lib/pdf/templates/tal.pdf`
- `lib/pdf/templates/academy-registration.pdf`
- `lib/pdf/templates/training-compensation-2026.pdf`

Training header and Travel Authorization are embedded unchanged. TAL/Academy fields use the authorized saved data and snapshots. Academy payment fields remain blank. PDFs are flattened; saved signatures are not live references to personnel profiles. Approved training packets can be regenerated through authorized retry using historical inputs; compensation signed revisions and City upload history are versioned.

Private buckets: `personnel-signatures`, `training-request-signature-snapshots`, `training-request-packets`, `training-compensation`, `city-authorizations`. Never make them public as a download fix. File routes check role/ownership and hashes. The original staff signature store normalizes PNGs; uploaded signatures are limited to 1 MB and validated dimensions of 150×50 through 2000×1000.

Compensation: requester signs → MTO signs/returns → Office codes and marks Submitted. Stored final key stays `completed`. Current rate freezes on each requester submission; historical training-rate snapshots are separate. See [workflow details](docs/training-compensation.md).

City: new signed DC approval creates a parallel pending Office task; private upload completes it. Old approved requests can receive manual attachments without a backfilled queue. Requester approval email does not wait for this upload. See [workflow details](docs/city-authorizations.md).

## Email and password recovery operations

Two independent email systems must be configured:

**Training-request email worker** — `send-training-request-notifications`, deployed separately from Vercel. Its required environment names are:

| Name | Purpose |
| --- | --- |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Project-provided server credentials |
| `RESEND_API_KEY` | Sending-only credential restricted to the authorized domain |
| `RESEND_FROM_EMAIL` | Approved sender, currently `IFD Training Portal <notifications@ifdtraining.org>` |
| `APP_BASE_URL` | HTTPS origin used for protected request links |
| `NOTIFICATIONS_ENABLED` | Delivery switch; keep false while preparing a new environment |
| `NOTIFICATIONS_START_AT` | Explicit UTC activation cutoff; prevents historical backlog delivery |

Keep gateway JWT verification enabled; the handler also verifies service-role authority. A browser/user token must not dispatch mail. The transactional outbox deduplicates action/recipient events, checks current stage and eligible recipient, skips stale alerts and retries temporary errors. Provider acceptance recorded as `sent` does not prove inbox receipt.

The worker sends MTO/DC review, correction, denial and approval mail. Only final approval attaches a ready, hash-checked approved PDF and requester-responsibility instructions. It also sends Office alerts for new City Authorization tasks and MTO-signed compensation packets to the primary Office person, or to all Office users if none is chosen. These alerts are skipped if the task is no longer awaiting Office.

The one-minute scheduler is `supabase/ops/schedule-training-notifications.sql`. Before running it, configure the Vault entries `training_notifications_project_url` and `training_notifications_service_role` privately. Never paste a key into SQL source. For a new environment, approve a controlled recipient/test, verify delivery, then enable the switch/schedule with a suitable cutoff. Pause mail with NOTIFICATIONS_ENABLED=false without disabling request processing.

**Account recovery/legacy setup email** — Supabase Auth SMTP, configured separately. Recorded production setup uses Resend SMTP, host `smtp.resend.com`, port 465, username `resend`, and sender `notifications@ifdtraining.org`; store the restricted key only in Supabase SMTP settings. Check current provider documentation before changing those settings.

Use `supabase/templates/recovery.html` as the Reset password template and preserve its legacy-setup fallback. The new link opens a confirmation screen; an explicit POST consumes the token. Successful recovery-specific verification creates a signed 30-minute proof bound to account and session. Ordinary OTP/password sessions are insufficient. On success the user signs out and signs in with the new password. Replace older incompatible emails by requesting fresh ones. A real-user reset test must leave password entry to the user and verify old-link reuse fails.

## Tests and checks

Run from the repository root:

```bash
npm run lint
npx tsc --noEmit --incremental false
npm test
npm run build
git diff --check
```

The test script uses Node's test runner with tsx and an **explicit test-file list**. Add new files to `package.json`. Application TypeScript excludes `*.test.ts` and `supabase/functions`; execution of tests does not imply static type-checking of every test.

Check portable email modules separately:

```bash
npx tsc --noEmit --strict --target es2022 --module esnext \
  --moduleResolution bundler --allowImportingTsExtensions --skipLibCheck \
  supabase/functions/send-training-request-notifications/handler.ts \
  supabase/functions/send-training-request-notifications/email.ts \
  supabase/functions/send-training-request-notifications/attachment.ts
```

This does not certify the Deno entrypoint/platform deployment. PGlite tests exercise migration chains, RLS and actual workflow functions against synthetic data; mocked Auth/Storage and browser previews cannot prove live email/storage behavior.

For PDF rendering install Poppler (`pdftoppm`) and usable system fonts. Render helpers return without raster verification when Poppler is absent, so inspect the log/environment, not just the skip count. To inspect source fields and generate synthetic previews:

```bash
node --import tsx scripts/inspect-pdf-fields.ts
node --import tsx scripts/inspect-pdf-field-rects.ts
node --import tsx scripts/render-approved-packet-fixture.ts
```

If a restricted macOS environment has Fontconfig errors, create a temporary local configuration with system font paths and a writable cache, then pass FONTCONFIG_FILE:

```bash
mkdir -p /tmp/ifd-font-cache
cat > /tmp/ifd-fonts.conf <<'EOF'
<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd">
<fontconfig><dir>/System/Library/Fonts</dir><dir>/Library/Fonts</dir><cachedir>/tmp/ifd-font-cache</cachedir></fontconfig>
EOF
FONTCONFIG_FILE=/tmp/ifd-fonts.conf npm test
```

Use platform-appropriate font directories elsewhere. These files are local workarounds, not secrets or repository dependencies. File-sync-created duplicate generated `.next/types/* 2.ts` files have previously broken checks; inspect/move aside generated duplicates and regenerate types rather than modifying source or weakening tsconfig.

## Deployment and rollback

Production identifiers (not credentials): Supabase project `dnvowshtloojgnerxydx`, dashboard name `ifd-training-portal-dev`, branch **main PRODUCTION**; Vercel `kevins-projects-fb9d1826/ifd-training-portal`. The “dev” label is misleading: do not treat it as disposable. The canonical domain is ifdtraining.org; registrar/DNS is Porkbun.

1. Review Git diff, exact migrations, assumptions and verification results with the user; obtain approval for the concrete release.
2. Check remote `main` against the intended base. Commit only reviewed, relevant files. Preserve unrelated work.
3. Install missing approved migrations in order and verify constraints, RLS, function grants and private buckets before dependent app code.
4. Deploy changed Edge Function code separately with existing JWT verification and secrets retained. Update SMTP/template/Vault/schedule only if part of the approved release. The repo currently has no complete Supabase CLI configuration; configure/link a known project before using the CLI, and reconcile manual migration history first.
5. Push the reviewed commit to `main` to trigger Vercel. Confirm deployment success for that exact SHA and verify the canonical domain.
6. Check authorized live pages/API behavior without altering real approvals/claims or sending unapproved mail. Check PDF templates are included in server bundles when renderer dependencies change.
7. Update PROJECT_STATUS and relevant feature docs with migration/deployment evidence, limitations and remaining acceptance.

Rollback should prefer reverting the website release while preserving additive database structures and immutable records. Analyze compatibility before reverting functions; never drop historical tables/buckets or erase signatures as rollback. Email can be paused independently. Reset scripts in `scripts/` are privileged support tools, not routine setup/test commands.

The November 19 production release and November 21 local verification are recorded in PROJECT_STATUS. This README is not a claim that live integrations were retested during the documentation handoff.
