# maps-proxy

Proxies the Google Maps **web service** APIs (Static Maps, Geocoding, Places
autocomplete + details) so the API key never ships in the app bundle. The app
calls this function via plain `fetch` / `<Image>` URLs built in
`src/lib/maps.js` and `src/lib/location.js`.

The Maps **SDK for Android** key in `app.json` is separate — that one must
ship with the app, but it *can* be locked to the app's package name + signing
certificate, which web service keys cannot.

## Setup

1. **Create two new API keys** in Google Cloud Console (the old key was
   shipped in app builds, so treat it as leaked):

   - **Server key** (used only by this function)
     - API restrictions: Maps Static API, Geocoding API, Places API (New) — nothing else.
     - Set per-API quotas (e.g. a few thousand requests/day) so a leak or bug can't run up a big bill.
   - **Android key** (goes in `app.json` → `android.config.googleMaps.apiKey`)
     - API restrictions: Maps SDK for Android only.
     - Application restrictions: Android app, package `nz.co.difmrural.app` + your release/debug SHA-1 fingerprints (get them from `eas credentials`).

   Then **delete the old key** (`AIzaSyD-f2...`) once a build with the new
   Android key is out.

2. **Set the server key as a function secret:**

   ```sh
   supabase secrets set GOOGLE_MAPS_API_KEY=your_new_server_key
   ```

3. **Deploy** (JWT verification off — guests and React Native `<Image>`
   requests can't attach a Supabase JWT):

   ```sh
   supabase functions deploy maps-proxy --no-verify-jwt
   ```

## Endpoints

| Route | Method | Params | Returns |
|---|---|---|---|
| `/staticmap` | GET | `lat`,`lng` or `path=lat,lng\|lat,lng...`; optional `zoom`,`w`,`h` | PNG image |
| `/geocode` | GET | `lat`, `lng` | `{ "address": string \| null }` |
| `/places-autocomplete` | POST | `{ "input": string }` | `{ "suggestions": [{ "place_id", "description" }] }` |
| `/place-details` | GET | `place_id` | `{ "latitude", "longitude", "formattedAddress" }` |

Request shapes are deliberately rigid (capped image sizes, max 80 polygon
points, fixed marker/path styling, NZ-only autocomplete) so the function can't
be repurposed as a general Google API relay.
