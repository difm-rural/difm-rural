-- The notifications table (predates the repo) has title NOT NULL and a legacy
-- `data` column, but the notification triggers only set user_id/type/body/
-- metadata. The NOT NULL made every trigger insert fail silently (the trigger
-- functions swallow exceptions). Nothing reads `title`, so make it nullable.

alter table public.notifications alter column title drop not null;
