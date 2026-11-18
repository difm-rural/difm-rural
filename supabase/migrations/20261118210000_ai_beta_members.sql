-- AI connector hidden beta.
--
-- Members on ai_beta_members can use the connector while the global
-- ai_settings.ai_enabled switch is OFF. An admin pause still wins, and a
-- revoked session is still refused. Admins manage the list in admin-web
-- /assistants. Account → Connected assistants (app + web) is shown only to
-- beta members and to members who already have an assistant connected
-- (ai_connector_status().show_connected_assistants).

create table public.ai_beta_members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  note text check (note is null or char_length(note) <= 200),
  added_at timestamptz not null default now(),
  added_by uuid references auth.users (id) on delete set null
);

alter table public.ai_beta_members enable row level security;
create policy "Admins read AI beta members" on public.ai_beta_members
  for select to authenticated using (public.current_user_is_admin());
create policy "Members read their own AI beta row" on public.ai_beta_members
  for select to authenticated using (user_id = auth.uid());
-- Same read-only rule for assistant tokens as every other table.
create policy "Assistants cannot insert" on public.ai_beta_members as restrictive for insert to public with check (not public.is_assistant_token());
create policy "Assistants cannot update" on public.ai_beta_members as restrictive for update to public using (not public.is_assistant_token()) with check (not public.is_assistant_token());
create policy "Assistants cannot delete" on public.ai_beta_members as restrictive for delete to public using (not public.is_assistant_token());
revoke all on public.ai_beta_members from anon, authenticated;
grant select on public.ai_beta_members to authenticated;

-- ---------------------------------------------------------------------------
-- Gate: session → pause → (global switch OR beta) → rate limits.
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
  elsif exists (select 1 from public.ai_member_pauses p where p.user_id = v_uid) then
    v_status := 'denied_paused';
  elsif not (
    coalesce((select a.ai_enabled from public.ai_settings a where a.id), false)
    or exists (select 1 from public.ai_beta_members b where b.user_id = v_uid)
  ) then
    v_status := 'denied_disabled';
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

-- What the member's own Account screens need.
create or replace function public.ai_connector_status()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with s as (
    select
      coalesce((select a.ai_enabled from public.ai_settings a where a.id), false) as ai_enabled,
      exists (select 1 from public.ai_member_pauses p where p.user_id = auth.uid()) as paused,
      exists (select 1 from public.ai_beta_members b where b.user_id = auth.uid()) as beta,
      exists (
        select 1 from auth.sessions x
        where x.user_id = auth.uid() and x.oauth_client_id is not null
          and (x.not_after is null or x.not_after > now())
      ) as has_assistant
  )
  select jsonb_build_object(
    'ai_enabled', s.ai_enabled,
    'paused', s.paused,
    'beta', s.beta,
    'has_assistant', s.has_assistant,
    'available', (s.ai_enabled or s.beta) and not s.paused,
    'show_connected_assistants', s.beta or s.has_assistant
  )
  from s;
$$;

-- ---------------------------------------------------------------------------
-- Admin: manage the beta list (by email, as admins know members by email).
-- ---------------------------------------------------------------------------
create or replace function public.ai_admin_set_beta(p_email text, p_on boolean, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  perform public.refuse_assistant_token();
  if not public.current_user_is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  select u.id into v_user from auth.users u where lower(u.email) = lower(trim(coalesce(p_email, '')));
  if v_user is null then
    raise exception 'No member with that email' using errcode = 'P0002';
  end if;
  if p_on then
    insert into public.ai_beta_members (user_id, note, added_by)
    values (v_user, nullif(left(trim(coalesce(p_note, '')), 200), ''), auth.uid())
    on conflict (user_id) do update set note = coalesce(excluded.note, public.ai_beta_members.note);
  else
    delete from public.ai_beta_members where user_id = v_user;
  end if;
  return v_user;
end;
$$;

-- ai_admin_members gains the beta flag and lists beta members too.
drop function public.ai_admin_members();
create function public.ai_admin_members()
returns table (
  user_id uuid, full_name text, email text,
  connected_sessions integer, calls_today integer, calls_30d integer, refused_30d integer,
  last_call_at timestamptz, paused boolean, pause_reason text, beta boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.refuse_assistant_token();
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
    union
    select b.user_id from public.ai_beta_members b
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
    pa.reason,
    (b.user_id is not null)
  from members m
  left join public.profiles pr on pr.id = m.user_id
  left join auth.users u on u.id = m.user_id
  left join public.ai_member_pauses pa on pa.user_id = m.user_id
  left join public.ai_beta_members b on b.user_id = m.user_id
  order by 8 desc nulls last, 2;
end;
$$;

revoke all on function public.ai_admin_set_beta(text, boolean, text) from public, anon;
revoke all on function public.ai_admin_members() from public, anon;
grant execute on function public.ai_admin_set_beta(text, boolean, text) to authenticated;
grant execute on function public.ai_admin_members() to authenticated;
