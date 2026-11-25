import {bookingNextMove} from '@shared/nextMove'
import {savedBookingSummary} from '@shared/bookingLifecycleUx'
import {durationPolicy,DURATION_AGREEMENT} from '@shared/bookingDuration'
import {bookingLocationHelp,bookingPublicArea} from '@shared/bookingLocation'
import {formatDateTime as nzDateTime,formatDate as nzDate,formatDateLabel,formatMoney as nzMoney} from '@shared/formatting'
import type {ReactNode} from 'react'
import Link from '@/components/navigation-link'
import {ActionForm} from '@/components/action-form'
import {bookingResponseActions,readPricingSnapshot,paymentCopy,type BookingRecord} from '@/lib/booking-detail'
import {statusLabel} from '@/lib/work'
import {addOnDisplay} from '@shared/listingPricing'
import {QuoteForm} from './quote-form'
import {respondBooking} from '../work-actions'
export type BookingPrivateLocation={location_name:string|null;latitude:number|null;longitude:number|null}
export function BookingDetails({booking:b,userId,participant,privateLocation,includeResponses=true}:{booking:BookingRecord;userId:string;participant?:ReactNode;privateLocation?:BookingPrivateLocation|null;includeResponses?:boolean}){
 const s=b.service,snapshot=readPricingSnapshot(b.pricing_snapshot),rate=snapshot,role=b.provider_id===userId?'provider':'requester',quote=(snapshot?.pricing_type||s?.pricing_type)==='quote_required'
 const summary=savedBookingSummary(b),showDuration=durationPolicy({...s,...snapshot}).enabled||b.expected_duration!=null
 const extras=snapshot?.pricing_add_ons||[],terms=snapshot?.pricing_terms,money=nzMoney
 const timing=b.scheduled_date==='asap'?'As soon as possible':b.scheduled_date==='flexible'?'Flexible':b.scheduled_date?formatDateLabel(b.scheduled_date):'To be arranged'
 const next=bookingNextMove(b,role)
 const hasPrivate=!!(privateLocation?.location_name||privateLocation?.latitude!=null||b.location_name||b.latitude!=null)
 return <>
 <section className="card work-detail"><h2>Booking summary</h2>{participant}
 <p>Status: {s?.kind==='grazing'&&['confirmed','in_progress'].includes(b.status)?'Grazing booking confirmed':next?.label||statusLabel(b.status)}</p>
 {s?.kind==='grazing'&&['confirmed','in_progress'].includes(b.status)&&<p>Use Chat to agree the grazing dates, duration, access and payment arrangements.</p>}
 <p>Quantity: {summary.quantityLabel}</p>{snapshot?.option_label&&<p>Selected option: {snapshot.option_label}</p>}
 <p>Rate: {summary.unitRate}</p>
 <p>{quote?'Initial price: quote required':'Base estimate at request: '+money(snapshot?.base_amount??b.total_amount)}</p>
 {snapshot?.min_charge?<p>Minimum charge: {money(snapshot.min_charge)}</p>:null}
 {showDuration&&<><p>Expected duration: {summary.duration}</p>{summary.period&&<p>{summary.periodLabel}: {summary.periodAmount===null?'Not recorded':money(summary.periodAmount)}</p>}<p><strong>Estimated total: {summary.totalLabel}</strong></p><p className="muted">Expected duration and estimates are indicative until agreed. {DURATION_AGREEMENT}</p></>}
 {!snapshot&&<p className="muted">This older booking has no saved unit-rate breakdown. Its stored request amount and original notes are retained.</p>}
 {!!extras.length&&<section><h3>Extra charges — outside the base estimate</h3>{extras.map((a,i)=><p key={i}>{addOnDisplay(a)}</p>)}</section>}
 {terms&&<section><h3>Requested pricing terms</h3><p className="work-description">{terms}</p></section>}
 <p>{paymentCopy({kind:s?.kind,unit_label:rate?.unit_label,payment_timing:snapshot?.payment_timing??b.payment_timing,materials:snapshot?.materials})}</p>
 <p className="muted">Requested {nzDate(new Date(b.created_at))} · Reference {b.id}</p>
 {s&&(role==='provider'||(s.is_active&&!s.closed_at))?<Link href={'/browse/'+b.service_id} className="card-link">View current listing →</Link>:<p className="muted">This listing is no longer available in discovery. Your booking record remains here.</p>}
 </section>
 <section className="card work-detail"><h2>{s?.kind==='grazing'?'Grazing arrangements':s?.kind==='hire'?'Collection / delivery':'Booking arrangements'}</h2>
 <p><strong>{s?.kind==='grazing'?bookingPublicArea(s?.location_name):b.location_name||'To be arranged'}</strong></p>
 {['grazing','hire'].includes(s?.kind||'')&&<p>{bookingLocationHelp(s?.kind,role,b.status,s?.location_name,hasPrivate)}</p>}
 {s?.kind==='grazing'&&b.location_name&&<p className="muted">Private booking location: {b.location_name}</p>}
 {privateLocation&&<div><p className="muted">Private listing location · authorised booking participants only</p><p>{privateLocation.location_name}</p>{privateLocation.latitude!=null&&privateLocation.longitude!=null&&<a href={'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(privateLocation.latitude+','+privateLocation.longitude)} target="_blank" rel="noopener noreferrer">{s?.kind==='grazing'?'View grazing location':'View listing location'}</a>}</div>}
 {b.location_note&&<p className="work-description">Arrival directions: {b.location_note}</p>}{b.latitude!=null&&b.longitude!=null&&<a className="card-link" href={'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(b.latitude+','+b.longitude)} target="_blank" rel="noopener noreferrer">View booking location</a>}
 <p>Preferred timing: {timing}</p>{b.notes&&<section><h3>Requester notes</h3><p className="work-description">{b.notes}</p></section>}
 </section>
 {b.quote_amount!=null&&<section className="card work-detail"><h2>{b.quote_accepted_at?'Accepted quote':b.status==='quote_sent'?'Quote to review':'Quote'}</h2><strong>{money(b.quote_amount)}</strong><p className="work-description">{b.quote_notes||'No quote notes supplied.'}</p>{b.quote_sent_at&&<p>Sent {nzDateTime(new Date(b.quote_sent_at))}</p>}{b.quote_accepted_at&&<p>Accepted {nzDateTime(new Date(b.quote_accepted_at))}</p>}</section>}
 {includeResponses&&<BookingResponses booking={b} userId={userId}/>}
 </>
}
export function BookingResponses({booking:b,userId,embedded=false}:{booking:BookingRecord;userId:string;embedded?:boolean}){
 const role=b.provider_id===userId?'provider':'requester',s=b.service,responses=bookingResponseActions(b,userId,s?.pricing_type||''),money=nzMoney
 return <>
 {!!responses.length&&<section className={embedded?undefined:'card'}><h3>{role==='provider'?'Respond to this request':'Review this quote'}</h3>{responses.map(intent=><details className="activity-action" key={intent} open={intent!=='decline'}><summary>{intent==='quote'?(b.status==='quote_sent'?'Update quote':'Send quote'):intent==='confirm'?'Accept booking request':intent==='decline'?'Decline request':'Accept quote'}</summary>
 {intent==='quote'?<QuoteForm bookingId={b.id} amount={b.quote_amount} notes={b.quote_notes || null} sentAt={b.quote_sent_at} updating={b.status==='quote_sent'}/>:<ActionForm action={respondBooking} label={intent==='confirm'?'Accept booking request':intent==='decline'?'Decline request':'Accept quote'}>
 <input type="hidden" name="booking_id" value={b.id}/><input type="hidden" name="intent" value={intent}/>

 {intent==='accept'&&<><input type="hidden" name="quote_amount" value={b.quote_amount ?? ''}/><input type="hidden" name="quote_sent_at" value={b.quote_sent_at || ''}/><p>Accepting this quote for {money(b.quote_amount!)} confirms the booking. Review the quote notes and agree any extras first.</p><label className="account-setting"><input type="checkbox" required/>I agree to this quote and its notes.</label></>}
 {intent==='confirm'&&<p>This accepts the request and confirms the booking. It does not confirm final payment. Use Chat to agree the remaining arrangements.</p>}{intent==='decline'&&<><p>This closes the request and notifies the requester.</p><label className="account-setting"><input type="checkbox" required/>I want to decline this request.</label></>}
 </ActionForm>}</details>)}</section>}
 </>
}
