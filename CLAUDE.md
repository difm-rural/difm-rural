# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npx expo start          # start dev server (scan QR with Expo Go / dev client)
npx expo start --android
npx expo start --ios
npx expo start --web
```

No lint config. Tests: `tests/e2e-job-flow.js` is a standalone Node script that exercises the job flow against Supabase (see `tests/README.md`) — not a unit-test runner.

## Architecture

**difm-rural** is a React Native / Expo marketplace for rural New Zealand. It is really **two marketplaces** sharing one app:

- **Jobs + bids** (requester-led community board): a requester posts a `job`, providers place `bids`, the requester accepts one. "Anyone handy nearby" work.
- **Services + bookings** (provider-led directory): a provider advertises a `service`, a requester `books` it (or requests a quote). Specialist work — septic, drone spraying, contract fencing.

Payments are intentionally not built yet.

### Entry point & navigation

`App.js` wraps `UserProvider` (and `PostJobProvider`) around `src/navigation/AppNavigator.js`. `AppNavigator` holds session/profile/badge state, subscribes to `supabase.auth.onAuthStateChange`, and renders one of three trees:

- **Guest stack** — Landing → Login → GuestJobFeed → GuestJobDetail → GuestPostJob (+ services browse/booking for guests).
- **Onboarding** — shown when `profile.onboarding_completed === false`.
- **Authenticated** — a custom 5-tab bottom bar (`CustomTabBar` in AppNavigator), each tab its own native-stack:
  - **Home** (`HomeTabScreen`) — slim dashboard: shortcuts + a "Needs attention" feed driven by unread notifications + an activity summary.
  - **Jobs** (`JobsTabScreen`) — the job board: role-aware (post CTA / your open jobs for requesters, your bids for providers), category filter, search, GPS distance. Hosts the PostJob wizard.
  - **Services** (`BrowseTabScreen`, route name `Browse`) — services directory + provider's own listings.
  - **Activity** (`ActivityTabScreen`) — everything in flight + history; `NotificationsScreen` lives here.
  - **Account** (`AccountTabScreen`).

Auth-event handling: a single `onAuthStateChange` subscription covers cold start (INITIAL_SESSION). Pending guest drafts flush only on `SIGNED_IN`; `TOKEN_REFRESHED` only refreshes biometric tokens.

### Guest → auth posting

A guest can complete the full job wizard (and service booking). The draft is saved to `AsyncStorage` (`pendingJob` with photos under `_photos`; `pendingBooking`). On `SIGNED_IN`, `AppNavigator.postPendingJobIfAny` / `postPendingBookingIfAny` insert it, upload any photos, and keep the draft if the insert fails (so it's never silently lost).

### User roles

`profiles.primary_role` is `requester` | `provider` | `both` (legacy accounts fall back to `role`). Home/Jobs/Services screens branch their UI on this.

### Notifications (requester↔provider loop)

All notifications are created by **database triggers** (`supabase/legacy-sql/notifications_triggers.sql` — the single source of truth for them) — clients never insert into `notifications` directly. `src/lib/notifications.js` reads/renders them; `NotificationsScreen` marks them read; tab badges refresh via `src/lib/badgeEvents.js`.

**Push notifications work** on physical devices: a `device_push_tokens` table + the `send-push` edge function (fired by a Database Webhook on `notifications` INSERT, authed via the `PUSH_WEBHOOK_SECRET` header) → Expo push API. Client registration lives in `src/lib/push.js`; tapping a push routes to Activity → Notifications. Push does **not** work in Expo Go or on emulators (`push.js` skips registration when `!Device.isDevice`).

### Supabase tables (key columns)

| Table | Notes |
|---|---|
| `jobs` | `requester_id`, `status` (open/accepted/in_progress/completed/cancelled), `price_type`, `price`, `category`, `location_name`, lat/lng, `area_polygon`, `photos[]`, `cancellation_reason/note`, `hide_exact_location`, `location_area`, `date_from`/`date_to`. **Viewer-facing reads must go through the `jobs_public` view** — see Location privacy below |
| `bids` | `provider_id`, `job_id`, `amount`, `status` (pending/accepted/rejected), `line_items`, `available_from`, `estimated_duration` |
| `services` | `provider_id`, `title`, `category`, `pricing_type` (hourly/fixed/per_unit/day_rate/quote_required), `rate`, `travel_range_km`, `is_active` |
| `bookings` | `service_id`, `requester_id`, `provider_id`, `status` (pending→quote_sent→confirmed→in_progress→awaiting_completion→completed; +withdrawn/cancelled/declined/cancellation_requested), `quote_amount`, `total_amount` |
| `profiles` | `id`, `full_name`, `avatar_url`, `primary_role`, `role`, `region` |
| `messages` / `service_booking_messages` | job chat / booking chat; both in the `supabase_realtime` publication |
| `reviews` | per job OR booking; `reviewer_role`/`reviewee_role`, `rating`, `comment`; publicly readable |
| `job_questions` | public Q&A on jobs | 
| `notifications` | `user_id`, `type`, `body`, `metadata` jsonb, `read` |
| `watchlist`, `user_preferences`, `user_activity`, `job_checkins` | |

Base tables (`jobs`, `profiles`, `bids`, `messages`, etc.) were created directly in Supabase and are captured in the baseline migration rather than individual ones.

### Location privacy (two-tier) — read this before touching job reads

A requester can hide a job's exact address (`jobs.hide_exact_location`). Only the coarse `location_area` shows publicly; the exact address is revealed to the provider they accept. This is enforced **in the database**, not just the UI: the `jobs_public` view (`security_invoker = true`, so the normal audience RLS still applies) masks `location_name`, `latitude`, `longitude`, `location_note`, and `area_polygon` via `can_see_job_location(job_id)` (true for the owner, the accepted provider, or a job that isn't hidden).

**Rules:**
- Viewer-facing job reads go through **`jobs_public`** (board, feeds, job detail, chat, notifications) — never base `jobs`.
- Owner-management and own-job reads (e.g. "my jobs", the post-job edit flow) may use base `jobs`.
- **PostgREST embeds bypass the view** — `bids.select('*, jobs(*)')` reads the base table. Only use such embeds when filtered to accepted/completed bids (where the viewer is authorised); otherwise read ids first, then `jobs_public`.
- UI that hides an address should key off `hide_exact_location`, not the category.

### Library modules (`src/lib/`)

- `supabase.js` — client singleton (AsyncStorage session persistence)
- `notifications.js` / `badgeEvents.js` — notification fetch/render + tab-badge refresh pub/sub
- `analytics.js` — `trackEvent` → `user_activity`, errors swallowed
- `preferences.js` — `user_preferences` read/write (uses `maybeSingle`)
- `watchlist.js`, `reviews.js`
- `biometrics.js` — wraps `expo-local-authentication` + `expo-secure-store`; stores **session tokens** (not password) under `difm_*` keys. Tokens are saved without enabling; biometric only turns on after explicit consent (`enableBiometric`).
- `jobPhotos.js` — `uploadJobPhotos(jobId, photos)`, shared by the wizard and pending-draft flush
- `maps.js` / `location.js` — Google Maps via the `maps-proxy` edge function; **no Google key in JS** (only the Android SDK key in `app.json`). `constants.js` exports `MAPS_PROXY_URL`.
- `categories.js` — the **single unified taxonomy** shared by both marketplaces: `CATEGORIES` (12 browse categories; `JOB_CATEGORIES`/`SERVICE_CATEGORIES` are aliases of it), `CATEGORY_CAPABILITIES` (a second, more detailed provider-capability layer under each category — what used to be the flat "skills" list; selections stored in `profiles.skills`, rendered by `components/CapabilityPicker.js`), and `CATEGORY_FILTERS` for the `{id,label}` filter bars. Card icons live in `CATEGORY_VISUALS` (`components/JobServiceCard.js`); placeholder artwork in `categoryImages.js` → `assets/categories/`. If you change the list, also update `CATEGORY_VISUALS`, the `categorize-job` edge function (**then redeploy it**), and add a migration remapping existing `jobs.category` / `services.category` rows.
- `uploadAvatar.js` — resizes, uploads, updates profile, and deletes prior avatars

### Edge functions (`supabase/functions/`)

- `maps-proxy` — proxies Static Maps / Geocoding / Places (key held as the `GOOGLE_MAPS_API_KEY` secret)
- `categorize-job` — OpenAI: infers a job's category from title + description. Its `CATEGORIES` list is a hand-copied duplicate of `src/lib/categories.js` — **keep in sync and redeploy** when the taxonomy changes
- `draft-job-from-text` — OpenAI: drafts a job from the AI assistant's free text
- `create-service-draft-from-photo` — OpenAI vision draft for the "advertise from a photo" flow
- `send-push` — Database-Webhook target on `notifications` INSERT → Expo push API
- `daily-digest` — daily summary for users who opted in

### Database changes / SQL

The live schema is captured in `supabase/migrations/00000000000000_baseline.sql`
(a full `pg_dump --schema-only`, already marked applied on the remote). New
schema changes go through the CLI: `supabase migration new <name>`, edit the
generated file, then `supabase db push`. See `supabase/README.md`.

Migration history was **reconciled in July 2026** — every migration is recorded
on the remote and `supabase db push --dry-run` reports "Remote database is up to
date". Keep it that way: prefer `migration new` + `db push`. If you ever apply
SQL by hand in the dashboard, follow it with
`supabase migration repair --status applied <version>` so the history doesn't
drift again.

The older hand-applied scripts are archived in `supabase/legacy-sql/` for
reference — they're already represented in the baseline; don't re-run them
against a DB that has the baseline. Notable ones: `security_hardening.sql`
(RLS + booking state-machine trigger), `notifications_triggers.sql` (all
notification triggers — single source of truth), `realtime_publication.sql`
(chat realtime).

Note: `supabase db dump` needs Docker or a local `pg_dump` (PostgreSQL 17
client is installed at `C:\Program Files\PostgreSQL\17\bin`). Dump via the
session pooler host in `supabase/.temp/pooler-url`.

### Theme

All design tokens in `src/theme/tokens.js`: `colors`, `spacing`, `radius`, `typography`, `elevation`, `touchTarget`. Import from there — never inline raw hex/numbers. Brand colour is forest green `#2d6a4f`.

### Locale

Dates `en-NZ`; prices NZD.
