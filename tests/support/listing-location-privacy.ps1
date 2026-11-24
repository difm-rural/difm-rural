# Existing isolated local fixture only; all test DDL/data roll back.
param([int]$Port=56432,[string]$Database='postgres',[string]$Psql='C:/Program Files/PostgreSQL/17/bin/psql.exe')
$ErrorActionPreference='Stop'
$repo=Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$setup=@'
begin;
create function public.current_user_is_admin() returns boolean language sql stable as $$select false$$;
create table public.services(id uuid primary key,provider_id uuid,title text,is_active boolean,closed_at timestamptz,location_name text,latitude double precision,longitude double precision,service_latitude double precision,service_longitude double precision,location_note text);
create table public.bookings(id uuid primary key,service_id uuid references public.services(id),requester_id uuid,provider_id uuid,status text);
alter table public.services enable row level security;
create policy "Anyone can view active services" on public.services for select using(is_active);
create policy owner_services on public.services for all using(provider_id=auth.uid()) with check(provider_id=auth.uid());
grant select on public.services to anon,authenticated;
grant insert,update,delete on public.services to authenticated;
grant select on public.bookings to authenticated;
insert into public.services values('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','Grazing',true,null,'123 Private Road, Testtown, New Zealand',-41.12345,174.12345,-41.12345,174.12345,'Private gate note');
insert into public.bookings values('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','pending');
'@
$locality=Get-Content (Join-Path $repo 'supabase/migrations/20261108204831_recently_filled_locality.sql') -Raw
$function=[regex]::Match($locality,'(?s)create or replace function public\.locality_from_address.*?\$\$;').Value
$migration=(Get-Content (Join-Path $repo 'supabase/migrations/20261124120000_listing_location_privacy.sql') -Raw) -replace '(?im)^begin;\s*$|^commit;\s*$',''
$checks=Get-Content (Join-Path $repo 'tests/sql/listing-location-privacy.test.sql') -Raw
$file=Join-Path ([IO.Path]::GetTempPath()) ('rc-listing-privacy-'+[guid]::NewGuid()+'.sql')
try {
 Set-Content -LiteralPath $file -Value ($setup+"`n"+$function+"`n"+$migration+"`n"+$checks+"`nrollback;")
 & $Psql -X -w -h 127.0.0.1 -p $Port -U postgres -d $Database -v ON_ERROR_STOP=1 -f $file
 if($LASTEXITCODE -ne 0){throw 'Local listing privacy regression failed'}
} finally {Remove-Item -LiteralPath $file -Force}
