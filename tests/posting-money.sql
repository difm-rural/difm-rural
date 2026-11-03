-- Disposable database only. No live data is changed.
begin;
create table public.jobs(id integer primary key,title text,price_type text,price numeric);
create table public.services(id integer primary key,title text,pricing_type text,rate numeric,min_charge numeric,pricing_add_ons jsonb default '[]',pricing_variants jsonb default '[]');
insert into public.services(id,title,pricing_type,rate) values(1,'Historical oversized listing','fixed',100000000);
\ir ../supabase/migrations/20261103091000_validate_posting_amounts.sql
do $$
declare value text;
begin
 foreach value in array array['999999999999','12.345','0','-1','NaN','Infinity'] loop
  begin
   insert into public.jobs values(1,'Invalid','fixed',value::numeric);
   raise exception 'Invalid budget was accepted: %',value;
  exception when sqlstate '22003' then null; end;
 end loop;
 foreach value in array array['99999999999999','100000000','12.345','-1','NaN','Infinity'] loop
  begin
   insert into public.services(id,title,pricing_type,rate) values(2,'Invalid','fixed',value::numeric);
   raise exception 'Invalid listing rate was accepted: %',value;
  exception when sqlstate '22003' then null; end;
 end loop;
 begin
  insert into public.services(id,title,pricing_type,rate,pricing_add_ons) values(2,'Invalid extra','fixed',50,'[{"label":"Delivery","amount":12.345}]');
  raise exception 'Invalid extra charge was accepted';
 exception when sqlstate '22003' then null; end;
 begin
  insert into public.services(id,title,pricing_type,rate,pricing_variants) values(2,'Invalid variant','fixed',50,'[{"label":"Large","rate":99999999999999}]');
  raise exception 'Invalid variant rate was accepted';
 exception when sqlstate '22003' then null; end;
 begin
  insert into public.services(id,title,pricing_type,rate,min_charge) values(2,'Invalid minimum','hourly',50,12.345);
  raise exception 'Invalid minimum charge was accepted';
 exception when sqlstate '22003' then null; end;
 insert into public.jobs values(2,'Valid cents','fixed',12.34);
 insert into public.jobs values(3,'Valid maximum','fixed',10000000);
 insert into public.services(id,title,pricing_type,rate) values(3,'Free listing','fixed',0);
 insert into public.services(id,title,pricing_type,rate) values(4,'Valid cents','fixed',12.34);
 update public.services set title='Unrelated edit' where id=1;
 begin
  update public.services set rate=99999999999999 where id=1;
  raise exception 'Changed invalid rate was accepted';
 exception when sqlstate '22003' then null; end;
 raise notice 'Posting amount database checks passed';
end;
$$;
rollback;
