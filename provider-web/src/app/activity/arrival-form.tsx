'use client'
import {useState} from 'react'
import {ActionForm} from '@/components/action-form'
import {saveBookingSchedule} from './booking-schedule-actions'

// Arrival + a short grace (the schema stores an end; running-late and completion
// logic still need one).
const GRACE_MS = 30 * 60 * 1000

function roundUpHalfHour(d: Date) {
  const r = new Date(d)
  r.setSeconds(0, 0)
  const m = r.getMinutes()
  if (m === 0 || m === 30) return r
  if (m < 30) r.setMinutes(30)
  else { r.setMinutes(0); r.setHours(r.getHours() + 1) }
  return r
}
function defaultArrival() {
  const now = new Date()
  // e.g. now 1:45 pm → round up to 2:00, which is within 15 min → 2:30 pm.
  let r = roundUpHalfHour(now)
  if (r.getTime() - now.getTime() <= 15 * 60 * 1000) r = new Date(r.getTime() + 30 * 60 * 1000)
  return r
}
function toLocal(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export function ArrivalForm({bookingId}:{bookingId:string}){
 const start0 = defaultArrival()
 const [arrival, setArrival] = useState(() => toLocal(start0))
 const [finish, setFinish] = useState(() => toLocal(new Date(start0.getTime() + 6 * 60 * 60 * 1000)))
 const arrivalDate = new Date(arrival), finishDate = new Date(finish)
 const iso = (d: Date) => Number.isNaN(d.getTime()) ? '' : d.toISOString()
 const endIso = Number.isNaN(arrivalDate.getTime()) ? '' : new Date(arrivalDate.getTime() + GRACE_MS).toISOString()
 const isPast = !Number.isNaN(arrivalDate.getTime()) && arrivalDate.getTime() <= Date.now()
 const invalidFinish = !Number.isNaN(finishDate.getTime()) && !Number.isNaN(arrivalDate.getTime()) && finishDate <= arrivalDate
 const blocked = isPast || invalidFinish || Number.isNaN(arrivalDate.getTime())
 return <ActionForm action={saveBookingSchedule} label="Confirm arrival time" disabled={blocked}>
  <input name="booking_id" type="hidden" value={bookingId}/><input name="intent" type="hidden" value="arrival"/>
  <input name="start" type="hidden" value={iso(arrivalDate)}/><input name="end" type="hidden" value={endIso}/><input name="finish" type="hidden" value={iso(finishDate)}/>
  <p className="muted">Enter times in your browser&apos;s local time zone. The saved time is shown in New Zealand time to both people.</p>
  <label className="lform-field">Expected arrival *<input type="datetime-local" required value={arrival} onChange={e=>setArrival(e.target.value)}/></label>
  <label className="lform-field">Expected finish *<input type="datetime-local" required value={finish} onChange={e=>setFinish(e.target.value)}/></label>
  {isPast && <p className="form-error" role="alert">That time has already passed. Pick a time later today or another day.</p>}
  {invalidFinish && <p className="form-error" role="alert">The finish time must be after the arrival time.</p>}
  <p>The requester will be notified when you save this time.</p>
 </ActionForm>
}
