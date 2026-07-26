-- Arrival and expected completion are different commitments. Keep both so
-- calendar duration and completion prompts do not use the arrival-window end.

alter table public.work_schedules
  add column if not exists expected_complete_at timestamptz;

update public.work_schedules
   set expected_complete_at = arrival_end_at
 where expected_complete_at is null;

alter table public.work_schedules
  alter column expected_complete_at set not null;

alter table public.work_schedules
  drop constraint if exists work_schedules_expected_complete_check;
alter table public.work_schedules
  add constraint work_schedules_expected_complete_check
  check (
    expected_complete_at >= arrival_end_at
    and expected_complete_at <= arrival_start_at + interval '7 days'
  );

drop index if exists public.work_schedules_due_idx;
create index work_schedules_due_idx
  on public.work_schedules(expected_complete_at)
  where completion_prompted_at is null;

drop function if exists public.set_work_arrival_window(uuid, uuid, timestamptz, timestamptz);
create or replace function public.set_work_arrival_window(
  p_job_id uuid,
  p_booking_id uuid,
  p_start timestamptz,
  p_end timestamptz,
  p_expected_complete timestamptz
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
  v_row public.work_schedules;
begin
  if v_actor is null or (p_job_id is null) = (p_booking_id is null) then
    raise exception 'Invalid schedule request';
  end if;
  if p_start <= now()
     or p_end <= p_start
     or p_end > p_start + interval '24 hours'
     or p_expected_complete < p_end
     or p_expected_complete > p_start + interval '7 days'
  then
    raise exception 'Choose a future arrival window and a valid expected finish';
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
         expected_complete_at = p_expected_complete,
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
      p_start, p_end, p_expected_complete, v_actor
    )
    returning * into v_row;
  end if;

  insert into public.notifications (user_id, type, body, metadata)
  values (
    v_requester,
    'arrival_window_confirmed',
    format(
      'Arrival for "%s" is planned for %s to %s.',
      coalesce(v_title, 'confirmed work'),
      to_char(p_start at time zone 'Pacific/Auckland', 'Dy FMDD Mon, HH12:MIam'),
      to_char(p_end at time zone 'Pacific/Auckland', 'HH12:MIam')
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
        format('The expected finish time for "%s" has passed. Mark it complete when the work is done.', v_row.title),
        jsonb_strip_nulls(jsonb_build_object('job_id', v_row.job_id, 'booking_id', v_row.booking_id))
      ),
      (
        v_row.requester_id,
        'work_completion_due',
        format('The expected finish time for "%s" has passed. You will be asked to confirm when the provider marks it complete.', v_row.title),
        jsonb_strip_nulls(jsonb_build_object('job_id', v_row.job_id, 'booking_id', v_row.booking_id))
      );
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
