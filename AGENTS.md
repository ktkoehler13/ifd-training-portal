# Instructions for coding agents

## Start here

1. Read [PROJECT_VISION.md](PROJECT_VISION.md), [PROJECT_STATUS.md](PROJECT_STATUS.md), relevant [DECISIONS.md](DECISIONS.md) entries and [README.md](README.md) before beginning work. Follow the linked feature documents in `docs/` for the area being changed.
2. Inspect Git status/diff and recent history. Identify existing user work and the actual repository root. Do not overwrite unrelated changes. The application lives at the root of **this repository**; parent chat workspaces and sibling clones are not required.
3. Read the actual route, domain code, latest applicable migrations and tests. Migrations supersede earlier versions of functions; looking at only the first migration is insufficient.
4. Preserve the original project vision unless the user explicitly authorizes a change. Distinguish confirmed requirements from implementation choices and questions; do not convert assistant suggestions into user requirements.

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Architecture

- Next.js App Router 16.2.10 / React 19.2.4 / strict TypeScript / Tailwind CSS 4.
- `app/`: pages and protected route handlers; `components/`: UI; `lib/`: domain validation, persistence mapping, server workflows; `types/`: application records.
- Supabase provides PostgreSQL, Auth and private Storage. Browser reads/draft operations are RLS-scoped; privileged signing, personnel provisioning and document/file operations run through authorized server routes.
- SQL workflow functions enforce transitions, signatures, immutable events and concurrency. A service-role client is not a substitute for authorization; verify actor, ownership/role, state and version before privileged access.
- `lib/pdf/` uses pdf-lib and committed official PDF templates. Generated packets contain immutable signature copies and audit information.
- `supabase/functions/send-training-request-notifications/` is a separately deployed Deno email worker using Resend and a transactional outbox. Auth recovery mail uses separate Supabase SMTP configuration.
- Office compensation and City Authorization are separate workflows. Their current alerts are portal queues/badges; see feature docs.

## Coding conventions and important constraints

- Follow nearby TypeScript/React conventions, named types and `@/` imports. Do not introduce a framework, dependency or formatting sweep to solve a small task.
- Keep server secrets and privileged clients in server-only modules. Never put service credentials in `NEXT_PUBLIC_*`, browser bundles, fixtures, logs or committed configuration.
- Derive actors from active personnel/Auth records, never client role or personnel IDs. Rank is not permission. Office is not a general administrative role.
- Validate on the server and in SQL where invariants must survive direct database calls. Keep client validation for usable feedback.
- Preserve historical rates, identity, approval/signature snapshots and document hashes. Do not regenerate history with a user's current profile signature.
- Training estimates/PDFs use the request's stored rate. Compensation submissions check the configured current rate and freeze it per signed revision. Never conflate the two.
- Keep original header/Travel Authorization artwork and TAL/Academy/compensation source templates. Inspect actual fields/geometry before changing placement. Long text may continue; it must not overlap.
- Database changes require **new ordered migrations**. Do not edit already applied migrations, bypass RLS, erase audit records or backfill historical workflow tasks without authorization.
- Preserve request contact-email versus account-email semantics. Account email changes must keep the existing Auth identity synchronized; do not repair an account by guessing identities or creating a replacement.
- Return safe errors and keep user entries when an operation fails. A timeout/ambiguous completion can follow a committed transaction: reconcile before deleting referenced files or retrying a mutation.
- Keep user-facing language plain. No development banners, database terms or internal troubleshooting details in routine flows.
- Use synthetic data for tests/screenshots. Do not commit real signatures, personnel exports, SSN fragments, receipt files, credentials or reset links. Never submit/approve a real request merely to test deployment.

## Development and verification

- Setup, commands and environment names are in README. Use the lockfile with `npm ci`.
- Add/update focused regression tests for behavior changes; security and workflow changes require real migration-chain/RLS coverage where applicable.
- `npm test` is an explicit Node/tsx file list. Add new tests to that list or they will not run. PGlite runs isolated SQL tests; it is not a replacement for all Supabase Auth/Storage integration checks.
- Run relevant tests before declaring a task complete. For releases or cross-cutting changes run lint, application TypeScript, the full test suite and production build. Type-check the portable email-worker modules separately when they change.
- PDF changes also require generated sample/render inspection, not just passing text tests. Poppler may be absent: report any skipped/no-op rendering honestly.
- Record commands, results, date, runtime and any environment workaround. Separate automated tests, mocked browser tests, prior live checks and current live checks. Never claim email inbox delivery from a provider `sent` status alone.
- Report failures/limitations. Do not loosen checks, suppress TypeScript errors, rewrite source to accommodate generated-cache duplicates or approve claims to make verification pass.

## Git, deployment and handoff

- Maintain logical Git checkpoints. Keep commits scoped and clearly named; inspect staged changes for secrets/unrelated work.
- The established release preference is a concrete review of changes, exact migrations, assumptions and checks before publishing. Obtain publishing authorization if it has not already been given for that release; do not ask again after the same reviewed release was explicitly approved.
- A request for a local handoff commit is **not** permission to push/deploy. Pushing `main` triggers Vercel production. Supabase migrations, Edge Function code, SMTP/template and scheduler settings deploy separately.
- Apply approved additive database changes before dependent website code and verify their effects. Manual SQL installation may not be represented in CLI migration history; reconcile before any bulk push.
- Deployment checks must identify the exact commit and environment, preserve existing records and avoid unauthorized email or account mutations.

## Permanent documentation rules

- Maintain documentation after **every meaningful development task**.
- Update only relevant sections rather than rewriting entire documents.
- Keep PROJECT_STATUS concise; remove obsolete tasks/status statements rather than growing a chronological diary.
- Record significant decisions and known rationale in DECISIONS, not routine implementation details. Label unknown rationale and unresolved decisions explicitly.
- Keep PROJECT_VISION authoritative for user intent; change it only for explicit user-authorized scope changes.
- Update README when setup, environment, runtime, testing or deployment procedures change; update feature docs with affected workflow/security details.
- Leave the project resumable at any time: record current branch/commit, pending work/migrations, commands/results, blockers, precise next steps and acceptance criteria. Documentation must work without this chat or machine-specific output folders.
- Before finishing, report what changed, validation, remaining risks/unknowns and Git/deployment state. Do not claim untested or merely proposed functionality is complete.
