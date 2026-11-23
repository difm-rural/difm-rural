\set ON_ERROR_STOP on
-- Both legacy services reads and updated services_public reads remain usable.
set local role anon;
do $$begin
 if (select count(*) from public.services)<>1 then raise exception 'Legacy discovery lost active listing';end if;
 if (select count(*) from public.services_public)<>1 then raise exception 'Updated discovery lost active listing';end if;
 if exists(select 1 from public.services where location_name<>'Testtown' or latitude is not null or longitude is not null or service_latitude<>-41.1 or service_longitude<>174.1 or location_note is not null) then raise exception 'Legacy response leaks private location or loses approximate distance';end if;
 if exists(select 1 from public.services_public where latitude is not null or longitude is not null or service_latitude is not null or service_longitude is not null or location_name<>'Testtown') then raise exception 'Updated public location leak';end if;
 begin perform 1 from public.service_private_locations;raise exception 'Anonymous private location access';exception when insufficient_privilege then null;end;
end$$;
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
set local role authenticated;
do $$begin
 if (select count(*) from public.services)<>1 then raise exception 'Pending requester lost listing context';end if;
 if exists(select 1 from public.service_private_locations) then raise exception 'Pending requester sees exact location';end if;
 if (select count(*) from public.bookings b join public.services s on s.id=b.service_id)<>1 then raise exception 'Legacy booking join broken';end if;
end$$;
reset role;
update public.bookings set status='confirmed';
set local role authenticated;
do $$begin
 if (select count(*) from public.service_private_locations where location_name='123 Private Road, Testtown, New Zealand' and latitude=-41.12345 and location_note='Private gate note')<>1 then raise exception 'Accepted participant lost exact location';end if;
 begin insert into public.service_private_locations(service_id,location_name) values('10000000-0000-4000-8000-000000000001','tamper');raise exception 'Requester can write private location';exception when insufficient_privilege then null;end;
end$$;
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
set local role authenticated;
do $$begin
 if exists(select 1 from public.service_private_locations) then raise exception 'Other member sees private location';end if;
 update public.services set location_name='Attacker address' where id='10000000-0000-4000-8000-000000000001';
 if found then raise exception 'Other owner updated listing';end if;
 -- A BEFORE INSERT side effect must not corrupt another owner's private row.
 insert into public.services(id,provider_id,title,is_active,location_name,latitude,longitude)
 values('10000000-0000-4000-8000-000000000001',auth.uid(),'Attacker retry',true,'Attacker Road, Wrongtown',-45.99999,170.99999) on conflict(id) do nothing;
 begin
  insert into public.services(id,provider_id,title,is_active,location_name) values('10000000-0000-4000-8000-000000000099','00000000-0000-4000-8000-000000000001','Spoof owner',true,'Forbidden Road, Otherplace');
  raise exception 'Spoofed ownership insert';
 exception when insufficient_privilege then null;end;
end$$;
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $$begin
 if (select count(*) from public.service_private_locations where location_name='123 Private Road, Testtown, New Zealand' and latitude=-41.12345)<>1 then raise exception 'Owner lost original values or conflicting insert overwrote them';end if;
 -- Old editors send the coarse response back, often with its fallback pin.
 update public.services set title='Legacy edited title',location_name='Testtown',latitude=-41.1,longitude=174.1,service_latitude=-41.1,service_longitude=174.1;
 if (select latitude from public.service_private_locations)<>-41.12345 then raise exception 'Legacy edit erased exact pin';end if;
 if exists(select 1 from public.services where latitude is not null or location_name<>'Testtown') then raise exception 'Legacy edit exposed private location';end if;
 -- Explicit address changes still capture private data and scrub the response.
 update public.services set location_name='456 Other Road, Newtown, New Zealand',latitude=-42.23456,longitude=175.23456,service_latitude=-42.23456,service_longitude=175.23456;
 if (select latitude from public.service_private_locations)<>-42.23456 or (select location_name from public.services)<>'Newtown' then raise exception 'Owner location change failed';end if;
 -- Updated editors can re-save hydrated address while omitting unchanged pins.
 update public.services set location_name='456 Other Road, Newtown, New Zealand';
 if (select latitude from public.service_private_locations)<>-42.23456 then raise exception 'Updated editor erased unchanged pin';end if;
 update public.services set location_name='123 Private Road, Testtown, New Zealand',latitude=-41.12345,longitude=174.12345,service_latitude=-41.12345,service_longitude=174.12345;
 insert into public.services(id,provider_id,title,is_active,location_name,latitude,longitude)
 values('10000000-0000-4000-8000-000000000002',auth.uid(),'New listing',true,'789 Secret Road, Freshville, New Zealand',-40.12345,173.12345);
 if (select count(*) from public.service_private_locations)<>2 then raise exception 'New listing location not captured';end if;
 if exists(select 1 from public.services where latitude is not null or longitude is not null) then raise exception 'New listing leaked exact coordinates';end if;
 delete from public.services where id='10000000-0000-4000-8000-000000000002';
 if (select count(*) from public.service_private_locations)<>1 then raise exception 'Private location cascade failed';end if;
end$$;
reset role;
update public.services set is_active=false,closed_at=now();
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
set local role authenticated;
do $$begin if (select count(*) from public.services_public)<>1 or (select count(*) from public.services)<>1 or (select count(*) from public.service_private_locations)<>1 then raise exception 'Closed booking context/location lost';end if;end$$;
reset role;
update public.bookings set status='withdrawn';
set local role authenticated;
do $$begin
 if (select count(*) from public.services)<>1 or (select count(*) from public.services_public)<>1 then raise exception 'Historical booking context lost';end if;
 if exists(select 1 from public.service_private_locations) then raise exception 'Withdrawn participant has private access';end if;
end$$;
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
set local role authenticated;
do $$begin if exists(select 1 from public.services) or exists(select 1 from public.services_public) or exists(select 1 from public.service_private_locations) then raise exception 'Stranger sees closed listing/private data';end if;end$$;
reset role;
select 'PASS legacy and updated reads, booking joins, exact-location RLS, owner edits/retries, conflict protection, insert/delete and history';
