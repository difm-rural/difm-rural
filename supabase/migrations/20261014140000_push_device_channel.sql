-- Each device advertises the channel it actually created. Old app builds keep
-- their current fallback channel rather than receiving an unknown channel ID.
alter table public.device_push_tokens add column if not exists channel_id text;
