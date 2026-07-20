-- Process due transactional email every five minutes. The authentication
-- value lives encrypted in Supabase Vault as `email_function_secret`; the
-- plaintext secret is never stored in this migration or cron.job.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'process-email-outbox',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://opagkgfxmjqmnvhrcris.supabase.co/functions/v1/process-email-outbox',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-email-secret', (
        select decrypted_secret
          from vault.decrypted_secrets
         where name = 'email_function_secret'
      )
    ),
    body := '{}'::jsonb
  );
  $$
);

