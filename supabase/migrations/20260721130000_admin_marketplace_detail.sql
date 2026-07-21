-- Allow authorised administrators to inspect marketplace records behind the
-- aggregate dashboard. Profile details continue to use profiles_public, which
-- excludes phone, address and precise location information.

drop policy if exists "Admins can view all jobs" on public.jobs;
create policy "Admins can view all jobs"
  on public.jobs for select to authenticated
  using (public.current_user_is_admin());

drop policy if exists "Admins can view all services" on public.services;
create policy "Admins can view all services"
  on public.services for select to authenticated
  using (public.current_user_is_admin());
