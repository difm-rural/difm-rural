-- Require exactly one work target for late notices.
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
$$;

revoke all on function public.send_running_late_notice(uuid, uuid, integer) from public;
grant execute on function public.send_running_late_notice(uuid, uuid, integer) to authenticated;
