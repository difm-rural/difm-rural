# Property Network integration

Branch: `feature/property-network-integration`, based on main `e54a0c5`. All changes are local for review.

## Inspection and minimal design

Existing private property_network_services/property_network_providers records already associate real member IDs with maintenance services inside an area. My People already combines saved providers and completed-work connections; My Customers is the reverse requester relationship. Existing link/remove RPCs, public profiles, job history, posting wizard, invitation picker and owner RLS are reused.

No additional provider-profile or work-history system is introduced. A new private join table associates an owned job ID with an existing property area. Associations are explicit: Buildings & Maintenance or any other broad category never chooses an area. Existing per-service provider assignments are presented within each area rather than adding a competing area-assignment model; multiple existing helpers remain supported.

## Implemented

- Native and web provider pickers label saved/worked relationships as My People; linked members display relationship counts or saved/private-link context. Assignment controls are available for Needs help services as well as sorted services. Change provider selects a replacement atomically; Remove link retains the existing confirmation and does not remove the person from My People. Leaving an area unassigned remains valid. Assignments do not send invitations or notifications.
- Jobs for this area lists explicitly linked existing jobs with title, current status, posted date and the accepted provider name where available. Job links open existing JobDetail / /jobs/:id destinations. Owners can link their own open, accepted or completed jobs; unlinks remove only the private annotation. Cancelled jobs cannot be newly selected, but previously linked jobs retain their current state if later cancelled. Deleted jobs cascade out of associations.
- Needs help exposes Post a job both in the overview and within a service. The existing posting flow receives an editable title/category and area/service context. Linked providers offer Post a job for this provider using the existing invited-job flow; Invite to job for existing jobs is retained. Nothing is posted or sent merely by selecting an assignment or opening the wizard.
- Existing Home My Network access and My Property context are retained. Provider web adds My Network to its ordinary sidebar/menu. Existing role-specific My People/My Customers navigation remains intact.
- Counts distinguish maintenance areas needing review from areas marked Needs help; the service-level help list is labelled separately. Unreviewed areas no longer produce an unqualified Nothing needs help message. Provider empty results describe only their group.

## Migration (requires later approval; NOT remotely applied)

`supabase/migrations/20261124090000_property_network_job_links.sql` adds:

1. property_network_jobs(owner_id, area, job_id), with composite primary key, area/owner and job foreign keys, cascade cleanup, owner/job-author checks and restrictive assistant-token policies. Authenticated owners receive only select/insert/delete; anonymous access is denied. Job content is still read through jobs_public with requester_id filtering.
2. replace_property_network_provider: a security-invoker RPC that locks the owner's service row, validates the old assignment, invokes the existing link_property_network_provider RPC and removes only that old private link. Failure rolls back the transaction; replacing a provider retains Needs help when that was the current service status. No connection, profile, job, offer or notification records are created/updated by replacement.

The migration is needed before job associations and the new replacement action work against a shared backend. Missing/unavailable job-link storage produces a Retry message; it does not hide or overwrite the rest of Property Network.

## Files changed

- `shared/propertyNetworkJobs.ts`: owned job/link loading, eligible choices, counts, posting context, mutation boundaries.
- `src/components/PropertyAreaJobs.js`: compact native area-history/link selector and existing-job navigation.
- `src/screens/PropertyNetworkScreen.js`: My People context, atomic change selection, Needs help posting, counts and wording.
- `provider-web/src/app/property-network/property-area-jobs.tsx`: matching web history/link selector.
- `provider-web/src/app/property-network/property-network.tsx`: matching relationship, posting, replacement and count controls.
- `provider-web/src/app/property-network/property-network.css`: wrapping for help rows with posting actions.
- `provider-web/src/app/jobs/new/page.tsx` and `job-form.tsx`: bounded editable title suggestion through the existing form; original edit/repeat seed precedence retained.
- `provider-web/src/components/app-shell.tsx`: My Network navigation entry.
- Migration above.
- `tests/property-network-integration.test.mjs`, `tests/property-area-jobs-ui.test.mjs`: shared/data, posting-wizard and native job-row interaction regressions.
- `tests/property-network.test.mjs`: updated intentional wording expectations.
- `tests/sql/property-network-integration-local.sql`: disposable local-DB assignment/ownership tests.
- This report.

