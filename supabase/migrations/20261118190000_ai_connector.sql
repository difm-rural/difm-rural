-- AI connector, phase 1: a read-only MCP server (supabase/functions/rc-mcp)
-- that AI assistants reach through the Supabase OAuth 2.1 server.
--
-- Every tool call first goes through public.ai_begin_tool_call(), called with
-- the member's own OAuth access token. That one function:
--   * refuses tokens whose session was revoked (a disconnected assistant),
--     because PostgREST alone only checks the JWT signature and expiry;
--   * honours the global ai_enabled flag and a per-member admin pause;
--   * enforces 60 calls a minute and 1,000 calls a day per member; and
--   * writes the audit row (public.ai_tool_calls, readable by admins only).
-- The tools themselves then read as the member, so normal RLS applies.

-- ---------------------------------------------------------------------------
-- Global switch (single row)
-- ---------------------------------------------------------------------------
create table public.ai_settings (
  id boolean primary key default true check (id),
  ai_enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
insert into public.ai_settings (id) values (true);

alter table public.ai_settings enable row level security;
create policy "Admins read AI settings" on public.ai_settings
  for select to authenticated using (public.current_user_is_admin());
revoke all on public.ai_settings from anon, authenticated;
grant select on public.ai_settings to authenticated;

-- ---------------------------------------------------------------------------
-- Per-member pause (set by admins)
-- ---------------------------------------------------------------------------
create table public.ai_member_pauses (
  user_id uuid primary key references auth.users (id) on delete cascade,
  reason text check (reason is null or char_length(reason) <= 300),
  paused_at timestamptz not null default now(),
  paused_by uuid references auth.users (id) on delete set null
);

alter table public.ai_member_pauses enable row level security;
create policy "Admins read AI pauses" on public.ai_member_pauses
  for select to authenticated using (public.current_user_is_admin());
create policy "Members read their own AI pause" on public.ai_member_pauses
  for select to authenticated using (user_id = auth.uid());
revoke all on public.ai_member_pauses from anon, authenticated;
grant select on public.ai_member_pauses to authenticated;

-- ---------------------------------------------------------------------------
-- Audit log: one row per tool call, including refused ones. Admins only.
-- ---------------------------------------------------------------------------
create table public.ai_tool_calls (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  client_id text,
  session_id uuid,
  tool text not null check (char_length(tool) <= 64),
  status text not null check (status in (
    'started', 'ok', 'error',
    'denied_disabled', 'denied_paused', 'denied_minute', 'denied_day', 'denied_session'
  )),
  result_count integer check (result_count is null or result_count >= 0),
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  created_at timestamptz not null default now()
);
create index ai_tool_calls_user_created_idx on public.ai_tool_calls (user_id, created_at desc);
create index ai_tool_calls_created_idx on public.ai_tool_calls (created_at desc);

alter table public.ai_tool_calls enable row level security;
create policy "Admins read AI tool calls" on public.ai_tool_calls
  for select to authenticated using (public.current_user_is_admin());
revoke all on public.ai_tool_calls from anon, authenticated;
grant select on public.ai_tool_calls to authenticated;

-- ---------------------------------------------------------------------------
-- Gate + audit. Called by rc-mcp with the member's token before each tool.
-- ---------------------------------------------------------------------------
create or replace function public.ai_begin_tool_call(p_tool text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_claims jsonb := coalesce(auth.jwt(), '{}'::jsonb);
  v_client text := nullif(v_claims ->> 'client_id', '');
  v_session uuid;
  v_status text := 'started';
  v_minute integer;
  v_day integer;
  v_id bigint;
begin
  if v_uid is null then
    raise exception 'Sign in required' using errcode = '42501';
  end if;
  if p_tool is null or p_tool !~ '^[a-z_]{1,64}$' then
    raise exception 'Unknown tool' using errcode = '22023';
  end if;

  begin
    v_session := nullif(v_claims ->> 'session_id', '')::uuid;
  exception when invalid_text_representation then
    v_session := null;
  end;

  -- One member's calls are counted one at a time, so bursts cannot overshoot.
  perform pg_advisory_xact_lock(hashtextextended('ai_tool_calls:' || v_uid::text, 0));

  if v_session is null or not exists (
    select 1 from auth.sessions s
    where s.id = v_session and s.user_id = v_uid
      and (s.not_after is null or s.not_after > now())
  ) then
    v_status := 'denied_session';
  elsif not coalesce((select a.ai_enabled from public.ai_settings a where a.id), false) then
    v_status := 'denied_disabled';
  elsif exists (select 1 from public.ai_member_pauses p where p.user_id = v_uid) then
    v_status := 'denied_paused';
  else
    select
      count(*) filter (where c.created_at > now() - interval '1 minute'),
      count(*)
    into v_minute, v_day
    from public.ai_tool_calls c
    where c.user_id = v_uid
      and c.created_at > now() - interval '1 day'
      and c.status in ('started', 'ok', 'error');

    if v_minute >= 60 then
      v_status := 'denied_minute';
    elsif v_day >= 1000 then
      v_status := 'denied_day';
    end if;
  end if;

  -- Refusals are audited too, but a client hammering a closed gate records at
  -- most 10 refusals a minute so it cannot flood the log.
  if v_status = 'started' or (
    select count(*) from public.ai_tool_calls c
    where c.user_id = v_uid and c.created_at > now() - interval '1 minute' and c.status like 'denied\_%'
  ) < 10 then
    insert into public.ai_tool_calls (user_id, client_id, session_id, tool, status)
    values (v_uid, v_client, v_session, p_tool, v_status)
    returning id into v_id;
  end if;

  return jsonb_build_object(
    'allowed', v_status = 'started',
    'reason', v_status,
    'call_id', v_id,
    'retry_after_seconds', case v_status when 'denied_minute' then 60 when 'denied_day' then 3600 else null end
  );
end;
$$;

create or replace function public.ai_finish_tool_call(
  p_call_id bigint, p_ok boolean, p_result_count integer default null, p_duration_ms integer default null
)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.ai_tool_calls
  set status = case when p_ok then 'ok' else 'error' end,
      result_count = greatest(p_result_count, 0),
      duration_ms = least(greatest(p_duration_ms, 0), 600000)
  where id = p_call_id and user_id = auth.uid() and status = 'started';
$$;

-- What the member's own Connected assistants screen shows.
create or replace function public.ai_connector_status()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'ai_enabled', coalesce((select a.ai_enabled from public.ai_settings a where a.id), false),
    'paused', exists (select 1 from public.ai_member_pauses p where p.user_id = auth.uid())
  );
$$;

-- ---------------------------------------------------------------------------
-- Admin controls
-- ---------------------------------------------------------------------------
create or replace function public.ai_admin_set_enabled(p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.current_user_is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  update public.ai_settings
  set ai_enabled = coalesce(p_enabled, false), updated_at = now(), updated_by = auth.uid()
  where id;
end;
$$;

create or replace function public.ai_admin_set_member_pause(p_user_id uuid, p_paused boolean, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.current_user_is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  if p_paused then
    insert into public.ai_member_pauses (user_id, reason, paused_by)
    values (p_user_id, nullif(left(trim(coalesce(p_reason, '')), 300), ''), auth.uid())
    on conflict (user_id) do update
      set reason = excluded.reason, paused_by = excluded.paused_by, paused_at = now();
  else
    delete from public.ai_member_pauses where user_id = p_user_id;
  end if;
end;
$$;

-- Members who have connected an assistant (live OAuth session) or used one in
-- the last 30 days, with their usage and pause state.
create or replace function public.ai_admin_members()
returns table (
  user_id uuid, full_name text, email text,
  connected_sessions integer, calls_today integer, calls_30d integer, refused_30d integer,
  last_call_at timestamptz, paused boolean, pause_reason text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.current_user_is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  return query
  with members as (
    select s.user_id from auth.sessions s where s.oauth_client_id is not null
    union
    select c.user_id from public.ai_tool_calls c where c.created_at > now() - interval '30 days'
    union
    select p.user_id from public.ai_member_pauses p
  )
  select
    m.user_id,
    coalesce(nullif(pr.full_name, ''), pr.display_name),
    u.email::text,
    (select count(*)::integer from auth.sessions s where s.user_id = m.user_id and s.oauth_client_id is not null),
    (select count(*)::integer from public.ai_tool_calls c where c.user_id = m.user_id and c.created_at > now() - interval '1 day' and c.status in ('ok','error','started')),
    (select count(*)::integer from public.ai_tool_calls c where c.user_id = m.user_id and c.created_at > now() - interval '30 days' and c.status in ('ok','error','started')),
    (select count(*)::integer from public.ai_tool_calls c where c.user_id = m.user_id and c.created_at > now() - interval '30 days' and c.status like 'denied_%'),
    (select max(c.created_at) from public.ai_tool_calls c where c.user_id = m.user_id),
    (pa.user_id is not null),
    pa.reason
  from members m
  left join public.profiles pr on pr.id = m.user_id
  left join auth.users u on u.id = m.user_id
  left join public.ai_member_pauses pa on pa.user_id = m.user_id
  order by 8 desc nulls last, 2;
end;
$$;

revoke all on function public.ai_begin_tool_call(text) from public, anon;
revoke all on function public.ai_finish_tool_call(bigint, boolean, integer, integer) from public, anon;
revoke all on function public.ai_connector_status() from public, anon;
revoke all on function public.ai_admin_set_enabled(boolean) from public, anon;
revoke all on function public.ai_admin_set_member_pause(uuid, boolean, text) from public, anon;
revoke all on function public.ai_admin_members() from public, anon;
grant execute on function public.ai_begin_tool_call(text) to authenticated;
grant execute on function public.ai_finish_tool_call(bigint, boolean, integer, integer) to authenticated;
grant execute on function public.ai_connector_status() to authenticated;
grant execute on function public.ai_admin_set_enabled(boolean) to authenticated;
grant execute on function public.ai_admin_set_member_pause(uuid, boolean, text) to authenticated;
grant execute on function public.ai_admin_members() to authenticated;
