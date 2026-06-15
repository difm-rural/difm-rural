-- Expo push tokens, one row per device. A token is globally unique; on a shared
-- device the latest signed-in user "owns" it (the client upserts on conflict).

create table if not exists public.device_push_tokens (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users(id) on delete cascade,
  token      text        not null unique,
  platform   text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists device_push_tokens_user_idx
  on public.device_push_tokens(user_id);

alter table public.device_push_tokens enable row level security;

-- A user can read/insert/update/delete only their own token rows. The send-push
-- edge function uses the service role and bypasses this.
drop policy if exists "Users manage their own push tokens" on public.device_push_tokens;
create policy "Users manage their own push tokens"
  on public.device_push_tokens
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
