import { ActionForm } from '@/components/action-form'
import { formatDate as nzDate } from '@shared/formatting'
import { manageArrangement } from '@/app/activity/actions'
import type { WorkAction } from '@/lib/activity-policy'

// The management actions for a job or booking. Shared by the job workspace
// (/jobs/[id]#manage) and the booking manage page. Bookings keep the
// payment-nudge wording and the single required confirm tick. Jobs have flexible
// payment: "The work is finished" is the only required tick; payment is either
// already marked as taken care of, or an optional, never pre-ticked box.
const ACTIONS: Record<Exclude<WorkAction,'review'>,{label:string;detail:string}>={
  complete:{label:'Mark complete',detail:'Mark this work complete when it has finished. Both people can then leave a review.'},
  cancel:{label:'Cancel job',detail:'This closes the job. If an offer has been accepted, the provider will be notified.'},
  withdraw:{label:'Withdraw request',detail:'This request has not been accepted. You can withdraw it now; the provider will be notified.'},
  request_cancel:{label:'Request cancellation',detail:'The provider needs to confirm cancellation. The arrangement remains active until they do.'},
  confirm_cancel:{label:'Confirm cancellation',detail:'The requester has asked to cancel. Confirming ends this arrangement.'},
  close_grazing:{label:'Complete & close listing',detail:'Complete the finished arrangement and hide the grazing listing from discovery. Other bookings stay unchanged. You can relist later.'},
  relist_grazing:{label:'Complete & relist',detail:'Complete this arrangement and advertise the grazing listing for new enquiries and requests. Other bookings stay unchanged.'},
  relist:{label:'Relist grazing',detail:'Make this grazing listing available again. The completed arrangement and its reviews remain in History.'},
}

export function ManageActions({kind,id,actions,otherFirst,bidId,paymentSortedAt,paymentSortedByName}:{kind:'job'|'booking';id:string;actions:WorkAction[];otherFirst:string;bidId?:string|null;paymentSortedAt?:string|null;paymentSortedByName?:string}){
  const list=actions.filter((a):a is Exclude<WorkAction,'review'>=>a!=='review')
  if(!list.length)return null
  return <section className="card" id="manage"><h2>{kind==='job'?'Manage this job':'Manage this booking'}</h2><p className="muted">Choose an action to see what will happen before confirming.</p>
    {list.map(intent=><details className="activity-action" key={intent}><summary>{ACTIONS[intent].label}</summary>
      <ActionForm action={manageArrangement} label={ACTIONS[intent].label}>
        <input type="hidden" name="id" value={id}/><input type="hidden" name="kind" value={kind}/><input type="hidden" name="intent" value={intent}/>
        <p>{intent==='complete'&&kind==='job'
          ? `Marking complete closes this job and invites ${otherFirst} to leave a review. Payment can be sorted before or after — cash, bank transfer or invoice, whatever you agreed.`
          : intent==='complete'
          ? `Before you mark this complete, check the work is finished and you've sorted payment with ${otherFirst} — cash, bank transfer or invoice, whatever you agreed. Marking complete closes this and invites them to leave a review.`
          : (intent==='close_grazing'||intent==='relist_grazing')
          ? `Before completing, make sure grazing payment has been sorted or agreed. ${ACTIONS[intent].detail}`
          : ACTIONS[intent].detail}</p>
        {intent==='complete'&&kind==='job'&&(paymentSortedAt
          ? <p className="account-current">Payment all taken care of ✓ ({paymentSortedByName || otherFirst}, {nzDate(paymentSortedAt)})</p>
          : bidId&&<><input type="hidden" name="bid_id" value={bidId}/><label className="activity-confirm"><input type="checkbox" name="payment_sorted"/> Payment&apos;s all taken care of <span className="muted">(optional — leave unticked if you&apos;re invoicing later)</span></label></>)}
        {['cancel','withdraw','request_cancel'].includes(intent) && <><label className="lform-field">Reason *<select name="reason" required defaultValue=""><option value="" disabled>Choose a reason</option>{['No longer needed','Found someone else','Budget has changed','Posted by mistake','Provider not responding','Other'].map(r=><option key={r}>{r}</option>)}</select></label><label className="lform-field">Additional details (optional)<textarea name="note" rows={3}/></label></>}
        <label className="activity-confirm"><input type="checkbox" required/> {intent==='complete'&&kind==='job'?'The work is finished':(intent==='complete'||intent==='close_grazing'||intent==='relist_grazing')?'The work is finished and payment has been sorted or agreed.':`I confirm I want to ${ACTIONS[intent].label.toLowerCase()}.`}</label>
      </ActionForm>
    </details>)}
  </section>
}
