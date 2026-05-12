# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npx expo start          # start dev server (scan QR with Expo Go)
npx expo start --android
npx expo start --ios
npx expo start --web
```

There is no test suite and no lint configuration.

## Architecture

**difm-rural** is a React Native / Expo marketplace for rural tasks in New Zealand. Users can post tasks ("jobs") and bid to complete them.

### Auth & navigation flow

`App.js` → `src/navigation/AppNavigator.js` is the single entry point. `AppNavigator` holds session and profile state, listens to `supabase.auth.onAuthStateChange`, and renders one of two navigator trees:

- **Unauthenticated stack**: Landing → Login / Register → GuestJobFeed → GuestJobDetail → GuestPostJob
- **Authenticated stack** (nested inside `Main`): Dashboard → PostJob → ManageTask → MyJobs → JobDetail → JobFeed → Chat → Profile

### Guest-to-auth job posting

A guest can complete the full job-posting wizard. The draft is saved to `AsyncStorage` under the key `pendingJob`. On next successful login, `AppNavigator.postPendingJobIfAny()` reads it, inserts it into `jobs`, clears the key, and sets `guestJobPosted = true` so the dashboard redirects to `MyJobs`.

### User roles

Profiles have a `primary_role` field: `requester`, `provider`, or `both` (legacy accounts fall back to `role`). `UnifiedDashboardScreen` branches its entire UI on this value, rendering three distinct views in the same component.

### Supabase tables

| Table | Key columns |
|---|---|
| `jobs` | `requester_id`, `status` (open/accepted/in_progress/completed), `price_type` (fixed/open), `price`, `location_name`, `category`, `scheduled_date` |
| `bids` | `provider_id`, `job_id`, `amount`, `status` (pending/accepted) |
| `profiles` | `id`, `full_name`, `avatar_url`, `primary_role`, `role` |
| `messages` | `job_id`, `content`, `created_at` |
| `watchlist` | `user_id`, `job_id` |
| `reviews` | `job_id`, `reviewer_id`, `reviewee_id`, `reviewer_role`, `reviewee_role`, `rating`, `comment` |
| `user_preferences` | `user_id`, `preferred_categories`, `last_seen_at` |
| `user_activity` | `user_id`, `event_type`, `metadata` |

The Supabase client singleton lives in `src/lib/supabase.js` and uses `AsyncStorage` for session persistence.

### Library modules (`src/lib/`)

- `supabase.js` — client singleton
- `analytics.js` — `trackEvent(eventType, metadata)` writes to `user_activity`; errors are swallowed silently
- `preferences.js` — read/write `user_preferences`; `updateLastSeen()` is called on every profile fetch
- `watchlist.js` — CRUD helpers for the `watchlist` table
- `reviews.js` — `loadReview` / `saveReview` (upserts on `job_id,reviewer_id,reviewer_role`)
- `biometrics.js` — wraps `expo-local-authentication` + `expo-secure-store`; stores email/password in secure storage under `difm_biometric_*` keys

### Theme

All design tokens are in `src/theme/tokens.js`: `colors`, `spacing`, `radius`, `typography`, `elevation`, `touchTarget`. Import from there — never use raw hex/number values inline. Primary brand colour is forest green `#2d6a4f`.

### Job categories

Fixed list: Fencing, Maintenance, Property Check, Landscaping, Animal Care, Machinery, General Labour, Other.

### PostTaskScreen

Five-step wizard (Task name → Schedule → Details → Budget → Review). Used for both authenticated posting and guest posting (same screen, routed as `GuestPostJob`). Supports photo attachment via `expo-image-picker`. When a guest reaches the Review step it shows an animated bottom sheet (`AuthSheet`) prompting login/register.

### Locale

Dates are formatted for `en-NZ`. Prices are in NZD.
