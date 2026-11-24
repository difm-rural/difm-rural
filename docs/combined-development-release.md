# Combined development release — Property Network + Find Local Help

Prepared 24 November 2026. **Local preparation only; no deployment approval is implied.**

**Subsequent authorised compatibility/deployment work:** see `listing-location-legacy-compatibility.md`. It supersedes this report's earlier raw-table-denial migration/old-client gate with protected private storage and coarse legacy reads. The original integration results below remain historical evidence for `1d5976d`.

## Integration tree

- Branch: `codex/development-property-help-integration`.
- Isolated worktree: `C:/Users/OEM/difm-rural/.expo/development-property-help-integration`.
- Baseline: deployed development commit `834dfd22ac529f6d1c800dc76d3ec58a6a04b81c`, containing Property Network Integration and its posting follow-up.
- Integrated feature: `d3afddba1f407b848d6e2aa98c1a17c722773324` (Find Local Help UX Release 1).
- The integration commit has both source commits as ancestors. Its hash is available from this branch's log and the delivery message.

The merge automatically retained both versions of the shared-file changes in `provider-web/src/app/work-actions.ts` and `tests/web-booking-detail.test.mjs`. No textual conflict remained. Property-origin validation, post-success association, duplicate prevention and booking-confirmation/query changes are all present. Main, source feature branches and unrelated local files/worktrees were not changed.

Strict Deno validation exposed two integration compatibility issues. They were corrected with **type-only changes**, not business logic: use an explicit `.ts` extension for the `ListingKind` import in `shared/categories.ts`, and declare the existing job status/date fields in the connector's `JobRow` type. `rc-mcp` then passed its actual strict Deno check.

The only new integration test support is `tests/support/combined-development-permissions.ps1`. It reuses the existing local PostgreSQL fixture, applies both actual migration definitions inside one transaction, executes the existing permission matrices while both are active and rolls back all DDL/data. It does not connect to remote Supabase or create new infrastructure.

## Combined verification

| Check | Result |
| --- | --- |
| `npm test` on the final combined source | **557 passed, 0 failed, 0 skipped** |
| Standalone listing-location SQL permission runner | **Passed**, rolled back |
| Both migrations + Property Network and privacy permission matrices in one local transaction | **Passed**, rolled back |
| Provider web production build, including TypeScript/page generation | **Passed** (`npm run build -- --webpack`) |
| Public web production build, including TypeScript/page generation | **Passed** (`npm run build -- --webpack`) |
| `deno check --config supabase/functions/rc-mcp/deno.json supabase/functions/rc-mcp/index.ts` | **Passed** |
| Android and iOS local Expo export from final combined source | **Passed**, nothing uploaded |
| Git whitespace/conflict checks | **Passed** |

Webpack is the supported production-build mode used here because the isolated worktree reuses installed dependencies through junctions outside its Turbopack root. No application build configuration/dependencies changed. Provider web retains the existing non-blocking Account Help package-version import warning.

### Functionality confirmed by automated/local SQL checks

- Existing booking creation, quantities/minimums/capacity, pricing snapshots, provider/requester responses and guarded withdrawal/cancellation.
- Exact saved-record confirmation navigation; duplicate-tap, uncertain-response retry, guest sign-in resumption, cancellation and failure handling.
- Provider assignment persistence, duplicate prevention, transactional replacement, preservation of Needs help, removal and invalid-replacement rollback.
- Owner-only active/completed job associations, existing-job navigation, automatic association only after successful property-origin posting (including public/invited/photo paths), ordinary posting and cancellation/failure isolation.
- Unrelated owner/provider/anonymous/assistant denial for private network/job links. Public and pending viewers cannot read exact listing locations; owners and accepted participants retain access, including closed-listing history.
- Mobile and web discovery/location/filtering, public listing consumers, profile/relationship and Enquire/Chat tests. The real connector functions are tested against `services_public`; the actual Edge Function import graph also passes Deno.

These are automated/local confirmations, **not claims of hosted or physical-device smoke tests**.

## Migration review and readiness

1. `supabase/migrations/20261124090000_property_network_job_links.sql` — **already applied in development**, reconfirmed through read-only linked migration history. The remote job-link table and provider-replacement RPC exist. Do not reapply it.
2. `supabase/migrations/20261124120000_listing_location_privacy.sql` — **pending, unchanged from the reviewed UX commit**. Remote metadata confirms the locality/admin helper dependencies and required listing columns exist; its new view/helper are still absent. No remote schema/data was changed during preparation.

