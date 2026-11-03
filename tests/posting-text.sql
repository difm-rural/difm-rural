begin;
create table public.jobs(id integer primary key,title text,description text,status text);
create table public.services(like public.jobs including all);
insert into public.jobs values(1,repeat('x',400),repeat('x',3000),'open');
insert into public.services select * from public.jobs;
\ir ../supabase/migrations/20261103093000_validate_posting_text.sql
do $$
declare target text;
begin
 foreach target in array array['jobs','services'] loop
  execute format('insert into public.%I values(2,$1,$2,''open'')',target) using repeat('x',160),repeat('x',2000);
  begin
   execute format('insert into public.%I values(3,$1,''Description'',''open'')',target) using repeat('x',161);
   raise exception 'Overlong title accepted';
  exception when sqlstate '22001' then null;end;
  begin
   execute format('update public.%I set description=$1 where id=2',target) using repeat('x',2001);
   raise exception 'Overlong description accepted';
  exception when sqlstate '22001' then null;end;
  execute format('update public.%I set status=''closed'' where id=1',target);
  execute format('update public.%I set title=''Shortened'' where id=1',target);
 end loop;
end;
$$;
rollback;
