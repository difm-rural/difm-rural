import Link from 'next/link'
import {ActionForm} from '@/components/action-form'
import {bookingResponseActions,bookingNextStep,readPricingSnapshot,paymentCopy,unitName,type BookingRecord} from '@/lib/booking-detail'
import {addOnDisplay,formatRate} from '@shared/listingPricing'
import {QuoteForm} from './quote-form'
import {respondBooking} from '../work-actions'
export function BookingDetails({booking:b,userId}:{booking:BookingRecord;userId:string}){
 const s=b.service,snapshot=readPricingSnapshot(b.pricing_snapshot),rate=snapshot || s,role=b.provider_id===userId?'provider':'requester',quote=(rate?.pricing_type || '')==='quote_required',responses=bookingResponseActions(b,userId,s?.pricing_type || '')
 const extras=snapshot?.pricing_add_ons || s?.pricing_add_ons || [],terms=snapshot?snapshot.pricing_terms:s?.pricing_terms
 const money=(value:number)=>'$'+Number(value).toFixed(2)+''
 const timing=b.scheduled_date==='asap'?'As soon as possible':b.scheduled_date==='flexible'?'Flexible':b.scheduled_date || 'To be arranged'
 return <>
 <p className="account-current">{bookingNextStep(b.status,role,quote,s?.kind)}</p>
 <section className="card work-detail"><h2>Request details</h2><p>Preferred timing: {timing}</p><p>Quantity: {b.quantity}{rate?' '+unitName(rate):''}</p>{snapshot?.option_label&&<p>Selected option: {snapshot.option_label}</p>}
 {rate&&<p>Rate: {formatRate(rate.pricing_type,rate.rate,rate.unit_label)}</p>}
 <strong>{quote?'Initial price: quote required':'Base estimate at request: '+money(snapshot?.base_amount ?? b.total_amount)}</strong>
 {snapshot?.min_charge? <p>Minimum charge included: {money(snapshot.min_charge)}</p>:null}
 {s?.kind==='grazing'&&/\/(week|month)$/.test(rate?.unit_label || '')&&<p>The base estimate covers one {rate?.unit_label?.endsWith('/week')?'week':'month'}. Agree the full grazing duration and payment schedule directly.</p>}
 {!snapshot&&<p className="muted">This older request has no saved pricing breakdown. The stored request amount is shown; rate, extras and terms below reflect the current listing.</p>}
 {!!extras.length&&<section><h3>Extra charges — outside the base estimate</h3>{extras.map((a,i)=><p key={i}>{addOnDisplay(a)}</p>)}</section>}
 {terms&&<section><h3>Pricing terms</h3><p className="work-description">{terms}</p></section>}<p className="muted">Extra charges may apply — agree the final price with the provider.</p>
 {b.notes&&<section><h3>Requester notes</h3><p className="work-description">{b.notes}</p></section>}
 <p>{paymentCopy({kind:s?.kind,unit_label:rate?.unit_label,payment_timing:b.payment_timing,materials:snapshot?snapshot.materials:s?.materials})}</p>
 <p className="muted">Requested {new Date(b.created_at).toLocaleDateString('en-NZ',{day:'numeric',month:'long',year:'numeric',timeZone:'Pacific/Auckland'})} · Reference {b.id}</p>
 {s&&(role==='provider'||(s.is_active&&!s.closed_at))?<Link href={'/browse/'+b.service_id} className="card-link">View current listing →</Link>:<p className="muted">This listing is no longer available in discovery. Your booking record remains here.</p>}
 </section>
 <section className="card work-detail"><h2>Booking location</h2><p>{b.location_name || 'To be arranged'}</p>{b.location_note&&<p className="work-description">Arrival directions: {b.location_note}</p>}{b.latitude!=null&&b.longitude!=null&&<a className="card-link" href={'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(b.latitude+','+b.longitude)} target="_blank" rel="noopener noreferrer">Open booking location in Maps</a>}</section>
 {b.quote_amount!=null&&<section className="card work-detail"><h2>{b.quote_accepted_at?'Accepted quote':b.status==='quote_sent'?'Quote to review':'Quote'}</h2><strong>{money(b.quote_amount)}</strong><p className="work-description">{b.quote_notes || 'No quote notes supplied. Agree what is included before accepting.'}</p>{b.quote_sent_at&&<p className="muted">Sent {new Date(b.quote_sent_at).toLocaleString('en-NZ',{timeZone:'Pacific/Auckland'})} (New Zealand time)</p>}{b.quote_accepted_at&&<p className="muted">Accepted {new Date(b.quote_accepted_at).toLocaleString('en-NZ',{timeZone:'Pacific/Auckland'})} (New Zealand time)</p>}</section>}
 {!!responses.length&&<section className="card"><h2>{role==='provider'?'Respond to this request':'Review this quote'}</h2>{responses.map(intent=><details className="activity-action" key={intent} open={intent!=='decline'}><summary>{intent==='quote'?(b.status==='quote_sent'?'Update quote':'Send quote'):intent==='confirm'?'Accept booking request':intent==='decline'?'Decline request':'Accept quote'}</summary>
 {intent==='quote'?<QuoteForm bookingId={b.id} amount={b.quote_amount} notes={b.quote_notes || null} sentAt={b.quote_sent_at} updating={b.status==='quote_sent'}/>:<ActionForm action={respondBooking} label={intent==='confirm'?'Accept booking request':intent==='decline'?'Decline request':'Accept quote'}>
 <input type="hidden" name="booking_id" value={b.id}/><input type="hidden" name="intent" value={intent}/>

 {intent==='accept'&&<><input type="hidden" name="quote_amount" value={b.quote_amount ?? ''}/><input type="hidden" name="quote_sent_at" value={b.quote_sent_at || ''}/><p>Accepting this quote for {money(b.quote_amount!)} confirms the booking. Review the quote notes and agree any extras first.</p><label className="account-setting"><input type="checkbox" required/>I agree to this quote and its notes.</label></>}
 {intent==='confirm'&&<p>This accepts the request and confirms the booking. Use Chat to agree timing, details and payment.</p>}{intent==='decline'&&<><p>This closes the request and notifies the requester.</p><label className="account-setting"><input type="checkbox" required/>I want to decline this request.</label></>}
 </ActionForm>}</details>)}</section>}
 </>
}
