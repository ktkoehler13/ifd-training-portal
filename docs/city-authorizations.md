# City Authorizations

After a new signed Deputy Chief approval, the request remains Approved and a separate City Authorization task is created atomically. Office users see a dashboard action badge and a bold entry in City Authorizations → Requiring My Action. Admin, MTO and Deputy Chief users have backup processing access without an Office-stage action alert.

On the approved request, select a PDF, PNG or JPEG (up to 4 MB), then **Upload City Authorization**. After the private file is stored and its bytes verified, the workflow records the uploader and timestamp, marks the Office step complete and clears the action alert. The request and its authorization remain accessible in Authorization Uploaded and All. Revisions retain earlier files. Requesters can download their own authorization but cannot upload it.

## Removing a wrong file

Before uploading, **Remove** next to the selected file clears the choice. After uploading, Office and administrative backups see **Remove** on each uploaded file and must confirm with **Remove File**. Requesters can't remove files.

A removed file disappears from the request and can't be downloaded. Its private object and file row are kept, with the remover and time recorded, and Office and backups see it under **Removed Files**. If other files remain, the task stays Authorization Uploaded. If none remain, it returns to Awaiting Office, the Office action alert returns, and a new upload completes it again. Removal uses the same version check as uploads, so a stale page must reload first. It needs migration `20261121120000_city_authorization_file_removal.sql`, which relaxes the pending-state check, allows only the one-time removal marking on file rows, hides removed rows from client reads and adds the service-only `record_city_authorization_file_removal` function.

## Cutover and access

Production installation was completed and verified November 19, 2026 with commit `ccc7e5a`. See [PROJECT_STATUS.md](../PROJECT_STATUS.md) for evidence and outstanding live acceptance; the instructions below also describe setup for another environment.

- Apply `20261119180000_city_authorizations.sql` after `20261119160000_compensation_current_mileage_rate.sql` and `20261119170000_office_application_role.sql`, before deploying the website changes.
- There is no historical backfill: only signed DC approvals after installation create pending tasks. Existing approved requests can still receive a manual upload from their request details, without creating a historical action backlog.
- Office gains read-only access to approved, undeleted requests, their approval history and approved PDF packets for City processing. It cannot edit requests, approve training, delete requests, manage accounts or change settings.
- Pending, denied and deleted requests do not permit City Authorization uploads or downloads. Deleting a request hides its task and files; restoring it restores their prior visibility and pending/completed state.
- The shared Office queue is separate from compensation coding. This change adds portal action alerts, not a new email notification. Existing requester approval emails are unaffected.
- The Training Request, Travel Authorization, TAL, Academy Registration layouts and all immutable signature/approval snapshots are unchanged.

## Storage and integrity

`training_request_city_authorizations` holds the workflow state and version. `training_request_city_authorization_files` records immutable file revisions, SHA-256 hashes and uploader snapshots. A private `city-authorizations` bucket has no client storage policies. Authenticated server routes check the active user, completed password setup, role/ownership and current request status for each action. Only Office and administrative backups can upload; requesters can read their own files.

Uploads use unique paths without overwriting. A service-only transaction validates the active actor, request status and expected version before recording the verified file and completing the task. Concurrent/stale uploads cannot replace a newer revision. Failed verification does not complete the step. An ambiguous database response retains the private object so a potentially committed revision is not deleted; reloading reconciles its status. Unreferenced objects from failed attempts are inaccessible through download routes.

## Verification

- Full migration-chain database tests exercise actual signed DC approval, new-only queuing, denial exclusion, historical manual upload, role permissions, RLS, read-only Office access, immutable revision history, stale uploads and deleted/inactive cases.
- Server tests cover authentication, file limits/type checks, storage failure, byte verification, ambiguous responses, requester download authorization and private file integrity.
- Packet-access tests cover Office's approved-PDF read permission without granting regeneration or training approval privileges.
- Browser verification uses the real components with isolated sample data; it does not submit live requests or upload real City documents.
