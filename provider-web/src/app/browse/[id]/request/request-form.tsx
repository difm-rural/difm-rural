'use client'
import { useState } from 'react'
import { ActionForm } from '@/components/action-form'
import { requestBooking } from '../../../work-actions'
import { bookingEstimate, type BookingRate } from '@/lib/booking-estimate'
export function RequestForm({listing}:{listing:BookingRate & {id:string;location_name?:string|null}}){
  const [quantity,setQuantity]=useState(Math.max(1,listing.minimum_units || 1))
  const estimate=bookingEstimate(listing,quantity),quote=listing.pricing_type==='quote_required'
  const unit=listing.pricing_type==='hourly'?'hours':listing.pricing_type==='day_rate'?'days':listing.unit_label || 'units'
  return <ActionForm action={requestBooking} label={quote?'Request a quote':'Send booking request'}>
    <input type="hidden" name="service_id" value={listing.id}/>
    <label className="lform-field">Quantity ({unit})<input name="quantity" type="number" min={listing.minimum_units || 1} step="any" required value={quantity} onChange={e=>setQuantity(Number(e.target.value))}/></label>
    <div className="card"><h3>{quote?'Price to be quoted':'Base estimate: $'+estimate.amount?.toFixed(2)+' NZD'}</h3>{listing.min_charge ? <p>Minimum charge included: ${listing.min_charge} NZD</p>:null}
    {estimate.quantity!==quantity && <p>Quantity adjusted to the listing limits: {estimate.quantity} {unit}.</p>}
    {listing.kind==='grazing' && /\/(week|month)$/.test(listing.unit_label || '') && <p>This estimate covers one {listing.unit_label?.endsWith('/week')?'week':'month'}. Agree the full duration with the provider.</p>}
    <p>Extra charges may apply — agree the final price with the provider.</p></div>
    <label className="lform-field">{listing.kind==='grazing'?'Grazing location':'Where is the work needed?'} *<input name="location" required defaultValue={listing.kind==='grazing'?listing.location_name || '':''}/></label>
    <label className="lform-field">Preferred start date (optional)<input name="date" type="date"/></label>
    <label className="lform-field">Notes (optional)<textarea name="notes" rows={4} placeholder={listing.kind==='grazing'?'Livestock type, head count and grazing duration':'Details for the provider'}/></label>
    <p>{quote?'The provider will send a quote for you to review.':'The provider will review your request. Your booking is confirmed when they accept.'}</p><p>You arrange payment directly with the provider.</p>
  </ActionForm>
}
