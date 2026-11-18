-- AI connector, phase 1 guard: assistant (OAuth client) tokens are READ-ONLY
-- in the database, before the Supabase OAuth server is turned on.
--
-- An access token issued through the OAuth 2.1 server is an ordinary
-- 'authenticated' member JWT plus a client_id claim. Without this migration an
-- assistant holding one could write through PostgREST, Storage or RPCs with the
-- member's full rights, bypassing rc-mcp. Here:
--   1. public.is_assistant_token(): (auth.jwt() ->> 'client_id') is not null.
--   2. A RESTRICTIVE policy per write command on every table that has an
--      INSERT/UPDATE/DELETE/ALL policy (public.* and storage.objects):
--      not is_assistant_token(). Restrictive policies AND with the permissive
--      ones, so normal app sessions are unaffected.
--   3. Every SECURITY DEFINER RPC that writes (they bypass RLS) calls
--      public.refuse_assistant_token() first. Bodies are the live definitions
--      (pg_get_functiondef, 2026-11-18) with only that line added.
--   4. A final check fails the migration if any table with a write policy is
--      missing its restrictive policy (catches tables added meanwhile).
-- Left usable by assistants on purpose: ai_begin_tool_call / ai_finish_tool_call
-- (the rc-mcp gate and its own audit row).

create or replace function public.is_assistant_token()
returns boolean
language sql
stable
set search_path = ''
as $$
  select (auth.jwt() ->> 'client_id') is not null
$$;

create or replace function public.refuse_assistant_token()
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if public.is_assistant_token() then
    raise exception 'AI assistants have read-only access to Rural Connections'
      using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.is_assistant_token() from public;