## Validation

- `npm test`: **515 passed, 0 failed**.
- `npx tsc --noEmit --project provider-web/tsconfig.json`: passed.
- `npm run build --prefix provider-web`: production build passed. First sandboxed attempt hit Windows EPERM creating generated .next files; rerunning the local build outside that sandbox succeeded.
- `npx expo export --platform all --output-dir dist/property-network-integration`: Android and iOS Hermes exports passed.
- PostgreSQL 17 isolated local fixture: exact new migration plus existing provider-link schema/RPC tested. Passed assignment persistence, duplicate avoidance, replacement, failed-replacement rollback, Needs help retention, removal, active/completed job linking, rejection of other-owner/cancelled jobs, owner spoofing, and private-network isolation from other owners, providers, anonymous sessions and assistant-token policy context. The fixture uses minimal auth/profile/job scaffolding, not the full hosted Supabase schema or live JWT integration. The local server was stopped afterward. No remote database access/migration application was performed.
- Native job-row tests exercise selection, mutation/refresh, correct JobDetail navigation, unlink and read-failure messages. Existing posting-wizard tests verify editable seeded title and the original create_invited_job RPC. Existing job/lifecycle/privacy/payment tests pass.

## Limitations and phone checks

- No live-account/device smoke test or hosted Supabase migration test is claimed. Physical iPhone/Android, keyboard, screen-reader order and long provider/job labels still require smoke checks.
- New jobs posted from an area retain editable context, but must be explicitly linked back after posting. Automatic linking was avoided to keep posting/acceptance workflows unchanged.
- Existing first-time linking still uses the canonical Sorted/has_provider behavior. Owners can mark Needs help while keeping the provider link; replacement retains that Needs help state.
- The selector pages visible choices in batches of 20; shared loaders paginate all underlying rows. No new search/index/dependency was added.
- Assignment context is saved/worked/private-link metadata, not a new provider rating or verification claim.

## Manual smoke steps (after migration approval in a test backend)

Requester A:

1. Home → My Property → My Network. Choose an area and a service. Choose from My People, select a saved/previous provider, and refresh. Check the same real identity and relationship summary remain. Verify the provider received no assignment notification.
2. Change provider, select another member, refresh; only that assignment changes. Cancel a replacement and verify no change. Remove the link and verify the provider is still in My People. Leave an area unassigned.
3. Mark two services in one area Needs help and leave another area partly unanswered. Verify one area marked Needs help, correct areas-to-review count, two service gaps and non-contradictory empty wording.
4. Link one owned accepted job and one owned completed job; refresh. Check titles/statuses/dates/accepted providers. Open each job and confirm the original job ID/details. Unlink and verify the job/history remain unchanged. A generic Buildings & Maintenance job must not appear in any area until explicitly linked.
5. Post a job from Needs help; verify editable title/category/area context. Change suggested details and cancel with no job created. Repeat through the existing invited-job option and verify invitation is sent only when that flow is submitted. Link the resulting job explicitly if wanted.
6. Repeat core assignment/link/post steps in provider web; check My Network in normal navigation and the My Property context.

Provider / requester B:

1. Verify My Customers still lists requesters while My People lists providers saved/worked with, using existing roles.
2. Sign in as a different member and verify A's network, assignments and job links are not visible or mutable. Their own network remains independent. Check assigned provider sees no notification from A's private assignment.
3. Exercise an existing provider offer, arrival confirmation, payment acknowledgement/Undo and completion/review path. Property annotations must not change those transitions.

No merge, push, deployment, publication or remote migration application performed. Unrelated local work preserved.
