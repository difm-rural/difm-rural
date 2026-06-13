# Supabase schema & migrations

## How the schema is managed

The database was originally built by hand in the Supabase SQL editor, with
the DDL scattered across `src/lib/*.sql`. Those files captured the *changes*
but never the base tables (`jobs`, `profiles`, `bids`, `messages`, …), so they
could not rebuild the database from scratch.

We now keep a **baseline migration** in `supabase/migrations/` that is a full
dump of the live schema. Going forward:

- New schema changes → a new timestamped file in `supabase/migrations/`
  (`supabase migration new <name>`), not ad-hoc edits in the dashboard.
- The legacy scripts are archived in `supabase/legacy-sql/` for reference only.
  They are already represented in the baseline; don't re-run them against a DB
  that has the baseline applied.

## One-time baseline setup

Run these from the project root. The dump connects directly to Postgres, so it
will prompt for the **database password** (Dashboard → Project Settings →
Database → Database password; reset it there if unknown).

```sh
# 1. Dump the full live schema into the baseline migration
supabase db dump --linked -f supabase/migrations/00000000000000_baseline.sql

# 2. Tell Supabase the live DB already has this baseline, so a future
#    `supabase db push` won't try to replay it
supabase migration repair --status applied 00000000000000

# 3. Confirm local and remote migration history agree
supabase migration list
```

If the CLI says "Access token not provided", set it first (Windows, token from
Credential Manager target `Supabase CLI:supabase`, or from
https://supabase.com/dashboard/account/tokens):

```powershell
$env:SUPABASE_ACCESS_TOKEN = "sbp_..."
```

## Day-to-day

```sh
supabase migration new add_something      # create a new migration file
# ...edit the generated SQL...
supabase db push                          # apply pending migrations to the linked DB
```
