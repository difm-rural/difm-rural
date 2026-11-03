-- Run only in a disposable database: psql -v ON_ERROR_STOP=1 -f tests/posting-dates.sql
begin;
create table public.jobs(id integer primary key,title text,schedule_type text,scheduled_date text,date_from date,date_to date);
create table public.services(id integer primary key,title text,availability text[]);
insert into public.jobs values(1,'Historical','specific','2020-01-01',null,null);
insert into public.services values(1,'Historical',array['2020-01-01']);
\ir ../supabase/migrations/20261103090000_validate_posting_dates.sql

do $$
declare today date := (current_timestamp at time zone 'Pacific/Auckland')::date;
begin
  begin
    insert into public.jobs values(2,'Past','specific','2020-01-01',null,null);
    raise exception 'Past job was accepted';
  exception when sqlstate '22007' then null; end;
  begin
    insert into public.jobs values(3,'Past range','range',null,'2020-01-01',today);
    raise exception 'Past range was accepted';
  exception when sqlstate '22007' then null; end;
  begin
    insert into public.jobs values(4,'Reversed range','range',null,today+1,today);
    raise exception 'Reversed range was accepted';
  exception when sqlstate '22007' then null; end;
  begin
    insert into public.services values(2,'Past',array['2020-01-01']);
    raise exception 'Past listing was accepted';
  exception when sqlstate '22007' then null; end;
  begin
    insert into public.services values(3,'Invalid',array['2026-02-30']);
    raise exception 'Invalid calendar date was accepted';
  exception when sqlstate '22007' then null; end;
  insert into public.jobs values(5,'Today','specific',today::text,null,null);
  insert into public.jobs values(6,'Future range','range',null,today,today+1);
  insert into public.jobs values(7,'Flexible','flexible',null,null,null);
  insert into public.services values(4,'Today',array[today::text]);
  insert into public.services values(5,'Now',null);
  update public.jobs set title='Unrelated edit' where id=1;
  update public.services set title='Unrelated edit' where id=1;
  begin
    update public.jobs set scheduled_date='2020-01-02' where id=1;
    raise exception 'Changed past job date was accepted';
  exception when sqlstate '22007' then null; end;
  begin
    update public.services set availability=array['2020-01-02'] where id=1;
    raise exception 'Changed past listing date was accepted';
  exception when sqlstate '22007' then null; end;
  if public.posting_calendar_day('2026-11-02T11:30:00Z') <> date '2026-11-03' then raise exception 'NZ timezone conversion failed'; end if;
  raise notice 'Posting date database checks passed';
end;
$$;
rollback;
