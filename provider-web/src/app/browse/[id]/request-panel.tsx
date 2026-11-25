'use client'
import {readableRate} from '@shared/findLocalHelp'
import {formatMoney as nzMoney} from '@shared/formatting'
import {useState} from 'react'
import Link from '@/components/navigation-link'
import {variantDisplay,isValidVariant} from '@shared/listingPricing'
import {reviewBookingQuantity} from '@shared/listingEstimate'
import {bookingQuantityLimits} from '@shared/bookingQuantity'
import {selectedRate,unitName,type PricingListing} from '@/lib/booking-detail'
export function ListingRequestPanel({listing}:{listing:PricingListing & {id:string;provider_id:string}}){
 const [index,setIndex]=useState(''),[quantity,setQuantity]=useState(String(Math.max(1,listing.minimum_units || 1)))
 const choice=selectedRate(listing,index),rate=choice.rate,perQuantity=['hourly','day_rate','per_unit'].includes(rate.pricing_type),wholeHead=bookingQuantityLimits(rate).wholeHead,review=reviewBookingQuantity(rate,null,perQuantity?quantity:1),quote=rate.pricing_type==='quote_required',unit=unitName(rate)
 const estimateText=quote?'Price to be quoted':review.ok&&review.amount!=null?(perQuantity?`Base estimate for ${review.quantity} ${unit}: ${nzMoney(review.amount.toFixed(2))}`:`Base estimate: ${nzMoney(review.amount.toFixed(2))}`):'Enter a valid quantity to see the estimate'
 return <section className="card work-detail"><h2>{quote?'Request a quote':'Plan your request'}</h2>
 {!!listing.pricing_variants?.length&&<label className="lform-field">Rate option<select value={index} onChange={e=>{const next=e.target.value;setIndex(next);setQuantity(String(bookingQuantityLimits(selectedRate(listing,next).rate).minimum))}}><option value="">Standard rate - {readableRate(listing.pricing_type,listing.rate,listing.unit_label,listing.min_charge)}</option>{listing.pricing_variants.map((v,i)=><option value={i} key={i} disabled={!isValidVariant(v)}>{variantDisplay(v)}</option>)}</select></label>}
 {perQuantity&&<label className="lform-field">Quantity ({unit})<input type="number" inputMode={wholeHead?'numeric':'decimal'} min={review.minimum} max={review.maximum ?? undefined} step={wholeHead?1:'any'} value={quantity} aria-invalid={!review.ok} aria-describedby={!review.ok?'plan-quantity-error':undefined} onChange={e=>setQuantity(e.target.value)}/></label>}
 {perQuantity&&!review.ok&&<p id="plan-quantity-error" role="alert">{review.message}</p>}
 <strong>{estimateText}</strong>{rate.min_charge? <p>Minimum charge included: {nzMoney(rate.min_charge)}.</p>:null}
 {listing.kind==='grazing'&&/\/(week|month)$/.test(rate.unit_label || '')&&<p>This estimate covers one {rate.unit_label?.endsWith('/week')?'week':'month'}. Agree the full duration and payment schedule with the provider.</p>}
 <p className="muted">Extra charges may apply — agree the final price with the provider.</p>{review.ok?<Link className="lform-save" href={'/browse/'+listing.id+'/request?quantity='+review.quantity+'&variant='+encodeURIComponent(index)}>{quote?'Request a quote':'Request a booking'}</Link>:<button type="button" className="lform-save" disabled>{quote?'Request a quote':'Request a booking'}</button>}
 </section>
}
