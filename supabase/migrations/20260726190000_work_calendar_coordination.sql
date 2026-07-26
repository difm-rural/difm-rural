-- Confirmed-work scheduling, late notices and due-completion prompts.

create table if not exists public.work_schedules (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.jobs(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete cascade,
  requester_id uuid not null references public.profiles(id) on delete cascade,
  provider_id uuid not null references public.profiles(id) on delete cascade,
  arrival_start_at timestamptz not null,
  arrival_end_at timestamptz not null,
  set_by uuid not null references public.profiles(id),
  last_late_notice_at timestamptz,
  last_late_notice_by uuid references public.profiles(id),
  last_late_minutes integer,
  completion_prompted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((job_id is null) <> (booking_id is null)),
  check (arrival_end_at > arrival_start_at),
  check (last_late_minutes is null or last_late_minutes in (15, 30, 60))
);

create unique index if not exists work_schedules_job_unique
  on public.work_schedules(job_id) where job_id is not null;
create unique index if not exists work_schedules_booking_unique
  on public.work_schedules(booking_id) where booking_id is not null;
create index if not exists work_schedules_due_idx
  on public.work_schedules(arrival_end_at)
  where completion_prompted_at is null;

alter table public.work_schedules enable row level security;

drop policy if exists "Work participants can view schedules" on public.work_schedules;
create policy "Work participants can view schedules"
  on public.work_schedules for select
  using (auth.uid() in (requester_id, provider_id));

revoke all on public.work_schedules from anon, authenticated;
grant select on public.work_schedules to authenticated;

create or replace function public.set_work_arrival_window(
  p_job_id uuid,
  p_booking_id uuid,
  p_start timestamptz,
  p_end timestamptz
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
  if p_start <= now() or p_end <= p_start or p_end > p_start + interval '24 hours' then
    raise exception 'Choose a future arrival window of up to 24 hours';
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
         set_by = v_actor,
         completion_prompted_at = null,
         updated_at = now()
   where (p_job_id is not null and job_id = p_job_id)
      or (p_booking_id is not null and booking_id = p_booking_id)
  returning * into v_row;

  if v_row.id is null then
    insert into public.work_schedules (
      job_id, booking_id, requester_id, provider_id,
      arrival_start_at, arrival_end_at, set_by
    ) values (
      p_job_id, p_booking_id, v_requester, v_provider,
      p_start, p_end, v_actor
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

revoke all on function public.set_work_arrival_window(uuid, uuid, timestamptz, timestamptz) from public;
grant execute on function public.set_work_arrival_window(uuid, uuid, timestamptz, timestamptz) to authenticated;

create or replace function public.send_running_late_notice(
  p_job_id uuid,
  p_booking_id uuid,
  p_minutes integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_schedule public.work_schedules;
  v_target uuid;
  v_title text;
begin
  if v_actor is null or p_minutes not in (15, 30, 60) then
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
$$;

revoke all on function public.send_running_late_notice(uuid, uuid, integer) from public;
grant execute on function public.send_running_late_notice(uuid, uuid, integer) to authenticated;

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
       and ws.arrival_end_at <= now()
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
        format('The planned window for "%s" has ended. Mark it complete when the work is done.', v_row.title),
        jsonb_strip_nulls(jsonb_build_object('job_id', v_row.job_id, 'booking_id', v_row.booking_id))
      ),
      (
        v_row.requester_id,
        'work_completion_due',
        format('The planned window for "%s" has ended. You will be asked to confirm when the provider marks it complete.', v_row.title),
        jsonb_strip_nulls(jsonb_build_object('job_id', v_row.job_id, 'booking_id', v_row.booking_id))
      );
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.queue_due_work_completion_prompts() from public, anon, authenticated;

create extension if not exists pg_cron;
select cron.unschedule(jobid)
  from cron.job
 where jobname = 'queue-due-work-completion-prompts';
select cron.schedule(
  'queue-due-work-completion-prompts',
  '*/15 * * * *',
  $$select public.queue_due_work_completion_prompts();$$
);
