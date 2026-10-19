'use client'
import {useState} from 'react'
import {ActionForm} from '@/components/action-form'
import {saveBookingSchedule} from './booking-schedule-actions'
export function ArrivalForm({bookingId}:{bookingId:string}){
 const [start,setStart]=useState(''),[end,setEnd]=useState(''),[finish,setFinish]=useState('')
 const iso=(value:string)=>{const d=new Date(value);return Number.isNaN(d.getTime())?'':d.toISOString()}
 return <ActionForm action={saveBookingSchedule} label="Confirm arrival window"><input name="booking_id" type="hidden" value={bookingId}/><input name="intent" type="hidden" value="arrival"/><input name="start" type="hidden" value={iso(start)}/><input name="end" type="hidden" value={iso(end)}/><input name="finish" type="hidden" value={iso(finish)}/><p className="muted">Enter times in your browser&apos;s local time zone. The saved schedule is shown in New Zealand time to both people.</p><label className="lform-field">Arrival from *<input type="datetime-local" required value={start} onChange={e=>setStart(e.target.value)}/></label><label className="lform-field">Arrival by *<input type="datetime-local" required value={end} onChange={e=>setEnd(e.target.value)}/></label><label className="lform-field">Expected finish *<input type="datetime-local" required value={finish} onChange={e=>setFinish(e.target.value)}/></label><p>The requester will be notified when you save this window.</p></ActionForm>
}
