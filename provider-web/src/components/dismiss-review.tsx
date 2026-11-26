'use client'
import { useActionState } from 'react'
import { dismissReview } from '@/app/review-prompt-actions'

// Small secondary action beside a "Leave a review" row on Home.
export function DismissReview({ kind, id, role, title }: { kind: 'job' | 'booking'; id: string; role: 'requester' | 'provider'; title: string }) {
  const [state, submit, pending] = useActionState(dismissReview, { error: '' })
  return <form action={submit} className="dismiss-review">
    <input type="hidden" name="kind" value={kind} /><input type="hidden" name="id" value={id} /><input type="hidden" name="role" value={role} />
    <button type="submit" className="card-link" disabled={pending} aria-label={'Not reviewing ' + title}>{pending ? 'Dismissing…' : 'Not reviewing'}</button>
    {state.error && <p className="form-error" role="alert">{state.error}</p>}
  </form>
}
