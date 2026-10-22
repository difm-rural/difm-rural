'use client'
import {useState} from 'react'
import {ActionForm} from '@/components/action-form'
import {respondBooking} from '../work-actions'
export function QuoteForm({bookingId,amount:initial,notes:initialNotes,sentAt,updating}:{bookingId:string;amount:number|null;notes:string|null;sentAt:string|null;updating:boolean}){
 const [amount,setAmount]=useState(initial==null?'':String(initial)),[notes,setNotes]=useState(initialNotes || '')
 return <ActionForm action={respondBooking} label={updating?'Send updated quote':'Send quote'}><input type="hidden" name="booking_id" value={bookingId}/><input type="hidden" name="intent" value="quote"/><input type="hidden" name="expected_quote_sent_at" value={sentAt || ''}/><label className="lform-field">Quote amount ($) *<input name="amount" type="number" min="0.01" max="10000000" step="0.01" required value={amount} onChange={e=>setAmount(e.target.value)}/></label><label className="lform-field">What is included? (optional)<textarea name="notes" rows={4} maxLength={5000} value={notes} onChange={e=>setNotes(e.target.value)}/></label><p>The requester must accept this quote before the booking is confirmed. Include agreed extras in the amount or explain them clearly.</p></ActionForm>
}
