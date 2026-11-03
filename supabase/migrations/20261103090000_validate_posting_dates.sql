-- Reject past dates on new/changed schedules. Existing historical rows are not rewritten.
create or replace function public.posting_calendar_day(value text)
returns date language plpgsql stable set search_path = public as $$
declare result date;
begin
  if value is null or btrim(value) = '' then return null; end if;
  if value ~ '^\d{4}-\d{2}-\d{2}$' then
    return value::date;
  elsif value ~ '^\d{4}-\d{2}-\d{2}T' then
    perform left(value,10)::date;
    result := (value::timestamptz at time zone 'Pacific/Auckland')::date;
    return result;
  end if;
  raise exception using errcode = '22007', message = 'Choose a valid calendar date.';
exception when invalid_datetime_format or datetime_field_overflow then
  raise exception using errcode = '22007', message = 'Choose a valid calendar date.';
end;
$$;

create or replace function public.validate_job_posting_dates()
returns trigger language plpgsql set search_path = public as $$
declare today date := (current_timestamp at time zone 'Pacific/Auckland')::date;
        first_day date; last_day date;
begin
  if tg_op = 'UPDATE' then
    if new.schedule_type is not distinct from old.schedule_type
      and new.scheduled_date is not distinct from old.scheduled_date
      and new.date_from is not distinct from old.date_from
      and new.date_to is not distinct from old.date_to then return new; end if;
  end if;
  if new.schedule_type = 'specific' then
    first_day := public.posting_calendar_day(new.scheduled_date::text);
    if first_day is null or first_day < today then
      raise exception using errcode = '22007', message = 'Choose today or a future date for the job.';
    end if;
  elsif new.schedule_type = 'range' then
    first_day := public.posting_calendar_day(new.date_from::text);
    last_day := public.posting_calendar_day(new.date_to::text);
    if first_day is null or last_day is null or first_day < today or last_day < today then
      raise exception using errcode = '22007', message = 'Choose today or future dates for the job.';
    end if;
    if last_day < first_day then
      raise exception using errcode = '22007', message = 'The end date must be on or after the start date.';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists validate_job_posting_dates on public.jobs;
create trigger validate_job_posting_dates before insert or update on public.jobs
for each row execute function public.validate_job_posting_dates();

create or replace function public.validate_listing_posting_dates()
returns trigger language plpgsql set search_path = public as $$
declare today date := (current_timestamp at time zone 'Pacific/Auckland')::date;
        value text; day date;
begin
  if tg_op = 'UPDATE' then
    if new.availability is not distinct from old.availability then return new; end if;
  end if;
  foreach value in array coalesce(new.availability, array[]::text[]) loop
    day := public.posting_calendar_day(value);
    if day is null or day < today then
      raise exception using errcode = '22007', message = 'Choose today or a future availability date, or select Available now.';
    end if;
  end loop;
  return new;
end;
$$;
drop trigger if exists validate_listing_posting_dates on public.services;
create trigger validate_listing_posting_dates before insert or update on public.services
for each row execute function public.validate_listing_posting_dates();