revoke all on function public.refuse_assistant_token() from public;
grant execute on function public.is_assistant_token() to anon, authenticated, service_role;
grant execute on function public.refuse_assistant_token() to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Restrictive write policies
-- ---------------------------------------------------------------------------
create policy "Assistants cannot insert" on public.admin_audit_log as restrictive for insert to public with check (not public.is_assistant_token());
create policy "Assistants cannot update" on public.admin_audit_log as restrictive for update to public using (not public.is_assistant_token()) with check (not public.is_assistant_token());
create policy "Assistants cannot delete" on public.admin_audit_log as restrictive for delete to public using (not public.is_assistant_token());
create policy "Assistants cannot insert" on public.bids as restrictive for insert to public with check (not public.is_assistant_token());
create policy "Assistants cannot update" on public.bids as restrictive for update to public using (not public.is_assistant_token()) with check (not public.is_assistant_token());
create policy "Assistants cannot delete" on public.bids as restrictive for delete to public using (not public.is_assistant_token());
create policy "Assistants cannot insert" on public.bookings as restrictive for insert to public with check (not public.is_assistant_token());
create policy "Assistants cannot update" on public.bookings as restrictive for update to public using (not public.is_assistant_token()) with check (not public.is_assistant_token());
create policy "Assistants cannot delete" on public.bookings as restrictive for delete to public using (not public.is_assistant_token());
create policy "Assistants cannot insert" on public.device_push_tokens as restrictive for insert to public with check (not public.is_assistant_token());
create policy "Assistants cannot update" on public.device_push_tokens as restrictive for update to public using (not public.is_assistant_token()) with check (not public.is_assistant_token());
create policy "Assistants cannot delete" on public.device_push_tokens as restrictive for delete to public using (not public.is_assistant_token());
create policy "Assistants cannot insert" on public.flow_feedback as restrictive for insert to public with check (not public.is_assistant_token());
create policy "Assistants cannot update" on public.flow_feedback as restrictive for update to public using (not public.is_assistant_token()) with check (not public.is_assistant_token());
create policy "Assistants cannot delete" on public.flow_feedback as restrictive for delete to public using (not public.is_assistant_token());
create policy "Assistants cannot insert" on public.job_checkins as restrictive for insert to public with check (not public.is_assistant_token());
create policy "Assistants cannot update" on public.job_checkins as restrictive for update to public using (not public.is_assistant_token()) with check (not public.is_assistant_token());
create policy "Assistants cannot delete" on public.job_checkins as restrictive for delete to public using (not public.is_assistant_token());
create policy "Assistants cannot insert" on public.job_questions as restrictive for insert to public with check (not public.is_assistant_token());
create policy "Assistants cannot update" on public.job_questions as restrictive for update to public using (not public.is_assistant_token()) with check (not public.is_assistant_token());
create policy "Assistants cannot delete" on public.job_questions as restrictive for delete to public using (not public.is_assistant_token());
create policy "Assistants cannot insert" on public.jobs as restrictive for insert to public with check (not public.is_assistant_token());
create policy "Assistants cannot update" on public.jobs as restrictive for update to public using (not public.is_assistant_token()) with check (not public.is_assistant_token());
create policy "Assistants cannot delete" on public.jobs as restrictive for delete to public using (not public.is_assistant_token());
create policy "Assistants cannot insert" on public.messages as restrictive for insert to public with check (not public.is_assistant_token());
create policy "Assistants cannot update" on public.messages as restrictive for update to public using (not public.is_assistant_token()) with check (not public.is_assistant_token());
create policy "Assistants cannot delete" on public.messages as restrictive for delete to public using (not public.is_assistant_token());
create policy "Assistants cannot insert" on public.notifications as restrictive for insert to public with check (not public.is_assistant_token());
create policy "Assistants cannot update" on public.notifications as restrictive for update to public using (not public.is_assistant_token()) with check (not public.is_assistant_token());
create policy "Assistants cannot delete" on public.notifications as restrictive for delete to public using (not public.is_assistant_token());
create policy "Assistants cannot insert" on public.profiles as restrictive for insert to public with check (not public.is_assistant_token());
create policy "Assistants cannot update" on public.profiles as restrictive for update to public using (not public.is_assistant_token()) with check (not public.is_assistant_token());
create policy "Assistants cannot delete" on public.profiles as restrictive for delete to public using (not public.is_assistant_token());
create policy "Assistants cannot insert" on public.property_network_areas as restrictive for insert to public with check (not public.is_assistant_token());
create policy "Assistants cannot update" on public.property_network_areas as restrictive for update to public using (not public.is_assistant_token()) with check (not public.is_assistant_token());
create policy "Assistants cannot delete" on public.property_network_areas as restrictive for delete to public using (not public.is_assistant_token());
create policy "Assistants cannot insert" on public.property_network_providers as restrictive for insert to public with check (not public.is_assistant_token());
create policy "Assistants cannot update" on public.property_network_providers as restrictive for update to public using (not public.is_assistant_token()) with check (not public.is_assistant_token());
create policy "Assistants cannot delete" on public.property_network_providers as restrictive for delete to public using (not public.is_assistant_token());
create policy "Assistants cannot insert" on public.property_network_services as restrictive for insert to public with check (not public.is_assistant_token());
create policy "Assistants cannot update" on public.property_network_services as restrictive for update to public using (not public.is_assistant_token()) with check (not public.is_assistant_token());
create policy "Assistants cannot delete" on public.property_network_services as restrictive for delete to public using (not public.is_assistant_token());
create policy "Assistants cannot insert" on public.reviews as restrictive for insert to public with check (not public.is_assistant_token());
create policy "Assistants cannot update" on public.reviews as restrictive for update to public using (not public.is_assistant_token()) with check (not public.is_assistant_token());
create policy "Assistants cannot delete" on public.reviews as restrictive for delete to public using (not public.is_assistant_token());
create policy "Assistants cannot insert" on public.saved_interests as restrictive for insert to public with check (not public.is_assistant_token());
create policy "Assistants cannot update" on public.saved_interests as restrictive for update to public using (not public.is_assistant_token()) with check (not public.is_assistant_token());
create policy "Assistants cannot delete" on public.saved_interests as restrictive for delete to public using (not public.is_assistant_token());
create policy "Assistants cannot insert" on public.saved_providers as restrictive for insert to public with check (not public.is_assistant_token());
create policy "Assistants cannot update" on public.saved_providers as restrictive for update to public using (not public.is_assistant_token()) with check (not public.is_assistant_token());
create policy "Assistants cannot delete" on public.saved_providers as restrictive for delete to public using (not public.is_assistant_token());
create policy "Assistants cannot insert" on public.seasonal_campaigns as restrictive for insert to public with check (not public.is_assistant_token());
create policy "Assistants cannot update" on public.seasonal_campaigns as restrictive for update to public using (not public.is_assistant_token()) with check (not public.is_assistant_token());
create policy "Assistants cannot delete" on public.seasonal_campaigns as restrictive for delete to public using (not public.is_assistant_token());
create policy "Assistants cannot insert" on public.seasonal_reminder_settings as restrictive for insert to public with check (not public.is_assistant_token());
create policy "Assistants cannot update" on public.seasonal_reminder_settings as restrictive for update to public using (not public.is_assistant_token()) with check (not public.is_assistant_token());
create policy "Assistants cannot delete" on public.seasonal_reminder_settings as restrictive for delete to public using (not public.is_assistant_token());
create policy "Assistants cannot insert" on public.service_booking_messages as restrictive for insert to public with check (not public.is_assistant_token());
create policy "Assistants cannot update" on public.service_booking_messages as restrictive for update to public using (not public.is_assistant_token()) with check (not public.is_assistant_token());
create policy "Assistants cannot delete" on public.service_booking_messages as restrictive for delete to public using (not public.is_assistant_token());
create policy "Assistants cannot insert" on public.service_drafts as restrictive for insert to public with check (not public.is_assistant_token());
create policy "Assistants cannot update" on public.service_drafts as restrictive for update to public using (not public.is_assistant_token()) with check (not public.is_assistant_token());
create policy "Assistants cannot delete" on public.service_drafts as restrictive for delete to public using (not public.is_assistant_token());
create policy "Assistants cannot insert" on public.services as restrictive for insert to public with check (not public.is_assistant_token());
create policy "Assistants cannot update" on public.services as restrictive for update to public using (not public.is_assistant_token()) with check (not public.is_assistant_token());
create policy "Assistants cannot delete" on public.services as restrictive for delete to public using (not public.is_assistant_token());
create policy "Assistants cannot insert" on public.user_activity as restrictive for insert to public with check (not public.is_assistant_token());
create policy "Assistants cannot update" on public.user_activity as restrictive for update to public using (not public.is_assistant_token()) with check (not public.is_assistant_token());
create policy "Assistants cannot delete" on public.user_activity as restrictive for delete to public using (not public.is_assistant_token());
create policy "Assistants cannot insert" on public.user_preferences as restrictive for insert to public with check (not public.is_assistant_token());
create policy "Assistants cannot update" on public.user_preferences as restrictive for update to public using (not public.is_assistant_token()) with check (not public.is_assistant_token());
create policy "Assistants cannot delete" on public.user_preferences as restrictive for delete to public using (not public.is_assistant_token());
create policy "Assistants cannot insert" on public.watchlist as restrictive for insert to public with check (not public.is_assistant_token());
create policy "Assistants cannot update" on public.watchlist as restrictive for update to public using (not public.is_assistant_token()) with check (not public.is_assistant_token());
create policy "Assistants cannot delete" on public.watchlist as restrictive for delete to public using (not public.is_assistant_token());
create policy "Assistants cannot insert" on storage.objects as restrictive for insert to public with check (not public.is_assistant_token());
create policy "Assistants cannot update" on storage.objects as restrictive for update to public using (not public.is_assistant_token()) with check (not public.is_assistant_token());
create policy "Assistants cannot delete" on storage.objects as restrictive for delete to public using (not public.is_assistant_token());

