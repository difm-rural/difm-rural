'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { sendFlowFeedback } from '@/app/work-actions'
import { FLOW_FEEDBACK_COMMENT_MAX } from '@shared/flowFeedback'

// Shown above a freshly posted job (?posted=1, owner only). Confirms the post
// and asks a single "how easy was that?" ease rating. Sending or skipping
// replaces the URL back to /jobs/<id> so it disappears and a refresh never
// shows it again. Mirrors the mobile JobPostedScreen.
const EASE = [1, 2, 3, 4, 5]

export function PostFeedback({ jobId }: { jobId: string }) {
  const router = useRouter()
  const [ease, setEase] = useState<number | null>(null)
  const [comment, setComment] = useState('')
  const [pending, startTransition] = useTransition()

  function dismiss() {
    router.replace('/jobs/' + jobId)
  }
  function submit() {
    if (ease == null || pending) return
    startTransition(async () => {
      await sendFlowFeedback({ subjectId: jobId, ease, comment })
      router.replace('/jobs/' + jobId)
    })
  }

  return (
    <section className="card post-feedback" aria-label="Job posted">
      <div className="post-feedback-head">
        <span className="post-feedback-check" aria-hidden="true">✓</span>
        <div>
          <h2>Job posted</h2>
          <p className="muted">Your job is live. Providers with matching capabilities and travel areas can find it now.</p>
        </div>
      </div>

      <h3 className="post-feedback-q">How easy was that?</h3>
      <div className="post-feedback-scale" role="group" aria-label="How easy was posting your job?">
        {EASE.map(n => (
          <button
            key={n}
            type="button"
            className={ease === n ? 'post-feedback-ease selected' : 'post-feedback-ease'}
            aria-pressed={ease === n}
            aria-label={n + ' out of 5'}
            onClick={() => setEase(n)}>
            {n}
          </button>
        ))}
      </div>
      <div className="post-feedback-ends"><span>Very hard</span><span>Very easy</span></div>

      <label className="lform-field">Anything we could improve? (optional)
        <textarea rows={3} maxLength={FLOW_FEEDBACK_COMMENT_MAX} value={comment} onChange={e => setComment(e.target.value)} placeholder="Optional — tell us what was confusing or slow." />
      </label>

      <div className="lform-actions">
        <button type="button" className="lform-save" disabled={ease == null || pending} onClick={submit}>{pending ? 'Sending…' : 'Send feedback'}</button>
        <button type="button" className="lform-cancel" disabled={pending} onClick={dismiss}>Skip</button>
      </div>
    </section>
  )
}
