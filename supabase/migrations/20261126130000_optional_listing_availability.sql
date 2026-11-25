begin;

alter table public.services add column availability_enabled boolean not null default false;

-- Preserve the availability already published by Release 1 owners.
update public.services set availability_enabled = true
where availability_updated_at is not null or availability_status <> 'accepting_bookings'
  or lead_time_type <> 'not_specified' or nullif(btrim(availability_message), '') is not null;

create or replace function public.stamp_listing_availability() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.availability_message := nullif(btrim(new.availability_message), '');
  if tg_op = 'UPDATE' then
    new.availability_updated_at := old.availability_updated_at;
    if new.availability_enabled and (
      old.availability_updated_at is null or
      row(new.availability_enabled, new.availability_status, new.lead_time_type,
          new.lead_time_min_days, new.lead_time_max_days, new.lead_time_date, new.availability_message)
      is distinct from
      row(old.availability_enabled, old.availability_status, old.lead_time_type,
          old.lead_time_min_days, old.lead_time_max_days, old.lead_time_date, old.availability_message)
    ) then
      new.availability_updated_at := statement_timestamp();
    end if;
  else
    new.availability_updated_at := case when new.availability_enabled then statement_timestamp() end;
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

drop trigger services_stamp_availability_update on public.services;
create trigger services_stamp_availability_update before update of availability_enabled, availability_status,
  lead_time_type, lead_time_min_days, lead_time_max_days, lead_time_date, availability_message, availability_updated_at
  on public.services for each row execute function public.stamp_listing_availability();

create or replace function public.guard_paused_listing_booking() returns trigger
language plpgsql security definer set search_path = '' as $$
declare paused boolean;
begin
  select s.availability_enabled and s.availability_status = 'paused' into paused
  from public.services s where s.id = new.service_id for share;
  if paused then
    if auth.uid() = new.requester_id and exists (
      select 1 from public.bookings b where b.id = new.id and b.service_id = new.service_id
        and b.requester_id = new.requester_id and b.provider_id = new.provider_id
    ) then
      return new;
    end if;
    raise exception using errcode = 'P0A01',
      message = 'This listing is temporarily paused for new requests. You can still contact the provider.';
  end if;
  return new;
end $$;

-- Preserve the public view contract for Release 1 clients. Dormant settings
-- stay on the owner row; older public readers see an ordinary, bookable listing.
do $$ declare fields text; begin
  select string_agg(case
    when a.attname in ('latitude','longitude','service_latitude','service_longitude','location_note')
    then format('null::%s as %I',format_type(a.atttypid,a.atttypmod),a.attname)
    else format('s.%I',a.attname) end, ', ' order by a.attnum) into fields
  from pg_attribute a where a.attrelid = 'public.services'::regclass and a.attnum > 0 and not a.attisdropped
    and a.attname not in ('availability_enabled','availability_status','lead_time_type','lead_time_min_days',
                          'lead_time_max_days','lead_time_date','availability_message','availability_updated_at');
  execute 'create or replace view public.services_public with (security_barrier=true) as select ' || fields || ',
    s.service_latitude::double precision as discovery_latitude,
    s.service_longitude::double precision as discovery_longitude, true as discovery_location_approximate,
    case when s.availability_enabled then s.availability_status else ''accepting_bookings'' end as availability_status,
    case when s.availability_enabled then s.lead_time_type else ''not_specified'' end as lead_time_type,
    case when s.availability_enabled then s.lead_time_min_days end as lead_time_min_days,
    case when s.availability_enabled then s.lead_time_max_days end as lead_time_max_days,
    case when s.availability_enabled then s.lead_time_date end as lead_time_date,
    case when s.availability_enabled then s.availability_message end as availability_message,
    case when s.availability_enabled then s.availability_updated_at end as availability_updated_at,
    s.availability_enabled
    from public.services s where (s.is_active and s.closed_at is null) or s.provider_id=auth.uid()
    or public.can_read_listing_context(s.id)';
end $$;

notify pgrst, 'reload schema';
commit;
