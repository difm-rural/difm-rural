\set ON_ERROR_STOP on
-- The runner wraps setup, the real migration and these assertions in a rollback.
set local role anon;
do $$begin
 if (select count(*) from public.services)<>0 then raise exception 'Anonymous raw location leak';end if;
 if (select count(*) from public.services_public)<>1 then raise exception 'Public discovery lost listing';end if;
 if exists(select 1 from public.services_public where location_name<>'Testtown' or latitude is not null or longitude is not null or service_latitude is not null or service_longitude is not null or location_note is not null) then raise exception 'Public address/pin leak';end if;
 if exists(select 1 from public.services_public where discovery_latitude<>-41.1 or discovery_longitude<>174.1) then raise exception 'Approximate distance coordinates wrong';end if;
end$$;
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
set local role authenticated;
do $$begin if (select count(*) from public.services)<>0 then raise exception 'Pending requester sees exact listing location';end if;end$$;
reset role;
update public.bookings set status='confirmed';
set local role authenticated;
do $$begin if (select count(*) from public.services where location_name='123 Private Road, Testtown, New Zealand' and latitude=-41.12345)<>1 then raise exception 'Confirmed participant lost exact location';end if;end$$;
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
set local role authenticated;
do $$begin if (select count(*) from public.services)<>0 then raise exception 'Other member sees raw location';end if;end$$;
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $$begin if (select count(*) from public.services)<>1 then raise exception 'Owner cannot manage exact location';end if;end$$;
reset role;
update public.services set is_active=false,closed_at=now();
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
set local role authenticated;
do $$begin if (select count(*) from public.services_public)<>1 or (select count(*) from public.services)<>1 then raise exception 'Booking history lost closed listing context';end if;end$$;
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
set local role authenticated;
do $$begin if (select count(*) from public.services_public)<>0 then raise exception 'Stranger sees closed listing';end if;end$$;
reset role;
select 'PASS anonymous, pending, confirmed, owner, other member, closed history, public fields and approximate distance';
