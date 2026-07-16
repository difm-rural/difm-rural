# Handoff: Barn Brand Mark Integration

## Overview
Integrates the new barn app-icon artwork across Rural Connect's UI: empty states, sign-in screen, header wordmark lockup, notification badge, and category placeholder photography.

## About the Design Files
The bundled `RuralConnect_prototype.dc.html` is an **HTML design reference** — a clickable prototype built to show intended look and behavior. It is NOT production code. Recreate this in the app's existing React Native / Expo (SDK 54) codebase, using its existing navigation, screen, and component structure — do not port the HTML/CSS directly.

## Fidelity
**High-fidelity.** Colors, spacing, and copy in the prototype are final intent. Recreate pixel-accurately using React Native primitives (View/Text/Image/Pressable) and the app's existing style/token setup, substituting the prototype's inline hex values for the app's `tokens.js` constants where they match (see Design Tokens below).

## Assets
- `assets/brand/app-icon-source-1024.png` — original red barn mark (source of truth, 1024×1024, no transparency).
- `assets/brand/barn-ghost.png` — grey, transparent-background version for empty states (barn recolored to `#c9c9c9`, white recolored to alpha 0).
- `assets/brand/barn-watermark-white.png` — white, transparent-background version, used at low opacity as a corner watermark on category photography.
- `assets/brand/barn-badge-red.png` — 96×96 rounded-square red badge (barn on `#c71418` background, 24px corner radius) — used as the small in-app logo mark (header, sign-in lockup, notification badge).
- `assets/brand/barn-notification-icon.png` — 192×192 white-on-transparent silhouette, cropped tighter — intended for the OS-level push/notification icon slot (iOS/Android monochrome notification icon requirements).
- `assets/categories/*.jpg` — the 12 category placeholder photos (1000×700, from the earlier design pass), each now with the white barn watermark composited at ~16% opacity, bottom-right corner (130×130px mark, 28px from right edge, 24px from bottom edge).

All were generated from the single uploaded barn artwork via pixel recoloring (red→target color, white→transparent), not hand-redrawn — implement equivalent static assets in the app (export these PNGs/JPGs directly, or regenerate at the resolutions your app needs, e.g. @1x/@2x/@3x).

## Screens / Views & Behavior

### 1. Empty states (ghost barn)
- **Where**: Any list screen when a filter/search yields zero results (prototype demonstrates this on the Jobs board when a category with no listings is selected).
- **Layout**: Centered column, padding 48px vertical / 30px horizontal, 10px gap between elements.
- **Components**: `barn-ghost.png` at 84×84, opacity 0.7 → title text (15px, weight 700, color `#666666`) → subtitle (13px, color `#999999`, max-width 240px, center-aligned).
- **Copy pattern**: Short empathetic title ("No jobs in this category yet") + one-line next-step subtitle ("Try a different category, or widen your search radius.").
- Apply the same pattern to other empty states (no bookings, no activity, no connections) with copy adjusted per context.

### 2. Sign-in / sign-up screen
- **Where**: Reached from an "Sign in to sync your account" banner at the top of Account (light green background `#e8f5e9`, 12px radius, tap target, chevron on the right).
- **Layout**: Full-screen, white background. Top-left back link ("‹ Back", 14px, `#666666`) at top, 20px below status bar. Below it, a centered column: logo lockup, then a form.
- **Logo lockup**: `barn-badge-red.png` at 72×72 (18px corner radius) → app name "Rural Connect" (22px, weight 700, `#222222`) → subtitle "Sign in to post jobs, make offers & book services" (13px, `#999999`).
- **Form**: Email field and password field, each a 1px `#e0e0e0`-bordered box, 10px radius, 13×14px padding, placeholder-styled text at 14px `#999999` (swap for real TextInput components with focus states in the app). Primary "Sign in" button: `#2d6a4f` background, white text, 700 weight, 15px, full-width, 10px radius, 13px vertical padding. Below it, "Don't have an account? Sign up" — "Sign up" in brand green, bold, inline.
- **Behavior**: Tapping "Sign in" or "Sign up" (in the prototype, tapping the button) returns to Account — in the real app, wire to actual auth. Guests should retain their in-progress draft when routed here (per existing app behavior — sign-in interrupts a flow, not replaces it).

### 3. Header / wordmark lockup (Home tab)
- **Where**: Top of the Home screen only, replacing the plain "Rural Connect" title.
- **Layout**: Row, 10px gap, vertically centered. `barn-badge-red.png` at 30×30 (8px radius) directly left of the "Rural Connect" title text (unchanged: 26px, weight 700, `#222222`). Kicker label "RURAL CONNECTIONS" (11px, weight 800, `#c71418`, 1.2px letter-spacing) stays above, unaffected.

### 4. Notification badge (Activity tab)
- **Where**: Top-right of the Activity screen header, beside the "Activity" title.
- **Layout**: 34×34 circular button, background `#f5f5f5`, containing a simple bell glyph (14×14 rounded-top rectangle, `#666666`). `barn-badge-red.png` overlaid as a small 16×16 badge (5px radius) at the top-right corner of the bell button, offset -4px/-4px (i.e. hanging off the corner).
- **Behavior**: Tapping opens notifications (existing Activity/notification feed logic — the badge is a visual indicator only here).
- **Push/system notification icon**: use `barn-notification-icon.png` (or a freshly exported monochrome silhouette) for the OS-level notification icon asset slots (Android `notification_icon` drawable set, iOS uses the app icon so no separate asset needed there).

### 5. Category photography watermark
- **Where**: Job cards and service cards, replacing the flat colored icon swatch previously used as a placeholder.
- **Layout**: 60×60 image, 10px corner radius, `objectFit: cover`, positioned at the left of each card (job cards) or service cards, category-tinted background color as fallback while loading.
- The photos already carry the baked-in watermark (16% opacity white barn, bottom-right) — no additional overlay needed at render time, just display the JPG.
- **Real photos**: when a listing has a user-uploaded photo, show that instead (existing category-placeholder-on-cards behavior) — these watermarked images are the fallback only.

## Design Tokens
Reference existing `tokens.js` — no new tokens introduced. Colors used in this pass:
- Primary (forest green): `#2d6a4f`
- Primary Light: `#e8f5e9`
- Primary Dark: `#085041`
- Accent (red): `#c71418`
- Background: `#f5f5f5`
- Border: `#e0e0e0`
- Text Primary/Secondary/Muted: `#222222` / `#666666` / `#999999`

Ghost-state grey (`#c9c9c9`) and the white watermark are new **derived** tones (from the barn artwork), not existing tokens — consider adding `textGhost: '#c9c9c9'` to `tokens.js` if this pattern is reused elsewhere.

## Files
- `RuralConnect_prototype.dc.html` — full interactive prototype (open in a browser) showing all 5 tabs plus the new empty state, sign-in screen, header mark, and notification badge, wired with mock data.
- `assets/brand/` — all barn-derived brand assets described above.
- `assets/categories/` — the 12 watermarked category placeholder photos.