-- ---------------------------------------------------------------------------
-- 3. SECURITY DEFINER write RPCs refuse assistant tokens first
-- ---------------------------------------------------------------------------
-- accept_job_offer(uuid)
CREATE OR REPLACE FUNCTION public.accept_job_offer(p_offer_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare offer public.bids%rowtype; job public.jobs%rowtype;
begin
  perform public.refuse_assistant_token();
  if auth.uid() is null then raise exception 'Sign in to accept an offer.'; end if;
  select * into offer from public.bids where id = p_offer_id;
  if not found then raise exception 'This offer is unavailable.'; end if;
  select * into job from public.jobs where id = offer.job_id for update;
  if not found or job.requester_id is distinct from auth.uid() then raise exception 'Only the requester can accept an offer.'; end if;
  if job.status <> 'open' then raise exception 'This job is no longer open.'; end if;
  select * into offer from public.bids where id = p_offer_id for update;
  if not found or offer.status <> 'pending' or offer.provider_id=job.requester_id then raise exception 'This offer is no longer pending.'; end if;
  update public.jobs set status = 'accepted' where id = job.id;
  update public.bids set status = 'accepted' where id = offer.id;
  update public.bids set status = 'rejected' where job_id = job.id and id <> offer.id and status = 'pending';
end;
$function$;

-- ai_admin_members()
CREATE OR REPLACE FUNCTION public.ai_admin_members()
 RETURNS TABLE(user_id uuid, full_name text, email text, connected_sessions integer, calls_today integer, calls_30d integer, refused_30d integer, last_call_at timestamp with time zone, paused boolean, pause_reason text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

-- ai_admin_set_enabled(boolean)
CREATE OR REPLACE FUNCTION public.ai_admin_set_enabled(p_enabled boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform public.refuse_assistant_token();
  if not public.current_user_is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  update public.ai_settings
  set ai_enabled = coalesce(p_enabled, false), updated_at = now(), updated_by = auth.uid()
  where id;
end;
$function$;

-- ai_admin_set_member_pause(uuid,boolean,text)
CREATE OR REPLACE FUNCTION public.ai_admin_set_member_pause(p_user_id uuid, p_paused boolean, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform public.refuse_assistant_token();
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
$function$;

-- change_pending_job_offer(uuid,text,numeric,text)
CREATE OR REPLACE FUNCTION public.change_pending_job_offer(p_offer_id uuid, p_intent text, p_amount numeric DEFAULT NULL::numeric, p_message text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare offer public.bids%rowtype; job public.jobs%rowtype;
begin
  perform public.refuse_assistant_token();
 if auth.uid() is null then raise exception 'Sign in first.'; end if;
 select * into offer from public.bids where id=p_offer_id;
 if not found or offer.provider_id is distinct from auth.uid() then raise exception 'This offer is unavailable.'; end if;
 select * into job from public.jobs where id=offer.job_id for update;
 if not found or job.status <> 'open' then raise exception 'This job is no longer open.'; end if;
 select * into offer from public.bids where id=p_offer_id for update;
 if not found or offer.status <> 'pending' or offer.provider_id is distinct from auth.uid() then raise exception 'This offer has changed.'; end if;
 if p_intent='withdraw' then
  delete from public.bids where id=offer.id;
 else raise exception 'Invalid offer action.';
 end if;
end;
$function$;

-- confirm_job(uuid,timestamp with time zone,text,text,text)
CREATE OR REPLACE FUNCTION public.confirm_job(p_bid uuid, p_arrival timestamp with time zone, p_method text, p_message text, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_bid public.bids%rowtype;
  v_job public.jobs%rowtype;
  v_end timestamptz;
  v_finish timestamptz;
  v_provider_name text;
  v_time text;
  v_label text;
  v_body text;
  v_day_suffix text;
  v_day_line text;
  v_note text := nullif(left(btrim(coalesce(p_note, '')), 500), '');
  v_msg_id uuid;
  v_ws public.work_schedules;
begin
  perform public.refuse_assistant_token();
  select * into v_bid from public.bids where id = p_bid for update;
  if not found then raise exception 'This offer is unavailable.'; end if;
  if v_bid.provider_id is distinct from auth.uid() or v_bid.status <> 'accepted' then
    raise exception 'Only the accepted provider can confirm the job.';
  end if;
  if p_method not in ('bank_transfer','cash','invoice','agreed') then
    raise exception 'Unknown payment method.';
  end if;

  select * into v_job from public.jobs where id = v_bid.job_id;
  if not found or v_job.status not in ('accepted','in_progress') then
    raise exception 'This job is not in a state to confirm.';
  end if;
  if p_arrival <= now() then
    raise exception 'Choose an arrival time in the future and a finish time after it';
  end if;

  v_end := p_arrival + interval '30 minutes';
  v_finish := public.arrival_expected_finish(p_arrival, v_end, null);
  v_time := to_char(p_arrival at time zone 'Pacific/Auckland', 'Dy FMDD Mon YYYY, FMHH12:MI am');
  v_label := case p_method
    when 'bank_transfer' then 'bank transfer'
    when 'cash' then 'cash on the day'
    when 'invoice' then 'invoice'
    else 'already agreed' end;
  select full_name into v_provider_name from public.profiles where id = v_bid.provider_id;

  -- One combined thread message: arrival (and how it matches the requested
  -- date), payment (with amount), optional note, then any payment details.
  -- How the chosen day relates to the date the requester asked for.
  select n.suffix, n.line into v_day_suffix, v_day_line
    from public.job_requested_day_note(
      v_job.schedule_type, v_job.scheduled_date, v_job.date_from, v_job.date_to,
      (p_arrival at time zone 'Pacific/Auckland')::date) n;

  v_body := format('Confirmed: I''ll be there around %s%s.', v_time, v_day_suffix);
  if v_day_line <> '' then
    v_body := v_body || E'\n' || v_day_line;
  end if;
  v_body := v_body || E'\n' || public.job_payment_line(v_bid.amount, v_bid.pricing_type, p_method);
  if v_note is not null then
    v_body := v_body || E'\n' || 'Note: ' || v_note;
  end if;
  if coalesce(btrim(p_message), '') <> '' then
    v_body := v_body || E'\n\n' || p_message;
  end if;
  insert into public.messages (job_id, sender_id, receiver_id, content)
  values (v_job.id, v_bid.provider_id, v_job.requester_id, v_body)
  returning id into v_msg_id;

  -- Arrival (reuses the shared finish rule).
  update public.work_schedules
     set arrival_start_at = p_arrival, arrival_end_at = v_end, expected_complete_at = v_finish,
         set_by = v_bid.provider_id, completion_prompted_at = null, updated_at = now()
   where job_id = v_job.id
  returning * into v_ws;
  if v_ws.id is null then
    insert into public.work_schedules (
      job_id, requester_id, provider_id, arrival_start_at, arrival_end_at, expected_complete_at, set_by
    ) values (
      v_job.id, v_job.requester_id, v_bid.provider_id, p_arrival, v_end, v_finish, v_bid.provider_id
    )
    returning * into v_ws;
  end if;

  -- Payment.
  update public.bids
     set payment_method = p_method, payment_details_sent_at = now(), payment_message_id = v_msg_id
   where id = v_bid.id;

  -- One notification (suppresses the individual arrival/payment ones).
  insert into public.notifications (user_id, type, body, metadata)
  values (
    v_job.requester_id, 'job_confirmed',
    format('%s confirmed "%s": around %s, %s.',
      coalesce(v_provider_name, 'The provider'), coalesce(v_job.title, 'the job'), v_time, v_label),
    jsonb_build_object('job_id', v_job.id, 'bid_id', v_bid.id)
  );
end;
$function$;

-- delete_managed_job(uuid)
CREATE OR REPLACE FUNCTION public.delete_managed_job(p_job_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare job public.jobs%rowtype;
begin
  perform public.refuse_assistant_token();
 select * into job from public.jobs where id=p_job_id for update;
 if auth.uid() is null or not found or job.requester_id is distinct from auth.uid() then raise exception 'This job is unavailable.'; end if;
 if job.status <> 'cancelled' and (job.status <> 'open' or exists(select 1 from public.bids where job_id=job.id)) then raise exception 'Cancel this job before deleting it.'; end if;
 delete from public.jobs where id=job.id;
end;
$function$;

-- invite_connection_to_job(uuid,uuid)
CREATE OR REPLACE FUNCTION public.invite_connection_to_job(p_job_id uuid, p_provider_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform public.refuse_assistant_token();
 perform public.send_job_invitation(auth.uid(),p_job_id,p_provider_id);
end $function$;

-- mark_job_payment_sent(uuid,boolean)
CREATE OR REPLACE FUNCTION public.mark_job_payment_sent(p_bid uuid, p_undo boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public.refuse_assistant_token();
  perform public.mark_job_payment_sorted(p_bid, p_undo);
end;
$function$;

-- mark_job_payment_sorted(uuid,boolean)
CREATE OR REPLACE FUNCTION public.mark_job_payment_sorted(p_bid uuid, p_undo boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_job_id uuid;
  v_bid public.bids%rowtype;
  v_job public.jobs%rowtype;
  v_other uuid;
  v_actor_name text;
begin
  perform public.refuse_assistant_token();
  select job_id into v_job_id from public.bids where id = p_bid;
  if not found then raise exception 'This offer is unavailable.'; end if;

  -- Match accept_job_offer's job → bid lock order. Wait for in-flight status
  -- changes before deciding whether the job is eligible.
  select * into v_job from public.jobs where id = v_job_id for share;
  if not found then raise exception 'This offer is unavailable.'; end if;

  -- Re-read the winning offer after acquiring its lock so duplicate requests
  -- observe a committed acknowledgement before deciding whether to write.
  select * into v_bid from public.bids where id = p_bid and job_id = v_job_id for update;
  if not found then raise exception 'This offer is unavailable.'; end if;
  if v_actor is null
     or v_bid.status is distinct from 'accepted'
     or (v_actor is distinct from v_bid.provider_id and v_actor is distinct from v_job.requester_id) then
    raise exception 'Only the requester or the accepted provider can update payment.';
  end if;
  if v_job.status is null or v_job.status not in ('accepted', 'completed') then
    raise exception 'Payment acknowledgement is only available for accepted or completed jobs.';
  end if;
  if v_bid.provider_id is null or v_bid.provider_id = v_job.requester_id
     or exists (
       select 1 from public.bids other
       where other.job_id = v_job.id and other.status = 'accepted' and other.id <> v_bid.id
     ) then
    raise exception 'This job does not have a valid winning offer.';
  end if;

  -- Nothing to change → no duplicate message or notification.
  if coalesce(p_undo, false) = (v_bid.payment_sorted_at is null) then
    return;
  end if;

  v_other := case when v_actor = v_bid.provider_id then v_job.requester_id else v_bid.provider_id end;
  select nullif(split_part(trim(coalesce(full_name, '')), ' ', 1), '') into v_actor_name
    from public.profiles where id = v_actor;

  if p_undo then
    update public.bids set payment_sorted_at = null, payment_sorted_by = null where id = v_bid.id;
  else
    update public.bids set payment_sorted_at = now(), payment_sorted_by = v_actor where id = v_bid.id;
  end if;

  insert into public.messages (job_id, sender_id, receiver_id, content)
  values (
    v_job.id, v_actor, v_other,
    case when p_undo then 'Payment marked as not sorted yet' else 'Payment all taken care of ✓' end
  );

  insert into public.notifications (user_id, type, body, metadata)
  values (
    v_other,
    case when p_undo then 'payment_unsorted' else 'payment_sorted' end,
    format(
      case when p_undo then '%s marked payment as not sorted yet for "%s".'
           else '%s marked payment as all taken care of for "%s".' end,
      coalesce(v_actor_name, 'Someone'), coalesce(v_job.title, 'the job')),
    jsonb_build_object('job_id', v_job.id, 'bid_id', v_bid.id)
  );
end;
$function$;

-- record_job_provider_view(uuid)
CREATE OR REPLACE FUNCTION public.record_job_provider_view(p_job_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
begin
  perform public.refuse_assistant_token();
  if v_user_id is null then
    return false;
  end if;

  if not exists (
    select 1
      from public.jobs j
      join public.profiles p on p.id = v_user_id
     where j.id = p_job_id
       and j.requester_id <> v_user_id
       and j.status = 'open'
       and coalesce(j.visibility, 'public') = 'public'
       and coalesce(p.primary_role, p.role, 'requester') in ('provider', 'both')
  ) then
    return false;
  end if;

  insert into public.job_provider_views (job_id, provider_id)
  values (p_job_id, v_user_id)
  on conflict (job_id, provider_id) do update
    set last_viewed_at = now(),
        open_count = public.job_provider_views.open_count + 1;

  return true;
end;
$function$;

-- record_seasonal_campaign_event(uuid,text)
CREATE OR REPLACE FUNCTION public.record_seasonal_campaign_event(p_campaign_id uuid, p_event text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
begin
  perform public.refuse_assistant_token();
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if p_event not in ('impression', 'dismiss', 'action') then
    raise exception 'Unsupported seasonal campaign event';
  end if;

  if not exists (
    select 1 from public.seasonal_campaigns c
     where c.id = p_campaign_id
       and c.is_active
       and c.in_app_enabled
       and current_date between c.starts_on and c.ends_on
  ) then
    return;
  end if;

  insert into public.seasonal_campaign_deliveries (
    campaign_id, user_id, first_impression_at, last_impression_at,
    impression_count, dismissed_at, actioned_at
  ) values (
    p_campaign_id, v_user_id,
    case when p_event = 'impression' then now() end,
    case when p_event = 'impression' then now() end,
    case when p_event = 'impression' then 1 else 0 end,
    case when p_event = 'dismiss' then now() end,
    case when p_event = 'action' then now() end
  )
  on conflict (campaign_id, user_id) do update set
    first_impression_at = case
      when p_event = 'impression' then coalesce(seasonal_campaign_deliveries.first_impression_at, now())
      else seasonal_campaign_deliveries.first_impression_at end,
    last_impression_at = case
      when p_event = 'impression' then now()
      else seasonal_campaign_deliveries.last_impression_at end,
    impression_count = seasonal_campaign_deliveries.impression_count
      + case when p_event = 'impression' then 1 else 0 end,
    dismissed_at = case
      when p_event = 'dismiss' then now()
      else seasonal_campaign_deliveries.dismissed_at end,
    actioned_at = case
      when p_event = 'action' then now()
      else seasonal_campaign_deliveries.actioned_at end,
    updated_at = now();
end;
$function$;

-- reinvite_to_job(uuid,uuid,integer)
CREATE OR REPLACE FUNCTION public.reinvite_to_job(p_job_id uuid, p_provider_id uuid, p_revision integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform public.refuse_assistant_token();
 if p_revision is null then raise exception 'Invitation revision required'; end if;
 perform public.send_job_invitation(auth.uid(),p_job_id,p_provider_id,p_revision);
end $function$;

-- respond_job_invitation(uuid,integer,text)
CREATE OR REPLACE FUNCTION public.respond_job_invitation(p_invite uuid, p_revision integer, p_action text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 actor uuid:=auth.uid();
 target_job uuid;
 j public.jobs%rowtype;
 i public.job_invites%rowtype;
 next_status text;
begin
  perform public.refuse_assistant_token();
 select job_id into target_job from public.job_invites where id=p_invite and actor in (requester_id,provider_id);
 if not found then raise exception 'Invitation unavailable'; end if;
 select * into j from public.jobs where id=target_job and status='open' for update;
 if not found then raise exception 'Job is no longer open'; end if;
 select * into i from public.job_invites where id=p_invite and job_id=target_job for update;
 if not found or i.requester_id<>j.requester_id or i.revision is distinct from p_revision
  or i.status not in ('pending','seen','accepted') then raise exception 'Invitation changed. Refresh and try again'; end if;
 if p_action='withdraw' and actor=j.requester_id then next_status:='withdrawn';
 elsif actor=i.provider_id and p_action in ('view','accept','decline') then
  next_status:=case p_action when 'view' then case when i.status='pending' then 'seen' else i.status end
                when 'accept' then 'accepted' else 'declined' end;
 else raise exception 'Invitation action not permitted'; end if;
 if next_status<>i.status then update public.job_invites set status=next_status where id=i.id; end if;
 return target_job;
end $function$;

-- save_job_with_private_photos(uuid,jsonb,uuid[],jsonb)
CREATE OR REPLACE FUNCTION public.save_job_with_private_photos(p_job uuid, p_details jsonb, p_expected uuid[], p_photos jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := auth.uid();
  j public.jobs%rowtype;
  d public.jobs%rowtype;
  current_ids uuid[];
  desired_ids uuid[];
  item record;
  m public.job_primary_media%rowtype;
begin
  perform public.refuse_assistant_token();
  select * into j from public.jobs where id=p_job and requester_id=actor and status='open' for update;
  if not found then raise exception 'Only the requester can edit an open job'; end if;
  if jsonb_typeof(p_details) is distinct from 'object' or jsonb_typeof(p_photos) is distinct from 'array'
    then raise exception 'Invalid photo edit'; end if;
  d:=jsonb_populate_record(null::public.jobs,p_details);
  if not (coalesce(d.photos,array[]::text[]) <@ coalesce(j.photos,array[]::text[]))
    or jsonb_array_length(p_photos)+coalesce(cardinality(d.photos),0)>6
    then raise exception 'Invalid job photos'; end if;
  if exists(select 1 from jsonb_to_recordset(p_photos) as x(id uuid,slot smallint,checksum text)
    where id is null or slot is null or slot not between 0 and 6)
    or (select count(distinct slot)<>count(*) or count(distinct id)<>count(*)
      from jsonb_to_recordset(p_photos) as x(id uuid,slot smallint))
    then raise exception 'Invalid photo slots'; end if;
  select coalesce(array_agg(draft_id order by draft_id),'{}') into current_ids
    from public.job_primary_media where job_id=p_job and state='published';
  select coalesce(array_agg(id order by id),'{}') into desired_ids from jsonb_to_recordset(p_photos) as x(id uuid);
  if current_ids is distinct from p_expected and current_ids<>desired_ids
    then raise exception 'The gallery has changed. Refresh before saving'; end if;

  for item in select * from jsonb_to_recordset(p_photos) as x(id uuid,slot smallint,checksum text) order by id loop
    select * into m from public.job_primary_media where draft_id=item.id and state in ('staged','published') for update;
    if not found or m.requester_id<>actor then raise exception 'Photo is unavailable'; end if;
    if m.job_id=p_job and m.state='published' and m.slot=item.slot
       and (item.checksum is null or item.checksum=m.checksum) then continue; end if;
    if m.job_id is not null or m.state<>'staged' or m.edit_job_id is distinct from p_job
       or m.uploaded_at is null or m.expires_at<=clock_timestamp() or m.checksum is distinct from item.checksum
       or not exists(select 1 from storage.objects where bucket_id='job-primary-media' and name=m.object_key)
      then raise exception 'Upload the photo again'; end if;
    perform public.require_job_primary_media_enabled();
  end loop;

  if cardinality(current_ids)>0 or cardinality(desired_ids)>0 then
    insert into public.jobs_with_managed_photos values(p_job) on conflict do nothing;
  end if;
  update public.jobs set title=d.title,description=d.description,category=d.category,
    price_type=d.price_type,price=d.price,location_name=d.location_name,location_area=d.location_area,
    location_note=d.location_note,hide_exact_location=d.hide_exact_location,latitude=d.latitude,longitude=d.longitude,
    schedule_type=d.schedule_type,scheduled_date=d.scheduled_date,date_from=d.date_from,date_to=d.date_to,
    materials_type=d.materials_type,access_conditions=d.access_conditions,photos=d.photos,
    area_polygon=case when (j.location_name,j.latitude,j.longitude) is distinct from (d.location_name,d.latitude,d.longitude)
                      then null else j.area_polygon end,
    area_hectares=case when (j.location_name,j.latitude,j.longitude) is distinct from (d.location_name,d.latitude,d.longitude)
                      then null else j.area_hectares end
  where id=p_job;
  update public.job_primary_media set job_id=null,state='deleting',expires_at=clock_timestamp()
    where job_id=p_job and not (draft_id=any(desired_ids));
  update public.job_primary_media media set job_id=p_job,state='published',slot=x.slot
    from jsonb_to_recordset(p_photos) as x(id uuid,slot smallint)
    where media.draft_id=x.id and media.state='staged' and media.edit_job_id=p_job;
  return p_job;
end $function$;

-- send_running_late_notice(uuid,uuid,integer)
CREATE OR REPLACE FUNCTION public.send_running_late_notice(p_job_id uuid, p_booking_id uuid, p_minutes integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_schedule public.work_schedules;
  v_target uuid;
  v_title text;
begin
  perform public.refuse_assistant_token();
  if v_actor is null
     or (p_job_id is null) = (p_booking_id is null)
     or p_minutes not in (15, 30, 60)
  then
    raise exception 'Invalid late notice';
  end if;

  select * into v_schedule
    from public.work_schedules ws
   where (p_job_id is not null and ws.job_id = p_job_id)
      or (p_booking_id is not null and ws.booking_id = p_booking_id)
   for update;

  if v_schedule.id is null or v_actor not in (v_schedule.requester_id, v_schedule.provider_id) then
    raise exception 'Not authorised';
  end if;
  if v_schedule.last_late_notice_at > now() - interval '15 minutes' then
    raise exception 'A late notice was sent recently';
  end if;

  if p_job_id is not null then
    select title into v_title from public.jobs
     where id = p_job_id and status in ('accepted', 'in_progress');
  else
    select coalesce(s.title, 'service booking') into v_title
      from public.bookings bk left join public.services s on s.id = bk.service_id
     where bk.id = p_booking_id and bk.status in ('confirmed', 'in_progress');
  end if;
  if v_title is null then
    raise exception 'This work is no longer active';
  end if;

  v_target := case when v_actor = v_schedule.provider_id
    then v_schedule.requester_id else v_schedule.provider_id end;

  update public.work_schedules
     set last_late_notice_at = now(),
         last_late_notice_by = v_actor,
         last_late_minutes = p_minutes,
         updated_at = now()
   where id = v_schedule.id;

  insert into public.notifications (user_id, type, body, metadata)
  values (
    v_target,
    'running_late',
    format('The other party is running about %s minutes late for "%s".', p_minutes, v_title),
    jsonb_strip_nulls(jsonb_build_object(
      'job_id', p_job_id,
      'booking_id', p_booking_id,
      'minutes_late', p_minutes
    ))
  );
end;
$function$;

-- set_job_payment_method(uuid,text,text)
CREATE OR REPLACE FUNCTION public.set_job_payment_method(p_bid uuid, p_method text, p_message text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_bid public.bids%rowtype;
  v_job public.jobs%rowtype;
  v_body text;
  v_msg_id uuid;
begin
  perform public.refuse_assistant_token();
  select * into v_bid from public.bids where id = p_bid for update;
  if not found then raise exception 'This offer is unavailable.'; end if;
  if v_bid.provider_id is distinct from auth.uid() or v_bid.status <> 'accepted' then
    raise exception 'Only the accepted provider can set the payment method.';
  end if;
  if p_method not in ('bank_transfer','cash','invoice','agreed') then
    raise exception 'Unknown payment method.';
  end if;

  select * into v_job from public.jobs where id = v_bid.job_id;
  if not found or v_job.status not in ('accepted','in_progress') then
    raise exception 'This job is not in a state to arrange payment.';
  end if;

  v_body := public.job_payment_line(v_bid.amount, v_bid.pricing_type, p_method);
  if coalesce(btrim(p_message), '') <> '' then
    v_body := v_body || E'\n\n' || p_message;
  end if;
  insert into public.messages (job_id, sender_id, receiver_id, content)
  values (v_job.id, v_bid.provider_id, v_job.requester_id, v_body)
  returning id into v_msg_id;

  update public.bids
    set payment_method = p_method,
        payment_details_sent_at = now(),
        payment_message_id = v_msg_id
    where id = v_bid.id;

  insert into public.notifications (user_id, type, body, metadata)
  values (
    v_job.requester_id,
    'payment_details_sent',
    format('The provider shared how to pay for "%s".', coalesce(v_job.title, 'your job')),
    jsonb_build_object('job_id', v_job.id, 'bid_id', v_bid.id)
  );
end;
$function$;

-- set_work_arrival_window(uuid,uuid,timestamp with time zone,timestamp with time zone,timestamp with time zone)
CREATE OR REPLACE FUNCTION public.set_work_arrival_window(p_job_id uuid, p_booking_id uuid, p_start timestamp with time zone, p_end timestamp with time zone, p_expected_complete timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS work_schedules
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_requester uuid;
  v_provider uuid;
  v_title text;
  v_finish timestamptz;
  v_row public.work_schedules;
begin
  perform public.refuse_assistant_token();
  if v_actor is null or (p_job_id is null) = (p_booking_id is null) then
    raise exception 'Invalid schedule request';
  end if;
  if p_start <= now() or p_end <= p_start or p_end > p_start + interval '24 hours' then
    raise exception 'Choose an arrival time in the future and a finish time after it';
  end if;
  if p_expected_complete is not null
     and (p_expected_complete < p_end or p_expected_complete > p_start + interval '7 days') then
    raise exception 'Choose an arrival time in the future and a finish time after it';
  end if;
  v_finish := public.arrival_expected_finish(p_start, p_end, p_expected_complete);

  if p_job_id is not null then
    select j.requester_id, b.provider_id, j.title
      into v_requester, v_provider, v_title
      from public.jobs j
      join public.bids b on b.job_id = j.id and b.status = 'accepted'
     where j.id = p_job_id and j.status in ('accepted', 'in_progress');
  else
    select bk.requester_id, bk.provider_id, coalesce(s.title, 'service booking')
      into v_requester, v_provider, v_title
      from public.bookings bk
      left join public.services s on s.id = bk.service_id
     where bk.id = p_booking_id and bk.status in ('confirmed', 'in_progress');
  end if;

  if v_provider is null or v_actor <> v_provider then
    raise exception 'Only the confirmed provider can set the arrival window';
  end if;

  update public.work_schedules
     set arrival_start_at = p_start, arrival_end_at = p_end, expected_complete_at = v_finish,
         set_by = v_actor, completion_prompted_at = null, updated_at = now()
   where (p_job_id is not null and job_id = p_job_id)
      or (p_booking_id is not null and booking_id = p_booking_id)
  returning * into v_row;

  if v_row.id is null then
    insert into public.work_schedules (
      job_id, booking_id, requester_id, provider_id,
      arrival_start_at, arrival_end_at, expected_complete_at, set_by
    ) values (
      p_job_id, p_booking_id, v_requester, v_provider, p_start, p_end, v_finish, v_actor
    )
    returning * into v_row;
  end if;

  insert into public.notifications (user_id, type, body, metadata)
  values (
    v_requester, 'arrival_window_confirmed',
    format('Expected arrival for "%s": around %s.', coalesce(v_title, 'confirmed work'),
      to_char(p_start at time zone 'Pacific/Auckland', 'Dy FMDD Mon YYYY, FMHH12:MI am')),
    jsonb_strip_nulls(jsonb_build_object('job_id', p_job_id, 'booking_id', p_booking_id, 'work_schedule_id', v_row.id))
  );
  return v_row;
end;
$function$;

-- update_pending_job_offer_details(uuid,jsonb)
CREATE OR REPLACE FUNCTION public.update_pending_job_offer_details(p_offer_id uuid, p_details jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare amount numeric; item jsonb; total numeric:=0; available text; offer public.bids%rowtype; job public.jobs%rowtype;
begin
  perform public.refuse_assistant_token();
 if auth.uid() is null then raise exception 'Sign in first.'; end if;
 select * into offer from public.bids where id=p_offer_id;
 if not found or offer.provider_id is distinct from auth.uid() then raise exception 'This offer is unavailable.'; end if;
 select * into job from public.jobs where id=offer.job_id for update;
 if not found or job.status <> 'open' then raise exception 'This job is no longer open.'; end if;
 select * into offer from public.bids where id=p_offer_id for update;
 if not found or offer.status <> 'pending' or offer.provider_id is distinct from auth.uid() then raise exception 'This offer has changed.'; end if;
 if length(coalesce(p_details->>'message',''))>5000 then raise exception 'Message is too long.'; end if;
 if jsonb_typeof(p_details) is distinct from 'object' or jsonb_typeof(p_details->'line_items') is distinct from 'array' then raise exception 'Invalid offer details.'; end if;
 if jsonb_array_length(p_details->'line_items') not between 1 and 12 then raise exception 'Add one to twelve price lines.'; end if;
 for item in select * from jsonb_array_elements(p_details->'line_items') loop
  if nullif(trim(item->>'label'),'') is null or length(item->>'label')>120 or jsonb_typeof(item->'amount') is distinct from 'number' then raise exception 'Invalid price line.'; end if;
  amount=(item->>'amount')::numeric;
  if amount<0 or amount>10000000 then raise exception 'Invalid price amount.'; end if;
  total=total+amount;
 end loop;
 if total<=0 or total>10000000 or round(total,2) is distinct from (p_details->>'amount')::numeric then raise exception 'Offer amount must equal price lines.'; end if;
 if coalesce(p_details->>'pricing_type','') not in ('fixed','hourly','per_unit','quote') or (p_details->>'materials' is not null and p_details->>'materials' not in ('included','estimate','quote')) or length(coalesce(p_details->>'estimated_duration',''))>150 then raise exception 'Invalid offer terms.'; end if;
 available=nullif(p_details->>'available_from','');
 if available is not null and (available !~ '^\d{4}-\d{2}-\d{2}$' or to_char(available::date,'YYYY-MM-DD')<>available) then raise exception 'Invalid availability date.'; end if;
 update public.bids set amount=round(total,2),line_items=p_details->'line_items',message=nullif(trim(p_details->>'message'),''),pricing_type=p_details->>'pricing_type',materials=p_details->>'materials',available_from=available,estimated_duration=nullif(p_details->>'estimated_duration','') where id=p_offer_id;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 4. Every table with a write policy must have all three restrictive guards
-- ---------------------------------------------------------------------------
do $$
declare
  v_missing text;
begin
  select string_agg(t, ', ') into v_missing
  from (
    select distinct p.schemaname || '.' || p.tablename as t
    from pg_policies p
    where p.schemaname in ('public', 'storage')
      and p.permissive = 'PERMISSIVE'
      and p.cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
      and (
        select count(*) from pg_policies g
        where g.schemaname = p.schemaname and g.tablename = p.tablename
          and g.permissive = 'RESTRICTIVE'
          and g.policyname in ('Assistants cannot insert', 'Assistants cannot update', 'Assistants cannot delete')
      ) < 3
  ) gaps;
  if v_missing is not null then
    raise exception 'Assistant write guard missing on: %', v_missing;
  end if;
end;
$$;
