// Google Maps web requests go through the maps-proxy Supabase Edge Function
// so the API key stays server-side (see supabase/functions/maps-proxy).
export const MAPS_PROXY_URL = 'https://opagkgfxmjqmnvhrcris.supabase.co/functions/v1/maps-proxy'
