# Existing isolated local fixture only. All test DDL/data roll back.
param([int]$Port=56432,[string]$Psql='C:/Program Files/PostgreSQL/17/bin/psql.exe')
$ErrorActionPreference='Stop'
$repo=Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$baseline=Get-Content (Join-Path $repo 'supabase/migrations/00000000000000_baseline.sql') -Raw
$offers=Get-Content (Join-Path $repo 'supabase/migrations/20260621140000_offer_wording_notifications.sql') -Raw
$question=[regex]::Match($baseline,'(?is)CREATE FUNCTION public\.notify_question_answered\(\).*?\$\$;').Value
$offer=[regex]::Match($offers,'(?is)create or replace function public\.notify_bid_status_change\(\).*?\$\$;').Value
if(!$question -or !$offer){throw 'Existing notification trigger definitions not found'}
$setup=@'
begin;
alter table public.jobs add column title text;
create table public.notifications(id bigserial primary key,user_id uuid,type text,body text,metadata jsonb);
create table public.job_questions(id uuid primary key,job_id uuid,asker_id uuid,answer text);
create table public.bids(id uuid primary key,job_id uuid,provider_id uuid,status text,amount numeric);
insert into public.profiles values('00000000-0000-4000-8000-000000000081','Requester'),('00000000-0000-4000-8000-000000000082','Provider');
insert into public.jobs(id,requester_id,status,title) values('00000000-0000-4000-8000-000000000083','00000000-0000-4000-8000-000000000081','open','Notifications local fixture');
'@
$checks=@'
CREATE TRIGGER question_answered AFTER UPDATE ON public.job_questions FOR EACH ROW WHEN (new.answer IS NOT NULL AND new.answer IS DISTINCT FROM old.answer) EXECUTE FUNCTION public.notify_question_answered();
CREATE TRIGGER bid_status AFTER UPDATE ON public.bids FOR EACH ROW EXECUTE FUNCTION public.notify_bid_status_change();
insert into public.job_questions values('00000000-0000-4000-8000-000000000084','00000000-0000-4000-8000-000000000083','00000000-0000-4000-8000-000000000082',null);
update public.job_questions set answer='Use the north gate';
update public.job_questions set answer='Use the north gate';
insert into public.bids values('00000000-0000-4000-8000-000000000085','00000000-0000-4000-8000-000000000083','00000000-0000-4000-8000-000000000082','pending',35);
update public.bids set status='accepted';
update public.bids set status='accepted';
do $$begin
 if (select count(*) from public.notifications)<>2 then raise exception 'Missing or duplicate provider events';end if;
 if (select count(*) from public.notifications where user_id='00000000-0000-4000-8000-000000000082' and type in ('question_answered','bid_accepted') and metadata->>'job_id'='00000000-0000-4000-8000-000000000083')<>2 then raise exception 'Incorrect recipient or routing data';end if;
end$$;
select 'PASS provider question-answer and offer-acceptance events, metadata and duplicate prevention';
rollback;
'@
$file=Join-Path ([IO.Path]::GetTempPath()) ('rc-notification-events-'+[guid]::NewGuid()+'.sql')
try {
 Set-Content -LiteralPath $file -Value ($setup+"`n"+$question+"`n"+$offer+"`n"+$checks)
 & $Psql -X -w -h 127.0.0.1 -p $Port -U postgres -d postgres -v ON_ERROR_STOP=1 -f $file
 if($LASTEXITCODE -ne 0){throw 'Local notification event regression failed'}
} finally {Remove-Item -LiteralPath $file}
