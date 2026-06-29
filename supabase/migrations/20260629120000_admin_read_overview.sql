-- Read-only admin overview support.
--
-- Enable an account by running:
--   update public.profiles set is_admin = true where id = '<user uuid>';
--
-- The app only exposes aggregate/metadata views. These policies let admins
-- read otherwise participant-scoped rows such as bookings and activity.

alter table public.profiles
  add column if not exists is_admin boolean not null default false;

create or replace function public.current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select p.is_admin
    from public.profiles p
    where p.id = auth.uid()
  ), false);
$$;

grant execute on function public.current_user_is_admin() to authenticated;

drop policy if exists "Admins can view all bookings" on public.bookings;
create policy "Admins can view all bookings"
on public.bookings
for select
to authenticated
using (public.current_user_is_admin());

drop policy if exists "Admins can view all job messages" on public.messages;
create policy "Admins can view all job messages"
on public.messages
for select
to authenticated
using (public.current_user_is_admin());

drop policy if exists "Admins can view all service booking messages" on public.service_booking_messages;
create policy "Admins can view all service booking messages"
on public.service_booking_messages
for select
to authenticated
using (public.current_user_is_admin());

drop policy if exists "Admins can view all activity" on public.user_activity;
create policy "Admins can view all activity"
on public.user_activity
for select
to authenticated
using (public.current_user_is_admin());

drop policy if exists "Admins can view all notifications" on public.notifications;
create policy "Admins can view all notifications"
on public.notifications
for select
to authenticated
using (public.current_user_is_admin());
