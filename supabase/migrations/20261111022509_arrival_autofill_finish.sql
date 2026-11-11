-- The expected finish is no longer asked for. Keep the column (admin stats and
-- completion prompts read it) and fill it in automatically when the client does
-- not send one. Signature stays 5-arg (p_expected_complete now defaults NULL) so
-- older clients that still pass a finish keep working.

drop function if exists public.set_work_arrival_window(uuid, uuid, timestamptz, timestamptz, timestamptz);
create function public.set_work_arrival_window(
  p_job_id uuid,
  p_booking_id uuid,
  p_start timestamptz,
  p_end timestamptz,
  p_expected_complete timestamptz default null
)
returns public.work_schedules
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_requester uuid;
  v_provider uuid;
  v_title text;
  v_finish timestamptz;
  v_row public.work_schedules;
begin
  if v_actor is null or (p_job_id is null) = (p_booking_id is null) then
    raise exception 'Invalid schedule request';
  end if;
  if p_start <= now() or p_end <= p_start or p_end > p_start + interval '24 hours' then
    raise exception 'Choose an arrival time in the future and a finish time after it';
  end if;

  if p_expected_complete is null then
    -- Default: 6:00 pm NZ on the arrival's NZ date, or arrival + 3 hours if that
    -- is later; never before the arrival end, and within the 7-day cap.
    v_finish := greatest(
      ((p_start at time zone 'Pacific/Auckland')::date + time '18:00') at time zone 'Pacific/Auckland',
      p_start + interval '3 hours'
    );
    v_finish := greatest(v_finish, p_end);
    v_finish := least(v_finish, p_start + interval '7 days');
  else
    if p_expected_complete < p_end or p_expected_complete > p_start + interval '7 days' then
      raise exception 'Choose an arrival time in the future and a finish time after it';
    end if;
    v_finish := p_expected_complete;
  end if;

  if p_job_id is not null then
    select j.requester_id, b.provider_id, j.title
      into v_requester, v_provider, v_title
      from public.jobs j
      join public.bids b on b.job_id = j.id and b.status = 'accepted'
     where j.id = p_job_id
       and j.status in ('accepted', 'in_progress');
  else
    select bk.requester_id, bk.provider_id, coalesce(s.title, 'service booking')
      into v_requester, v_provider, v_title
      from public.bookings bk
      left join public.services s on s.id = bk.service_id
     where bk.id = p_booking_id
       and bk.status in ('confirmed', 'in_progress');
  end if;

  if v_provider is null or v_actor <> v_provider then
    raise exception 'Only the confirmed provider can set the arrival window';
  end if;

  update public.work_schedules
     set arrival_start_at = p_start,
         arrival_end_at = p_end,
         expected_complete_at = v_finish,
         set_by = v_actor,
         completion_prompted_at = null,
         updated_at = now()
   where (p_job_id is not null and job_id = p_job_id)
      or (p_booking_id is not null and booking_id = p_booking_id)
  returning * into v_row;

  if v_row.id is null then
    insert into public.work_schedules (
      job_id, booking_id, requester_id, provider_id,
      arrival_start_at, arrival_end_at, expected_complete_at, set_by
    ) values (
      p_job_id, p_booking_id, v_requester, v_provider,
      p_start, p_end, v_finish, v_actor
    )
    returning * into v_row;
  end if;

  insert into public.notifications (user_id, type, body, metadata)
  values (
    v_requester,
    'arrival_window_confirmed',
    format(
      'Expected arrival for "%s": around %s.',
      coalesce(v_title, 'confirmed work'),
      to_char(p_start at time zone 'Pacific/Auckland', 'Dy FMDD Mon, HH12:MIam')
    ),
    jsonb_strip_nulls(jsonb_build_object(
      'job_id', p_job_id,
      'booking_id', p_booking_id,
      'work_schedule_id', v_row.id
    ))
  );
  return v_row;
end;
$$;

revoke all on function public.set_work_arrival_window(uuid, uuid, timestamptz, timestamptz, timestamptz) from public;
grant execute on function public.set_work_arrival_window(uuid, uuid, timestamptz, timestamptz, timestamptz) to authenticated;

-- Completion reminder no longer promises a finish time.
create or replace function public.queue_due_work_completion_prompts()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_count integer := 0;
begin
  for v_row in
    select ws.*,
           coalesce(j.title, s.title, 'confirmed work') as title
      from public.work_schedules ws
      left join public.jobs j on j.id = ws.job_id
      left join public.bookings bk on bk.id = ws.booking_id
      left join public.services s on s.id = bk.service_id
     where ws.completion_prompted_at is null
       and ws.expected_complete_at <= now()
       and (
         (ws.job_id is not null and j.status in ('accepted', 'in_progress'))
         or
         (ws.booking_id is not null and bk.status in ('confirmed', 'in_progress'))
       )
     for update of ws skip locked
  loop
    update public.work_schedules
       set completion_prompted_at = now(), updated_at = now()
     where id = v_row.id
       and completion_prompted_at is null;
    if not found then continue; end if;

    insert into public.notifications (user_id, type, body, metadata)
    values
      (
        v_row.provider_id,
        'work_completion_due',
        format('How did "%s" go? Mark it complete when the work''s done.', v_row.title),
        jsonb_strip_nulls(jsonb_build_object('job_id', v_row.job_id, 'booking_id', v_row.booking_id))
      ),
      (
        v_row.requester_id,
        'work_completion_due',
        format('How did "%s" go? You will be asked to confirm when the provider marks it complete.', v_row.title),
        jsonb_strip_nulls(jsonb_build_object('job_id', v_row.job_id, 'booking_id', v_row.booking_id))
      );
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
