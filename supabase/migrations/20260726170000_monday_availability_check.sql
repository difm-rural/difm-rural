-- Deliver the weekly availability check on Monday morning in New Zealand
-- (08:30 NZST / 09:30 NZDT), before most of the working week is planned.

select cron.unschedule(jobid)
  from cron.job
 where jobname = 'queue-weekly-provider-availability-checks';

select cron.schedule(
  'queue-weekly-provider-availability-checks',
  '30 20 * * 0',
  $$select public.queue_weekly_availability_checks();$$
);
