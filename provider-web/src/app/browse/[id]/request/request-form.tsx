'use client'
import {bookingLocationPolicy,bookingPublicArea} from '@shared/bookingLocation'
import {readableRate} from '@shared/findLocalHelp'
import {DateInput} from '@/components/date-input'
import {formatMoney as nzMoney} from '@shared/formatting'
import {useState} from 'react'
import {ActionForm} from '@/components/action-form'
import {requestBooking} from '../../../work-actions'
import {variantDisplay,isValidVariant} from '@shared/listingPricing'
import {reviewBookingQuantity} from '@shared/listingEstimate'
import {bookingQuantityLimits} from '@shared/bookingQuantity'
import {selectedRate,pricingRevision,unitName,paymentCopy,type PricingListing} from '@/lib/booking-detail'
export function RequestForm({listing,requestId,initialVariant='',initialQuantity=1}:{listing:PricingListing & {id:string;location_name?:string|null;latitude?:number|null;longitude?:number|null};requestId:string;initialVariant?:string;initialQuantity?:number}){
 const [id]=useState(requestId)
 const locationPolicy=bookingLocationPolicy(listing.kind)
 const [index,setIndex]=useState(initialVariant),[quantity,setQuantity]=useState(String(initialQuantity)),[schedule,setSchedule]=useState('flexible'),[date,setDate]=useState(''),[notes,setNotes]=useState(''),[duration,setDuration]=useState(''),[location,setLocation]=useState(''),[locationNote,setLocationNote]=useState('')
 const [coords,setCoords]=useState<{latitude:number;longitude:number}|null>(null),[locating,setLocating]=useState(false),[error,setError]=useState('')
 const choice=selectedRate(listing,index),rate=choice.rate,perQuantity=['hourly','day_rate','per_unit'].includes(rate.pricing_type),review=reviewBookingQuantity(rate,null,perQuantity?quantity:1),quote=rate.pricing_type==='quote_required',unit=unitName(rate)
 const estimateText=quote?'Price to be quoted':review.ok&&review.amount!=null?(perQuantity?`Base estimate for ${review.quantity} ${unit}: ${nzMoney(review.amount.toFixed(2))}`:`Base estimate: ${nzMoney(review.amount.toFixed(2))}`):'Enter a valid quantity to see the estimate'
 function gps(){if(!navigator.geolocation){setError('GPS is unavailable in this browser. Enter the address manually.');return}setLocating(true);setError('');navigator.geolocation.getCurrentPosition(p=>{setCoords({latitude:p.coords.latitude,longitude:p.coords.longitude});setLocating(false)},()=>{setLocating(false);setError('Could not read your location. Allow location access or continue with the address.')},{timeout:15000,enableHighAccuracy:true})}
 return <ActionForm action={requestBooking} label={quote?'Request a quote':'Send booking request'} disabled={locating} submitDisabled={perQuantity&&!review.ok}>
 <input type="hidden" name="service_id" value={listing.id}/><input type="hidden" name="request_id" value={id}/><input type="hidden" name="pricing_revision" value={pricingRevision(listing)}/><input type="hidden" name="variant_index" value={index}/>{locationPolicy.collectRequesterLocation&&<><input type="hidden" name="latitude" value={coords?.latitude ?? ''}/><input type="hidden" name="longitude" value={coords?.longitude ?? ''}/></>}
 {!!listing.pricing_variants?.length&&<label className="lform-field">Rate option<select value={index} onChange={e=>{const next=e.target.value;setIndex(next);setQuantity(String(bookingQuantityLimits(selectedRate(listing,next).rate).minimum))}}><option value="">Standard rate - {readableRate(listing.pricing_type,listing.rate,listing.unit_label,listing.min_charge)}</option>{listing.pricing_variants.map((v,i)=><option key={i} value={i} disabled={!isValidVariant(v)}>{variantDisplay(v)}</option>)}</select></label>}
 {perQuantity?<label className="lform-field">Quantity ({unit})<input name="quantity" type="number" inputMode="decimal" min={review.minimum} max={review.maximum ?? undefined} step="any" required value={quantity} aria-invalid={!review.ok} aria-describedby={!review.ok?'quantity-error':undefined} onChange={e=>setQuantity(e.target.value)}/></label>:<input type="hidden" name="quantity" value="1"/>}
 {perQuantity&&!review.ok&&<p id="quantity-error" role="alert">{review.message}</p>}
 <div className="card"><h3>{estimateText}</h3><p>{choice.label || 'Standard rate'} · {readableRate(rate.pricing_type,rate.rate,rate.unit_label,rate.min_charge)}</p>{rate.min_charge?<p>Minimum charge included: {nzMoney(rate.min_charge)}</p>:null}{listing.kind==='grazing'&&/\/(week|month)$/.test(rate.unit_label || '')&&<p>This estimate covers one {rate.unit_label?.endsWith('/week')?'week':'month'}. Agree the full duration with the provider.</p>}<p>Extra charges may apply — agree the final price with the provider.</p></div>
 {locationPolicy.source!=='requester'&&<section className="card" aria-label={locationPolicy.label}><h3>{locationPolicy.label}</h3><p>{bookingPublicArea(listing.location_name)}</p><p>{locationPolicy.help}</p></section>}
 {locationPolicy.collectRequesterLocation&&<>
 <label className="lform-field">{locationPolicy.required?'Where is the work needed?':locationPolicy.inputLabel}{locationPolicy.required?' *':''}<input name="location" required={locationPolicy.required} maxLength={300} value={location} onChange={e=>{setLocation(e.target.value);setCoords(null)}}/></label>
 <div className="lform-actions"><button type="button" className="lform-cancel" disabled={!locationPolicy.required&&!location.trim()} onClick={gps}>Use current GPS location</button>{coords&&<button type="button" className="lform-cancel" onClick={()=>setCoords(null)}>Clear GPS</button>}</div>{coords&&<p className="muted">GPS: {coords.latitude.toFixed(5)}, {coords.longitude.toFixed(5)}</p>}<p className="muted">Use current GPS only if you are at the booking location. This does not change the address above.</p>{locating&&<p role="status">Finding location…</p>}{error&&<p role="alert">{error}</p>}
 <label className="lform-field">{listing.kind==='hire'?'Delivery/access details (optional)':'Arrival directions (optional)'}<textarea name="location_note" rows={2} maxLength={2000} value={locationNote} onChange={e=>setLocationNote(e.target.value)}/></label>
 </>}
 <label className="lform-field">Preferred timing<select name="schedule_type" value={schedule} onChange={e=>setSchedule(e.target.value)}><option value="asap">As soon as possible</option><option value="flexible">Flexible</option><option value="specific">On a specific date</option></select></label>{schedule==='specific'&&<label className="lform-field">Preferred date *<DateInput name="date" type="date" required value={date} onChange={e=>setDate(e.target.value)}/></label>}
 {listing.kind==='grazing'&&<label className="lform-field">Expected duration (optional)<input name="expected_duration" maxLength={120} value={duration} onChange={e=>setDuration(e.target.value)} placeholder="For example, 6 weeks — agree with the provider"/></label>}
 <label className="lform-field">Notes (optional)<textarea name="notes" rows={4} maxLength={5000} value={notes} onChange={e=>setNotes(e.target.value)} placeholder={listing.kind==='grazing'?'Livestock type, head count and grazing duration':'Details for the provider'}/></label>
 <p>{quote?'The provider will send a quote for you to review.':'The provider will review your request. Your booking is confirmed when they accept.'}</p><p>{paymentCopy(listing)}</p><p className="muted">{locationPolicy.collectRequesterLocation?'Any location details and notes you provide are shared with the provider to review your request.':'Your notes are shared with the provider to review your request.'}</p>
 </ActionForm>
}
