-- Job location privacy: public job information is locality-level for every job.
--
-- Before: jobs_public returned the exact address, GPS and location note of any
-- job whose requester had not ticked "hide exact location", to every viewer.
-- After: only the owner, the awarded (accepted) provider, admins and the
-- service role see the exact location. Everyone else gets
--   * location_name  -> the job's public area / locality (never the street address)
--   * latitude/longitude -> rounded to 2 decimal places (~1 km) so board distance
--     and "near you" still work; null when the requester chose to hide the location
--   * location_note, area_polygon -> null
-- location_exact tells clients whether the location columns are exact, so they
-- never present an approximate point as a pin or directions target.

create or replace function public.can_see_job_location(p_job_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.jobs j where j.id=p_job_id and public.can_view_job(j.id)
  and (j.requester_id=auth.uid() or public.job_awarded_to(j.id,auth.uid())
    or public.current_user_is_admin() or auth.role()='service_role'));
$$;

create or replace view public.jobs_public with (security_invoker=false,security_barrier=true) as
select j.id,j.requester_id,j.title,j.description,j.category,j.price_type,j.price,j.status,j.visibility,
 j.hide_exact_location,j.location_area,j.schedule_type,j.scheduled_date,j.date_from,j.date_to,
 j.materials_type,j.access_conditions,j.photos,j.area_hectares,j.cancellation_reason,j.cancellation_note,j.created_at,
 case when public.can_see_job_location(j.id) then j.location_name
      when not j.hide_exact_location then coalesce(nullif(btrim(j.location_area),''),public.locality_from_address(j.location_name)) end as location_name,
 case when public.can_see_job_location(j.id) then j.latitude
      when not j.hide_exact_location then round(j.latitude::numeric,2) end as latitude,
 case when public.can_see_job_location(j.id) then j.longitude
      when not j.hide_exact_location then round(j.longitude::numeric,2) end as longitude,
 case when public.can_see_job_location(j.id) then j.location_note end as location_note,
 case when public.can_see_job_location(j.id) then j.area_polygon end as area_polygon,
 public.can_see_job_location(j.id) as location_exact
from public.jobs j where public.can_view_job(j.id);

revoke insert,update,delete,truncate,trigger,references on public.jobs_public from public,anon,authenticated;
grant select on public.jobs_public to anon,authenticated;
