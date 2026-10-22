'use client'
import {useState} from 'react'
import Link from 'next/link'
import {formatRate,variantDisplay,isValidVariant} from '@shared/listingPricing'
import {bookingEstimate} from '@/lib/booking-estimate'
import {selectedRate,unitName,type PricingListing} from '@/lib/booking-detail'
export function ListingRequestPanel({listing}:{listing:PricingListing & {id:string;provider_id:string}}){
 const [index,setIndex]=useState(''),[quantity,setQuantity]=useState(Math.max(1,listing.minimum_units || 1))
 const choice=selectedRate(listing,index),rate=choice.rate,estimate=bookingEstimate(rate,quantity),quote=rate.pricing_type==='quote_required',perQuantity=['hourly','day_rate','per_unit'].includes(rate.pricing_type)
 return <section className="card work-detail"><h2>{quote?'Request a quote':'Plan your request'}</h2>
 {!!listing.pricing_variants?.length&&<label className="lform-field">Rate option<select value={index} onChange={e=>{setIndex(e.target.value);const r=selectedRate(listing,e.target.value).rate;setQuantity(Math.max(1,r.minimum_units || 1))}}><option value="">Standard rate - {formatRate(listing.pricing_type,listing.rate,listing.unit_label)}</option>{listing.pricing_variants.map((v,i)=><option value={i} key={i} disabled={!isValidVariant(v)}>{variantDisplay(v)}</option>)}</select></label>}
 {perQuantity&&<label className="lform-field">Quantity ({unitName(rate)})<input type="number" min={Math.max(1,rate.minimum_units || 1)} step="any" value={quantity} onChange={e=>setQuantity(Number(e.target.value))}/></label>}
 <strong>{quote?'Price to be quoted':'Base estimate: $'+estimate.amount?.toFixed(2)+''}</strong>{rate.min_charge? <p>Minimum charge included: ${rate.min_charge}.</p>:null}{estimate.quantity!==quantity&&<p>Estimate uses {estimate.quantity} {unitName(rate)}, within this listing&apos;s limits.</p>}
 {listing.kind==='grazing'&&/\/(week|month)$/.test(rate.unit_label || '')&&<p>This estimate covers one {rate.unit_label?.endsWith('/week')?'week':'month'}. Agree the full duration and payment schedule with the provider.</p>}
 <p className="muted">Extra charges may apply — agree the final price with the provider.</p><Link className="lform-save" href={'/browse/'+listing.id+'/request?quantity='+estimate.quantity+'&variant='+encodeURIComponent(index)}>{quote?'Request a quote':'Request a booking'}</Link>
 </section>
}
