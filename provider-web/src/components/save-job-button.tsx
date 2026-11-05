'use client'
import { useActionState } from 'react'
import { Bookmark, BookmarkCheck } from 'lucide-react'
import { saveWatchedJob } from '@/app/discovery-actions'

// A compact bookmark toggle over a job card. Wraps the saveWatchedJob server
// action (same hidden inputs as the old full-width button). A sibling of the
// card link, so tapping it never follows the card.
export function SaveJobButton({ jobId, saved }: { jobId: string; saved: boolean }) {
  const [, submit, pending] = useActionState(saveWatchedJob, { error: '' })
  return <form action={submit} className="job-bookmark-form">
    <input type="hidden" name="job_id" value={jobId}/>
    <input type="hidden" name="intent" value={saved ? 'remove' : 'save'}/>
    <button type="submit" className={'job-bookmark'+(saved?' saved':'')} disabled={pending} aria-pressed={saved} aria-label={saved?'Remove saved job':'Save job'}>
      {saved ? <BookmarkCheck size={18}/> : <Bookmark size={18}/>}
    </button>
  </form>
}
