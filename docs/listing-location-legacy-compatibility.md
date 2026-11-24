# Listing location privacy — legacy-compatible development rollout

This supersedes the raw-table-denial rollout gate in the earlier combined-release report at `1d5976d`. The original privacy migration was still unapplied, so its existing filename is revised rather than adding/reapplying a deployed version.

## Compatibility fix

Older Expo Preview `834dfd2` reads `services` directly in discovery, listing/profile screens, messaging and booking embeds (`service:service_id(*)`, `services(*)`). It already supports `service_latitude` / `service_longitude` as a nearby-distance fallback. Denying these rows would break the old bundle; column masking cannot be implemented by RLS alone.

The revised `20261124120000_listing_location_privacy.sql` keeps the actual `services` table, keys, FK relationships and write routes. Exact locations are atomically copied into `service_private_locations`, protected by RLS and SELECT-only grants for authenticated owners/admins or accepted requesters. Anonymous users have no access. All client writes still go through the existing listing ownership rules and a fixed-search-path trigger; the private table is not client-writable.

Public/legacy `services` now physically holds locality-only `location_name`, null primary coordinates/directions and 0.1-degree rounded service-area coordinates. The trigger enforces this for every insert/update. Thus legacy discovery, booking joins and approximate distance remain available without exposing private addresses or exact pins. `services_public` retains its updated-client contract, including approximate discovery fields. Owner/participant booking history retains coarse listing context after closure, while exact access follows accepted lifecycle permissions.

Updated owner editors hydrate from the protected table; updated accepted booking details read it directly. Legacy owner screens display the coarse location until updated. Re-saving that coarse response preserves the exact private value; explicit changed addresses still update privately. Re-saving a hydrated unchanged address preserves omitted pins. Conflicting/retried inserts cannot overwrite another listing's private data. Table identity and booking FK joins are unchanged; no second listing/booking lifecycle is introduced.

This does not remove data already cached before the privacy fix, and does not turn approximate distance into an exact location. Private requester-supplied booking locations remain in the existing participant-protected booking records.

## Verification before deployment

- Full suite: **561 passed**; focused booking, legacy compatibility, Property Network posting and connector suite: **81 passed**.
- Standalone privacy SQL and combined Property Network + privacy SQL permission matrices: passed inside rolled-back local transactions.
- SQL covers legacy/new discovery, legacy booking joins, pending/accepted/withdrawn/stranger/anonymous access, owner editing, coarse echo preservation, exact-address changes, duplicate/conflicting inserts, RLS rejection rollback, private FK insert/delete and closed history.
- Both web production builds, strict Deno `rc-mcp` check and Android/iOS exports passed.
- No native dependencies/runtime changes. Existing Preview runtime `1.0.0` can receive the update, but old bundles no longer require immediate replacement for basic listing/booking reads.

## Coordinated deployment and rollback

Use the committed compatibility revision on `codex/development-property-help-integration`; do not merge main. First verify current Vercel credentials and both existing project/team identities. Confirm Property Network `20261124090000` is already applied and only privacy `20261124120000` is pending. Record existing deployment IDs and an integrity fingerprint of original exact locations without printing their contents.

Then apply the revised privacy migration; verify its history and preserved private-data fingerprint. Deploy provider web and public web to their existing projects, deploy `rc-mcp`, and publish one Preview group for Android/iOS. Stop on any failure before dependent steps. Validate live PostgREST legacy and updated embeds, side-table permissions, owner editor hydration, provider/public web and existing-account private network/job-link workflows. Physical device visual checks remain separate from API/headless smoke tests.

Retain the immutable Git compatibility commit, successful Vercel deployment IDs, Edge Function version and Expo group as the first privacy-compatible release baseline. Keep previous artifacts for diagnosis, but do not promote a pre-compatibility build as a full-functionality rollback without testing its coarse-location behaviour. If this first coordinated release fails mid-deployment, stop and keep privacy enforced; use a compatible forward correction. Future rollbacks must retain the private table, trigger, view and hydrated owner/participant queries. Never drop private data or restore exact fields to the public table to make an old client work.

The private table is the retained authoritative location copy. Removing the migration or copying its exact values back into public `services` is not an acceptable rollback. Preserve Property Network assignments/job links and all booking IDs.
