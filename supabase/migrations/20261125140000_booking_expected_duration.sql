-- Optional request terms. Old clients omit both columns; existing rows stay null.
alter table public.bookings add column expected_duration numeric;
alter table public.bookings add column expected_duration_unit text;
alter table public.bookings add constraint booking_expected_duration_valid check (
 (expected_duration is null and expected_duration_unit is null) or
 (expected_duration is not null and expected_duration_unit is not null and expected_duration>0 and expected_duration<=10000
  and expected_duration=round(expected_duration,2) and expected_duration_unit in ('hour','day','week','month')));

create function public.booking_duration_period(pricing text,label text) returns text language sql immutable set search_path=public as $$
 select case when pricing='hourly' then 'hour' when pricing='day_rate' then 'day'
 when pricing='per_unit' then (regexp_match(lower(trim(coalesce(label,''))),'^(?:[^/]+/)?(hour|day|week|month)s?$'))[1] end;
$$;
create function public.validate_booking_expected_duration() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare s record; pricing text; label text; period text; quantity_is_time boolean;
begin
 if tg_op='UPDATE' then
  if new.expected_duration is distinct from old.expected_duration or new.expected_duration_unit is distinct from old.expected_duration_unit then
   raise exception 'Expected duration is immutable booking request information';
  end if;
  return new; -- Listing edits must never reinterpret existing request terms.
 end if;
 select kind,pricing_type,unit_label,pricing_variants,max_units into strict s from public.services_public where id=new.service_id;
 if s.kind='grazing' and (new.quantity is null or new.quantity::text in ('NaN','Infinity','-Infinity') or new.quantity<1 or new.quantity<>floor(new.quantity) or (s.max_units is not null and new.quantity>s.max_units)) then
  raise exception 'Grazing quantity must be a whole number within listing capacity';
 end if;
 if new.expected_duration is null and new.expected_duration_unit is null then return new;end if;
 if new.pricing_snapshot is null or new.pricing_snapshot->>'version' is distinct from '1' then raise exception 'A saved pricing snapshot is required for duration requests';end if;
 if s.kind='grazing' then
  if new.expected_duration_unit<>'week' or new.expected_duration not in (1,2,4,6,8) then raise exception 'Choose a supported grazing duration in weeks';end if;
  return new;
 end if;
 if coalesce(s.kind,'service') not in ('hire','service') then raise exception 'Duration is unavailable for this listing kind';end if;
 pricing:=coalesce(new.pricing_snapshot->>'pricing_type',s.pricing_type);
 label:=coalesce(new.pricing_snapshot->>'unit_label',s.unit_label,'');
 if not ((pricing=s.pricing_type and label=coalesce(s.unit_label,'')) or exists(
  select 1 from jsonb_array_elements(coalesce(s.pricing_variants,'[]'::jsonb)) v
  where v->>'pricing_type'=pricing and coalesce(v->>'unit_label','')=label)) then raise exception 'Duration rate does not match an advertised option';end if;
 period:=public.booking_duration_period(pricing,label);
 if period is null or new.expected_duration_unit<>period then raise exception 'Duration unit must match the advertised time unit';end if;
 quantity_is_time:=pricing in ('hourly','day_rate') or lower(trim(label))~'^(hour|day|week|month)s?$';
 if quantity_is_time and new.expected_duration is distinct from new.quantity then raise exception 'Time quantity must match expected duration';end if;
 return new;
end;
$$;
revoke all on function public.booking_duration_period(text,text) from public,anon,authenticated;
revoke all on function public.validate_booking_expected_duration() from public,anon,authenticated;
create trigger bookings_expected_duration before insert or update on public.bookings for each row execute function public.validate_booking_expected_duration();
comment on column public.bookings.expected_duration is 'Optional indicative requested duration, never an automatic completion or payment instruction.';
comment on column public.bookings.expected_duration_unit is 'Requested hour/day/week/month unit, immutable after creation.';
