'use client'

import { useActionState, useEffect, useId, useRef, type FormEvent } from 'react'
import { paymentAcknowledgement as copy } from '@shared/paymentAcknowledgement'
import { markJobPaymentSorted } from '../../work-actions'

export function PaymentSorted({ bidId, jobId, sortedAt, actor, methodLabel, canUpdate }: {
  bidId: string
  jobId: string
  sortedAt: string | null
  actor: 'requester' | 'provider' | null
  methodLabel?: string
  canUpdate: boolean
}) {
  const [state, submit, pending] = useActionState(markJobPaymentSorted, { error: '' })
  const dialog = useRef<HTMLDialogElement>(null)
  const feedback = useRef<HTMLParagraphElement>(null)
  const submitting = useRef(false)
  const titleId = useId()
  const detailId = useId()

  useEffect(() => {
    submitting.current = false
    if (state.success || state.error) feedback.current?.focus()
  }, [state])

  function startSubmission(event: FormEvent<HTMLFormElement>, undo = false) {
    if (submitting.current || pending || !canUpdate) {
      event.preventDefault()
      return
    }
    submitting.current = true
    if (undo) dialog.current?.close()
  }

  return (
    <section className="card payment-card">
      <h2>Payment</h2>
      {sortedAt && <p><strong>{copy.sorted}</strong></p>}
      <p>{sortedAt ? copy.sortedDetail : copy.reminder}</p>
      <p className="muted">Rural Connections doesn&apos;t handle or verify payments.</p>
      {sortedAt && actor && <p>Marked by the {actor}.</p>}
      {methodLabel && <p>Agreed method: {methodLabel}</p>}
      {canUpdate && (sortedAt ? (
        <button type="button" className="lform-cancel payment-ack-button" disabled={pending} onClick={() => dialog.current?.showModal()}>
          {pending ? 'Saving…' : copy.undo}
        </button>
      ) : (
        <form action={submit} onSubmit={startSubmission}>
          <input type="hidden" name="bid_id" value={bidId} />
          <input type="hidden" name="job_id" value={jobId} />
          <button type="submit" className="lform-save payment-ack-button" disabled={pending}>{pending ? 'Saving…' : copy.mark}</button>
        </form>
      ))}
      <dialog ref={dialog} className="publishing-location-dialog" aria-labelledby={titleId} aria-describedby={detailId}>
        <h2 id={titleId}>{copy.undoTitle}</h2>
        <p id={detailId}>{copy.undoDetail}</p>
        <form action={submit} onSubmit={event => startSubmission(event, true)} className="lform-actions">
          <input type="hidden" name="bid_id" value={bidId} />
          <input type="hidden" name="job_id" value={jobId} />
          <input type="hidden" name="undo" value="true" />
          <button type="button" autoFocus className="lform-cancel payment-ack-button" onClick={() => dialog.current?.close()}>Cancel</button>
          <button type="submit" className="lform-save payment-ack-button" disabled={pending}>{copy.undoConfirm}</button>
        </form>
      </dialog>
      {state.success && <p className="home-clear" role="status" tabIndex={-1} ref={feedback}>{state.success}</p>}
      {state.error && <p className="form-error" role="alert" tabIndex={-1} ref={feedback}>{state.error}</p>}
    </section>
  )
}
