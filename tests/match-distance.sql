begin;
create table public.jobs(id uuid primary key,title text);
create table public.user_preferences(user_id uuid,opportunity_alert_mode text);
create table public.opportunity_matches(id integer,job_id uuid,provider_id uuid,distance_km numeric,reasons text[],notified_at timestamptz,updated_at timestamptz);
create table public.notifications(id uuid default '00000000-0000-0000-0000-000000000003',user_id uuid,type text,title text,body text,metadata jsonb);
insert into public.jobs values('00000000-0000-0000-0000-000000000001','Spray paddocks for carrot weed');
insert into public.user_preferences values('00000000-0000-0000-0000-000000000002','instant');
insert into public.opportunity_matches values(1,'00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002',28.3,array['Matches your skills'],null,null);
\ir ../supabase/migrations/20261103094000_remove_snapshot_match_distance.sql
do $$
declare count integer;notice public.notifications;
begin
 count:=public.deliver_instant_opportunity_matches();
 if count<>1 then raise exception 'Expected one match notification';end if;
 select * into notice from public.notifications;
 if notice.body <> 'Spray paddocks for carrot weed · Matches your skills.' then raise exception 'Unexpected body: %',notice.body;end if;
 if notice.metadata ? 'distance_km' then raise exception 'Snapshot distance still published';end if;
 if public.deliver_instant_opportunity_matches()<>0 then raise exception 'Match delivered twice';end if;
end;
$$;
rollback;
