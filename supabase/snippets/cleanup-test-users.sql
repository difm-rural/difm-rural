-- Cleanup for the payment-handoff / message-permissions verification test users.
-- Run in the Supabase SQL editor (service role). Most data rows were already
-- removed by the test scripts (jobs/services deletes cascade to bids, messages
-- and bookings); this clears anything left — chiefly notifications and profiles,
-- which have no client delete policy.
--
-- All test users have emails like cc-<role>-<ts>-<rand>@mailinator.com. Known ids:
--   req   d1f6f86c-265f-44b3-a363-ec3c9da1680f, bc5e80d8-… (2nd run)
--   prov  2028b835-fda8-4522-aaf0-e6fdd2effb1a, bb22ade3-… (2nd run)
--   unrel 04778767-0993-44f2-bd7a-46e0257beeb9, 5bc9126d-… (2nd run)
--   probe 991e691f-d232-462f-b482-d75fdf3021ab
-- The email filter below catches all of them regardless of the truncated ids.

with t as (select id from auth.users where email like 'cc-%@mailinator.com')
delete from public.notifications where user_id in (select id from t);

with t as (select id from auth.users where email like 'cc-%@mailinator.com')
delete from public.messages where sender_id in (select id from t) or receiver_id in (select id from t);

with t as (select id from auth.users where email like 'cc-%@mailinator.com')
delete from public.service_booking_messages where sender_id in (select id from t) or receiver_id in (select id from t);

with t as (select id from auth.users where email like 'cc-%@mailinator.com')
delete from public.bookings where requester_id in (select id from t) or provider_id in (select id from t);

with t as (select id from auth.users where email like 'cc-%@mailinator.com')
delete from public.bids where provider_id in (select id from t);

with t as (select id from auth.users where email like 'cc-%@mailinator.com')
delete from public.services where provider_id in (select id from t);

with t as (select id from auth.users where email like 'cc-%@mailinator.com')
delete from public.jobs where requester_id in (select id from t);

with t as (select id from auth.users where email like 'cc-%@mailinator.com')
delete from public.profiles where id in (select id from t);

-- Finally, remove the auth users themselves in Dashboard → Authentication → Users
-- (filter by "cc-" and delete). Deleting them there also cascades any stragglers.
-- If you'd rather do it here as service role, uncomment:
--   delete from auth.users where email like 'cc-%@mailinator.com';