The migrations modify independent objects and have no mutual schema dependency. The combined transaction tests validate their coexistence. The privacy migration is transactional, preserves raw stored values, adds SELECT-only `services_public`, masks address/pin fields and restricts raw listing reads to existing owners/admins and accepted requesters. Booking/network write and lifecycle rules remain in place. The security-barrier definer view deliberately supplies safe public fields despite raw-table RLS. Re-review its schema-time projection if other changes add private columns before deployment.

**Migration readiness:** locally validated and ready for an approved controlled-development rollout, subject to a fresh target/history check and compatibility strategy. Do not apply it as a standalone backwards-compatible migration.

## Compatibility and remaining gates

- Existing verified Android/iOS Preview updates at `834dfd2` use runtime **`1.0.0`**. App version/runtime policy, native configuration and dependencies are unchanged, so matching installed Preview binaries can receive this release through EAS Update. Confirm actual device runtime/update IDs.
- Older embedded/cached/open/offline bundles continue reading raw `services`. They may lose public discovery, listing context and booking/messaging subjects once restrictive RLS activates. Publishing an OTA does not synchronously replace them, and there is no new forced-update gate.
- Both new mobile/web clients and the shared assistant implementation require `services_public`. The current single privacy migration creates the view and hardens raw access together. This requires a coordinated testing window accepting temporary old-client unavailability, or a separately reviewed staged/additive migration plan. The staged alternative has **not** been implemented here.
- Provider web, public web and the existing `rc-mcp` function must all be updated or explicitly gated in the same coordinated release. Updating only provider web and Expo leaves old consumers incompatible.
- Remaining live checks after explicit migration/staging approval: PostgREST's inferred `bookings` → `services_public` embeds and schema-cache refresh; real owner/admin/requester/provider/anonymous/stranger access; existing-account booking and Property Network end-to-end smoke tests; narrow iPhone/Android rendering and confirmation that the new OTA is actually running.

**Deployment recommendation:** integration is ready for review; do not perform an unattended/zero-downtime rollout. Approve an explicit old-client strategy and controlled staging/testing sequence first. There are no remaining source merge conflicts or known failing automated checks. Hosted and physical-device acceptance remain outstanding because no deployment or pending remote migration was authorised.

## Coordinated sequence — only after deployment approval

1. Use the integrated commit from this branch, never an isolated feature snapshot that omits the other release. Record the exact hash, current web/public/assistant deployments, Expo group and migration history. Reconfirm the linked development target (`opagkgfxmjqmnvhrcris`), existing Vercel `rural-connections / difm-rural` project and development alias. Preserve unrelated work; no project relinking or migration-history repair.
2. Choose the older-client strategy. For the current migration, pause development testing, stop active test sessions and schedule forced tester restarts/reloads after publication. If uninterrupted old-client access is required, review and implement additive-view-first / client-update / restrictive-policy-last staging before release instead.
3. **Supabase:** verify only the approved privacy migration is pending in the combined tree, record backup/restore arrangements and apply it. Leave the recorded Property Network migration intact. Verify safe public reads, accepted/owner/admin raw access, closed history and actual PostgREST embeds. Stop immediately on failure.
4. **Provider web:** deploy the exact integrated source to the existing development project, verify Ready state and alias. Update/verify **public web and `rc-mcp`** under the same release approval (or keep them gated). Smoke discovery, requests/confirmation, Activity/Chat, provider assignment and property-origin posting. Do not publish mobile following a web/migration failure.
5. **Expo Preview:** publish one group for Android/iOS using the existing Preview environment/channel. Record both IDs, group, source commit and runtime. Make supported test devices load the new update; verify the running ID rather than assuming publication means installation.
6. Run the mobile/web smoke checklist with existing requester/provider accounts and existing listings (including grazing), then the cross-account privacy checks. Confirm ordinary posting, linked historical/active jobs, Needs help auto-linking, replace/remove/persistence, quantity/pricing, duplicate prevention, withdrawal versus accepted cancellation, Enquire/Chat and profile/reviews. Resume testing only when compatible consumers are verified. Stop/report any failure.

## Rollback

- Prefer a privacy-preserving forward fix. Keep the safe view available for new bundles already downloaded; no business data needs deletion.
- Rolling back just web/Expo/assistant to old raw-reading code while restrictive RLS remains is unsafe. A privacy-compatible rollback artifact must be separately prepared/tested; none is claimed to exist now. Keep testing paused if necessary.
- Removing the restrictive policy restores old clients **and reopens the exact-location exposure**. It is not an automatic rollback and requires explicit privacy-impact approval. Do not drop the view/helper while compatible clients may run.
- Never roll back the already-applied Property Network migration or remove provider assignments/job links/bookings to undo presentation changes. Keep migration history accurate; use a reviewed forward correction rather than `migration repair`, database resets or destructive restore.

The original feature reports and `find-local-help-ux-1-deployment.md` remain useful background; this document is the current combined-release status.
