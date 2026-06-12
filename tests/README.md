# DIFM Rural — E2E Tests

## Setup

Before running tests, create two dedicated test accounts in Supabase Auth:

| Email | Password | Role |
|---|---|---|
| `test.requester@difmrural.test` | `TestPass123!` | requester |
| `test.provider@difmrural.test` | `TestPass123!` | provider |

Set `primary_role` on each profile row after creating the accounts.

The SQL from `src/lib/features_v2.sql` must also have been run against the
project to create the `job_questions`, `notifications`, and new bid columns.

## Run

From the `difm-rural` folder in Command Prompt:

```
node tests/e2e-job-flow.js
```

## What it tests

| Step | Test |
|---|---|
| 1  | Requester login |
| 2  | Post a job with materials + access details |
| 3  | Provider login |
| 4  | Provider views job — checks materials_type, access_conditions, location_note |
| 5  | Provider asks a question (job_questions) |
| 6  | Notification check (warning only — app inserts these client-side) |
| 7  | Requester answers question; provider can read answer |
| 8  | Provider places itemised bid with line_items + available_from |
| 9  | Provider edits bid — verifies updated amount persisted |
| 10 | Requester reads all bids with line item breakdown |
| 11 | Requester accepts bid; other bids rejected; job → accepted |
| 12 | Provider sends chat message |
| 13 | Requester replies; verifies thread count |
| 14 | Provider marks job in_progress (exposes RLS gaps if any) |
| 15 | Requester marks job completed |
| 16 | Verify final job + bid state |
| 17 | Cleanup — delete test job (cascades to bids, messages, questions) |

## Notes

- Step 6 will warn (not fail) if no notification is found. Notifications are
  inserted client-side in the app, not via a DB trigger, so this step only
  passes when the app has already run that path.
- Step 14 tests whether RLS allows a provider to update job status to
  `in_progress`. If your policy restricts this to requesters only, the step
  will fail with a clear error — that is the expected signal to update the
  policy.
- The test cleans up after itself. If cleanup fails (e.g. RLS blocks delete),
  the job ID is printed so you can remove it manually.
