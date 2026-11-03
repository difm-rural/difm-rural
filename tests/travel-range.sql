-- Disposable database only.
begin;
create table public.services(id integer primary key,title text,travel_range_km numeric);
insert into public.services values(1,'Historical',999999);
\ir ../supabase/migrations/20261103092000_validate_listing_travel_range.sql
do $$
declare value numeric;
begin
 foreach value in array array[-10,999999,12.5,'NaN'::numeric,'Infinity'::numeric] loop
  begin
   insert into public.services values(2,'Invalid',value);
   raise exception 'Invalid travel range accepted: %',value;
  exception when sqlstate '22003' then null; end;
 end loop;
 insert into public.services values(2,'Blank',null),(3,'Zero',0),(4,'Local',50),(5,'Maximum',2000);
 update public.services set title='Unrelated edit' where id=1;
 begin
  update public.services set travel_range_km=-10 where id=1;
  raise exception 'Invalid changed travel range accepted';
 exception when sqlstate '22003' then null; end;
 raise notice 'Travel range database checks passed';
end;
$$;
rollback;
