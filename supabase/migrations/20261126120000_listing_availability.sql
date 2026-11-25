begin;

alter table public.services
  add column availability_status text not null default 'accepting_bookings',
  add column lead_time_type text not null default 'not_specified',
  add column lead_time_min_days integer,
  add column lead_time_max_days integer,
  add column lead_time_date date,
  add column availability_message text,
  add column availability_updated_at timestamptz,
  add constraint services_availability_status_valid check (
    availability_status in ('accepting_bookings', 'limited', 'paused')
  ),
  add constraint services_availability_message_length check (char_length(availability_message) <= 250),
  add constraint services_lead_time_valid check (
    case lead_time_type
      when 'fixed_days' then lead_time_min_days is not null and lead_time_min_days > 0
        and lead_time_max_days is null and lead_time_date is null
      when 'range_days' then lead_time_min_days is not null and lead_time_min_days > 0
        and lead_time_max_days is not null and lead_time_max_days > lead_time_min_days and lead_time_date is null
      when 'earliest_date' then lead_time_date is not null and isfinite(lead_time_date)
        and lead_time_min_days is null and lead_time_max_days is null
      else lead_time_type in ('not_specified', 'same_day', 'next_day', 'contact_provider')
        and lead_time_min_days is null and lead_time_max_days is null and lead_time_date is null
    end
  );

create function public.stamp_listing_availability() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.availability_message := nullif(btrim(new.availability_message), '');
  if tg_op = 'UPDATE' then
    if row(new.availability_status, new.lead_time_type, new.lead_time_min_days,
           new.lead_time_max_days, new.lead_time_date, new.availability_message)
       is not distinct from
       row(old.availability_status, old.lead_time_type, old.lead_time_min_days,
           old.lead_time_max_days, old.lead_time_date, old.availability_message)
       and old.availability_updated_at is not null then
      new.availability_updated_at := old.availability_updated_at;
    else
      new.availability_updated_at := statement_timestamp();
    end if;
  elsif new.availability_status <> 'accepting_bookings' or new.lead_time_type <> 'not_specified'
        or new.availability_message is not null then
    new.availability_updated_at := statement_timestamp();
  else
    new.availability_updated_at := null;
  end if;
  if new.lead_time_date is not null
     and new.lead_time_date < (statement_timestamp() at time zone 'Pacific/Auckland')::date then
    if tg_op = 'INSERT' then
      raise exception using errcode = '22007', message = 'Choose today or a future earliest date.';
    elsif new.lead_time_date is distinct from old.lead_time_date then
      raise exception using errcode = '22007', message = 'Choose today or a future earliest date.';
    end if;
  end if;
  return new;
end $$;

create trigger services_stamp_availability_insert before insert on public.services
  for each row execute function public.stamp_listing_availability();
create trigger services_stamp_availability_update before update of availability_status, lead_time_type,
  lead_time_min_days, lead_time_max_days, lead_time_date, availability_message, availability_updated_at
  on public.services for each row execute function public.stamp_listing_availability();

create function public.guard_paused_listing_booking() returns trigger
language plpgsql security definer set search_path = '' as $$
declare current_status text;
begin
  -- SHARE conflicts with a listing update and permits concurrent booking requests.
  select s.availability_status into current_status
  from public.services s where s.id = new.service_id for share;
  if current_status = 'paused' then
    -- Legacy clients use INSERT ON CONFLICT DO NOTHING with the original request ID.
    if auth.uid() = new.requester_id and exists (
      select 1 from public.bookings b where b.id = new.id
      and b.service_id = new.service_id and b.requester_id = new.requester_id
      and b.provider_id = new.provider_id
    ) then
      return new;
    end if;
    raise exception using errcode = 'P0A01',
      message = 'This listing is temporarily paused for new requests. You can still contact the provider.';
  end if;
  return new;
end $$;

revoke all on function public.guard_paused_listing_booking() from public, anon, authenticated;
create trigger bookings_guard_listing_availability before insert on public.bookings
  for each row execute function public.guard_paused_listing_booking();

-- Recreate the original projection in the same order so grants, dependencies,
-- PostgREST joins and private location masking survive the appended columns.
do $$ declare fields text; begin
  select string_agg(case
    when a.attname in ('latitude','longitude','service_latitude','service_longitude','location_note')
    then format('null::%s as %I',format_type(a.atttypid,a.atttypmod),a.attname)
    else format('s.%I',a.attname) end, ', ' order by a.attnum) into fields
  from pg_attribute a where a.attrelid = 'public.services'::regclass and a.attnum > 0 and not a.attisdropped
    and a.attname not in ('availability_status','lead_time_type','lead_time_min_days',
                          'lead_time_max_days','lead_time_date','availability_message','availability_updated_at');
  execute 'create or replace view public.services_public with (security_barrier=true) as select ' || fields || ',
    s.service_latitude::double precision as discovery_latitude,
    s.service_longitude::double precision as discovery_longitude, true as discovery_location_approximate,
    s.availability_status, s.lead_time_type, s.lead_time_min_days, s.lead_time_max_days,
    s.lead_time_date, s.availability_message, s.availability_updated_at
    from public.services s where (s.is_active and s.closed_at is null) or s.provider_id=auth.uid()
    or public.can_read_listing_context(s.id)';
end $$;

notify pgrst, 'reload schema';
commit;
