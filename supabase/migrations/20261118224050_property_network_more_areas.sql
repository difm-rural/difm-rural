-- My Property Network: three new support areas (Spraying & Pests, Hay & Feed,
-- House & Property Sitting), and Weed spraying moves from Pasture & Land to
-- Spraying & Pests. Saved rows are keyed by (area, service_key); the moved
-- service keeps its key (suggested-1), so only its area changes here.
begin;

alter table public.property_network_areas drop constraint property_network_areas_area_check;
alter table public.property_network_areas add constraint property_network_areas_area_check
 check (area in ('water','land','fencing','livestock','access','upkeep','trees','machinery','spraying','feed','sitting'));
alter table public.property_network_services drop constraint property_network_services_area_check;
alter table public.property_network_services add constraint property_network_services_area_check
 check (area in ('water','land','fencing','livestock','access','upkeep','trees','machinery','spraying','feed','sitting'));

-- Copy each saved Weed spraying row and its provider links to the new area,
-- then remove the old row (its links go with it via on delete cascade).
insert into public.property_network_services(owner_id,area,service_key,name,status)
 select owner_id,'spraying',service_key,name,status from public.property_network_services
 where area='land' and service_key='suggested-1';
insert into public.property_network_providers(owner_id,area,service_key,provider_id)
 select owner_id,'spraying',service_key,provider_id from public.property_network_providers
 where area='land' and service_key='suggested-1';
delete from public.property_network_services where area='land' and service_key='suggested-1';

-- New areas start inactive, except Spraying & Pests for owners whose moved
-- Weed spraying row was set up, so that work stays on their diagram.
insert into public.property_network_areas(owner_id,area,active)
 select distinct owner_id,'spraying',true from public.property_network_services
 where area='spraying' and service_key='suggested-1' and status is not null
 on conflict (owner_id,area) do nothing;

commit;
