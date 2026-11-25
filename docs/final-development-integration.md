# Final development integration — local review

Branch: `codex/final-development-integration`. Created from deployed Booking Lifecycle baseline `86527a7d5b731db323023f8980fd501d32ba9c6d`. No main merge, push, deployment, publication or remote migration application performed by this task.

## Included history and scope

- Original `ca12d9a123176a9245ed67cd3f4e3ce2884c591a` pricing refinement and `36e3d9b7ba1eb7a9bd393115b7ebe503668bcf35` Chat fix retained unchanged in ancestry. The latter already inherits the former; fast-forwarded to it once rather than duplicating patches.
- Approved security fix `7cb357c` integrated as local cherry-pick `d17ff7d`. Security migration, map SQL tests and hosted opt-in test are identical to their approved source. Imported the complete relevant local/hosted validation helpers that the security commit modifies but the deployed baseline lacks.
- Resolved the documentation conflict by retaining baseline documentation and adding the security review section, updating its expected-duration reconciliation instruction to match this baseline. Missing-helper conflicts resolved using the approved versions.
- Excluded the parent branch's unrelated `.easignore` and browser harness; no full merge of its other history. Existing Property Map security, Photo V1 and other worktrees remain untouched.
- One local-fixture adaptation: the map permission harness supplies `auth.jwt()` from test JWT settings inside its rollback transaction. The older shared booking fixture did not provide that shim. No application, production-schema or permission behaviour changed by the adaptation.

## Confirmed booking presentation

Confirmed/in-progress grazing uses a nonwrapping vertical footer, explicit 100% width, primary Chat first and secondary Complete booking beneath it. Both mobile platform branches, participant roles, real Button text/colour/accessibility label and unchanged Chat route are regression-tested. The precise physical-device artifact still requires a device recheck, as documented in the Chat fix.

Pricing uses saved booking terms, retains weekly cost and older stored one-week estimates, hides the duplicate base estimate when appropriate, and shows the exact approved smaller, normal-weight, left-aligned pricing explanation immediately below the total. Requester/provider mobile and web tests verify these details. No calculation/snapshot change.

## Validation results

- Complete `npm test`: **708 passed, 0 failed**.
- Local `booking-duration-permissions.ps1 -Lifecycle`: passed, including optional old-client fields, duration validation/immutability, actual booking RLS, acceptance, selected-booking completion/relist/close, independent reviews and duplicate protection.
- Local `combined-development-permissions.ps1`: passed, including Property Network private assignments/job links, old/new listing reads, booking joins and exact-location permissions.
- Local `property-map-security.ps1`: passed, including owner read/create/update, assistant read/write denial, independent write guards, invoker RPC restrictions, unrelated-user/guest denial and geometry validation. All SQL fixture changes rolled back and the local server was stopped afterward.
- Provider and public web production builds: passed using webpack, including TypeScript. Existing provider account/help JSON-version import warning remains.
- Android and iOS exports: passed with two Metro workers.
- `git diff --check`: passed.

The first concurrent validation run exhausted Windows sandbox resources/temporary storage, causing build/export and SQL-harness launch failures. Sequential web builds, rollback SQL reruns and the two-worker export completed successfully. No code changes were needed to resolve resource errors.

## Migration readiness — remote state changed during audit

Expected duration `20261125140000_booking_expected_duration.sql` is byte-identical to baseline (Git blob `8e09a8e75fd7cf31880e99878285eba672144938`) and remains recorded as applied remotely.

Initial read-only migration list/dry run showed ONLY `20261125200000_private_property_map_assistant_read_guard.sql` pending, as requested. During subsequent read-only checks, the remote schema first exposed the restrictive read policy, then its migration ledger entry appeared. This task did not execute an apply, repair, policy DDL or migration-state mutation. Record this as an external/concurrent remote change, not an application by this task.

Final remote list records BOTH migrations applied; the final include-all dry run reports **Remote database is up to date** (zero pending). The read policy is SELECT, RESTRICTIVE, PUBLIC, `NOT is_assistant_token()`. Existing INSERT/UPDATE/DELETE assistant guards and permissive owner policy remain present; anonymous SELECT and authenticated DELETE grants are absent.

Do not reapply the security migration or repair the ledger merely to make it appear pending. Its file remains identical to approved `7cb357c`. Confirm the same state again immediately before any later deployment. No new migration is introduced by this integration.

## Coordinated deployment sequence — requires approval

1. Review this integration commit. Recheck clean source, current Vercel authentication/team and existing provider/public project IDs, Expo project/channel/runtime and currently deployed rollback identifiers.
2. Re-read Supabase development ledger and dry run. Both expected duration and map security are currently applied; expect zero pending and apply neither again. Stop and review unexpected drift rather than pushing migrations blindly.
3. Retain the current privacy-compatible web deployments and Expo Preview group for rollback. Retain nullable duration columns, recorded booking data and the assistant map read guard during any client rollback.
4. Deploy this same reviewed commit to the existing provider web and public web projects; verify READY/source metadata and established aliases. No project recreation or relinking; no new Edge Function implementation is included.
5. Publish a single Expo Preview update group for Android/iOS using the existing preview environment/channel and compatible runtime. Record group and platform IDs and verify clean-source commit metadata/channel routing.
6. Smoke-test owner app map save/reload and denial to OAuth assistant, unrelated member and anonymous caller; run hosted opt-in map checks only with authorised test accounts/tokens. Do not disclose tokens or overwrite an existing map.
7. On installed narrow Android/iPhone devices verify both an already-confirmed booking and pending-to-confirmed transition: full Chat label/width, Complete booking below, correct Chat destination, pricing explanation and with/without-duration estimates. Test acceptance/completion/relist/reviews and Property Network/Notifications/discovery regressions on development data.
8. Stop on authentication, migration, compatibility or deployment failure. Roll back client deployments if needed while keeping data and privacy guards intact.

## Recommendation

Ready for local review and, after explicit approval and renewed preflight, coordinated client deployment. No migration is pending at the final remote check. Hosted/physical-device validation remains a deployment-time/manual requirement; no release was deployed by this task.

Evidence under the repository's ignored `.expo` directory: `final-development-tests.log`, `final-development-booking-sql.log`, `final-development-combined-sql.log`, `final-development-map-sql.log`, `final-development-provider-build.log`, `final-development-public-build.log`, `final-development-export.log`, initial/final migration list and dry-run logs, and `final-development-remote-drift.log`.
