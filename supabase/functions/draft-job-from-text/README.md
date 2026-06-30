# draft-job-from-text

Turns a natural spoken/typed description ("shift about fifty cows to the back
paddock tomorrow morning") into a structured job draft: title, description,
category, suggested budget range, estimated duration, helpful skills, and
schedule. Powers the **Assistant** button in the post-a-job flow.

## How it's called

From the app: `supabase.functions.invoke('draft-job-from-text', { body: { text, today } })`
(`src/lib/draftJob.js`). Returns `{ draft }`.

## Deploy

```bash
supabase functions deploy draft-job-from-text
```

Uses the same `OPENAI_API_KEY` secret as `create-service-draft-from-photo`
(already set), and optional `OPENAI_MODEL` (defaults to `gpt-4.1-mini`). No new
secret needed. To switch providers/models later, change the `fetch` call in
`index.ts`.

## Notes

- Categories are fixed server-side to the job taxonomy; the model must pick one.
- The client sends `today` (device local date) so relative dates like
  "tomorrow morning" resolve correctly.
- The model is instructed not to invent specifics or put contact details in the
  description.
