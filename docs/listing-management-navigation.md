# Listing management navigation — local review

Branch: `codex/listing-management-navigation`, based on current GitHub main `a38910915f3387a05207226d9ee3cb8157fafc0a` (including the newer public footer change). Application changes are uncommitted and local for review. No merge, push, migration, deployment or publication.

## Changes

- Mobile and provider-web Home → My Work retain exactly two action cards. Find work retains its destination. The second card now reads **My listings**, subtitle **Manage or create listings**, and opens existing management (`MyServices` / `/listings`).
- Mobile My listings promotes the existing Add action to a visible **Create a listing** primary button below the title/count, avoiding narrow-screen competition with the heading. It retains the exact existing CreateService route and new-listing parameters. Its existing **Create your first listing** empty-state action is retained.
- Web My listings retains its existing primary **Create a listing** header action. Its empty state now includes **No listings yet**, useful copy and **Create your first listing** pointing to `/listings/new`.
- Find local help replaces the text-only link with a compact listing-icon/text/chevron **Manage my listings** row after search/category controls. Mobile keeps its existing signed-in visibility rule; provider web keeps its existing authentication. Search/filter/result behaviour is unchanged.
- No listing creation, edit, pause, close, delete, ownership, lifecycle or database business logic changed. No schema/API changes. Public guest web has no listing-management flow and required no source change.

## Validation

- Full `npm test`: **598 passed, 0 failed**, including six new rendered navigation/presentation regressions.
- Tests cover native Home's two cards and actual navigation handlers; mobile member-only management row, icon/chevron and ordering; native primary/empty-state creation routes; web owner scoping, empty/populated management state and card ordering; web secondary management row; rendered web Home's two cards/destinations. Existing listing action tests remain passing.
- Provider web webpack production build, including TypeScript/page generation: passed. Existing non-blocking Account Help package-version warning remains.
- Android and iOS local Expo exports: passed, nothing uploaded.
- Diff/whitespace checks: passed.

## Manual review

On narrow Android/iOS and web, open Home → My Work: verify two cards, My listings text/subtitle and the correct management destination. Confirm Create a listing is prominent and opens the existing creation flow. With no listings, use Create your first listing. With existing listings, check edit/pause/close controls remain reachable. From Find local help, confirm the compact management row sits below discovery controls and search/category filtering still works.

Physical-device and authenticated end-to-end browser smoke tests were not performed. Rendering/navigation unit tests and local builds/exports are verified. Unrelated Property Map and Photo V1 work remains separate and preserved.

## Files

- `src/screens/tabs/HomeTabScreen.js`
- `src/screens/tabs/BrowseTabScreen.js`
- `src/screens/MyServicesScreen.js`
- `provider-web/src/app/page.tsx`
- `provider-web/src/app/browse/page.tsx`
- `provider-web/src/app/listings/page.tsx`
- `provider-web/src/app/globals.css`
- `tests/listing-management-navigation.test.mjs`
- `tests/home-polish.test.mjs`
- `tests/web-dashboard-activity.test.mjs`
