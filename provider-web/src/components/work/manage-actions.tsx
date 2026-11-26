import { ActionForm } from '@/components/action-form'
import { manageArrangement } from '@/app/activity/actions'
import type { WorkAction } from '@/lib/activity-policy'

// The management actions for a job or booking. Shared by the job workspace
// (/jobs/[id]#manage) and the booking manage page. For Mark complete the button
// is the confirmation — no required tick. Jobs have flexible payment: it is
// either already marked as taken care of, or an optional, never pre-ticked box.
// Cancel, withdraw, cancellation and close-arrangement actions keep their
// required confirm tick.
const ACTIONS: Record<Exclude<WorkAction,'review'>,{label:string;detail:string}>={
  complete:{label:'Mark complete',detail:'Mark this work complete when it has finished. Both people can then leave a review.'},
  cancel:{label:'Cancel job',detail:'This closes the job. If an offer has been accepted, the provider will be notified.'},
  withdraw:{label:'Withdraw request',detail:'This request has not been accepted. You can withdraw it now; the provider will be notified.'},
  request_cancel:{label:'Request cancellation',detail:'The provider needs to confirm cancellation. The arrangement remains active until they do.'},
  confirm_cancel:{label:'Confirm cancellation',detail:'The requester has asked to cancel. Confirming ends this arrangement.'},
  close_grazing:{label:'Complete & Close Listing',detail:'Finish the selected booking and close the listing to new requests. Other bookings stay unchanged.'},
  relist_grazing:{label:'Complete & Relist',detail:'Finish the selected booking and make the grazing listing available for new booking requests. Other bookings stay unchanged.'},
  relist:{label:'Relist grazing',detail:'Make this grazing listing available again. The completed arrangement and its reviews remain in History.'},
}

export function ManageActions({kind,id,actions,otherFirst,embedded=false}:{kind:'job'|'booking';id:string;actions:WorkAction[];otherFirst:string;embedded?:boolean}){
  const list=actions.filter((a):a is Exclude<WorkAction,'review'>=>a!=='review')
  if(!list.length)return null
  const Heading=embedded?'h3':'h2'
  return <section className={embedded?undefined:'card'} id="manage"><Heading>{kind==='job'?'Manage this job':'Manage this booking'}</Heading><p className="muted">Choose an action to see what will happen before confirming.</p>
    {/* Mark complete is the usual next step, so it starts open; the riskier actions stay collapsed. */}
    {list.map(intent=><details className="activity-action" key={intent} open={intent==='complete'||undefined}><summary>{ACTIONS[intent].label}</summary>
      <ActionForm action={manageArrangement} label={ACTIONS[intent].label}>
        <input type="hidden" name="id" value={id}/><input type="hidden" name="kind" value={kind}/><input type="hidden" name="intent" value={intent}/>
        <p>{intent==='complete'&&kind==='job'
          ? `Marking complete closes this job and invites ${otherFirst} to leave a review.`
          : intent==='complete'
          ? `Marking complete closes this booking and invites ${otherFirst} to leave a review. Sort payment with them as agreed — cash, bank transfer or invoice.`
          : (intent==='close_grazing'||intent==='relist_grazing')
          ? `Complete grazing arrangement? Confirm that the grazing arrangement has finished. Payment is arranged directly between requester and provider. Completing the booking does not collect or record payment. ${ACTIONS[intent].detail}`
          : ACTIONS[intent].detail}</p>
        {['cancel','withdraw','request_cancel'].includes(intent) && <><label className="lform-field">Reason *<select name="reason" required defaultValue=""><option value="" disabled>Choose a reason</option>{['No longer needed','Found someone else','Budget has changed','Posted by mistake','Provider not responding','Other'].map(r=><option key={r}>{r}</option>)}</select></label><label className="lform-field">Additional details (optional)<textarea name="note" rows={3}/></label></>}
        {intent!=='complete'&&<label className="activity-confirm"><input type="checkbox" required/> {(intent==='close_grazing'||intent==='relist_grazing')?'I confirm the selected grazing arrangement has finished.':`I confirm I want to ${ACTIONS[intent].label.toLowerCase()}.`}</label>}
        {['close_grazing','relist_grazing'].includes(intent)&&<button type="reset" className="lform-cancel">Cancel</button>}
      </ActionForm>
    </details>)}
  </section>
}
