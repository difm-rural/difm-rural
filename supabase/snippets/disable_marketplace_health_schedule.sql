-- Emergency stop. Run as the registering postgres role in the metadata database.
select cron.unschedule(jobid)
from cron.job
where jobname = 'marketplace-health' and username = current_user;
