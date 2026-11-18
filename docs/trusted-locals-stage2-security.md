# Trusted Locals Stage 2 security corrections

## Local release candidate

Migration `20261118140000_job_invitation_security.sql` restricts raw jobs to owners, awarded providers and the existing administrators. Public discovery and invited access go through the read-only `jobs_public` projection. That projection checks the current audience and masks the address, coordinates, location note and polygon when exact-location sharing is off. A declined or withdrawn invitation no longer confers job or private-media access. A genuine award remains a separate access path for the winning provider.

Provider inserts require a pending offer on an eligible open job. Offer identity is immutable. Direct client updates cannot accept an offer. Expo and provider web use the existing atomic acceptance RPC, which verifies the requester, locks the job and offer, and retains the existing status and notification triggers. Legacy data is evaluated conservatively: an accepted-looking offer on an open job and a job with competing winners confer no award-based access. Historic rows predate the new write controls and need a read-only aggregate audit before rollout.

Invite creation, viewing, acceptance, decline, withdrawal and re-invitation use database-checked operations. Repeated sends preserve the same active invitation. Re-invitation requires the current closed revision, and responses from an older revision fail. Accepting the invitation leaves the offer and booking workflows independent. Private-media reads use the current invitation and award checks. Bookings have their own participant access and no job invitation dependency.

## Validation

The isolated PostgreSQL 17 replay uses synthetic fixtures, an outer rollback and a minimal Storage catalog fixture. It exercises the guest and authenticated database roles, direct table and view operations, invitation and award RPCs, guarded photo-listing RPC, job confirmation and provider completion. It does not exercise hosted PostgREST, the Storage HTTP endpoint or a signed-in device/browser. The repository suite passed all 283 tests. The provider web production build and both Android and iOS Expo exports succeeded.

## Invite-only galleries

Both job wizards used `jobs.photos` to store legacy URLs from the public `job-photos` bucket. Access checks on job rows could never revoke those URLs. The public job upload flow still uses that bucket. Web and Expo now send invited job gallery uploads through the existing private JPEG media endpoint, which verifies the requester and reads current invitation or award state before serving bytes. The same private gallery supports up to six images, and all selected images commit with the job and invitation in one transaction. Web editing retains existing gallery management. Expo editing can preserve existing photos and add new ones.

Migration `20261118150000_invite_only_private_gallery.sql` blocks attaching legacy URLs to invite-only jobs through direct writes or RPCs. Storage rejects both recognised public upload path layouts for these jobs. The job chat audit found the same public upload path, so invite-only job chats direct photo uploads to the private job gallery and still support text. The existing public-job, listing and booking photo paths remain available.

The hosted aggregate inventory found **0 invite-only jobs with legacy photo references, 0 legacy reference entries, 0 objects under both legacy job path layouts (including thumbnails), and 0 job messages referencing public job photos on invite-only jobs**. No legacy object needed copying or deletion. The migration repeats those checks before enabling its guards and rolls back if the inventory has changed. The aggregate preflight also found no inconsistent invitation owners, competing winners or accepted offers on open jobs.

## Deployment

The linked migration dry run listed only `20261118140000` and `20261118150000`. The local SQL regressions verify atomic gallery rollback, duplicate publication, guest and participant access, direct public Storage-policy denial and decline/withdrawal revocation through the database. They use a Storage catalog fixture. Hosted HTTP checks are recorded separately from local SQL.

### Hosted outcome

- Release commit `df3fc52d7c283b6a5e37e7562beeb667a84e63fb`. The unrelated Photo-to-Job documentation edit and untracked Trusted Locals discovery document were excluded from the commit.
- Supabase recorded both migrations. `job-primary-media` deployed to the existing test project with its existing gateway setting and in-handler bearer checks. The hosted inventory had zero legacy items to move or remove.
- Provider web is live at [dev.ruralconnections.nz](https://dev.ruralconnections.nz). The [Vercel provider deployment](https://vercel.com/rural-connections/difm-rural/D6fPpC91xExrBh8LSkBSje6cFMtC) completed successfully.
- Expo [preview group `143b435b-f53e-49b8-b356-dbcf0d0acac3`](https://expo.dev/accounts/difmrural/projects/difm-rural/updates/143b435b-f53e-49b8-b356-dbcf0d0acac3) was published for Android and iOS from that commit, runtime `1.0.0`.
- Local results were 283 passing repository tests, both rollback-only PostgreSQL security suites, a successful provider web build, and both Expo exports. An initial Next.js build was blocked by a Windows generated-folder permission error and the authorised rerun passed.
- With the approved synthetic requester and provider, hosted HTTP checks verified repeat publication, two-image access, byte checks against the sanitised upload checksum, denial of public Storage uploads, and denial for anonymous callers. Decline and withdrawal denied image access, a fresh invite restored it, and the owner retained access. The signed-in development website showed the invitation and served the image through the web proxy. Requests for the exact private object path were denied through both the public and authenticated Storage endpoints. Synthetic jobs were deleted and their media endpoints denied access afterwards. Physical removal of the detached private test bytes through the existing cleanup worker was not independently verified.
- The approved hosted accounts covered the requester and invitee; unrelated authenticated and awarded-provider cases were exercised by the isolated SQL suite. Android and iOS device rendering was not verified. The detected Android emulator was offline.
