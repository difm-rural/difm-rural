import {requireProvider} from '@/lib/auth'
import {ActionForm} from '@/components/action-form'
import {ArrivalForm} from './arrival-form'
import {saveBookingSchedule} from './booking-schedule-actions'
export async function BookingSchedule({bookingId,userId,providerId,status}:{bookingId:string;userId:string;providerId:string;status:string}){
 const {supabase}=await requireProvider()
 const {data:s,error}=await supabase.from('work_schedules').select('arrival_start_at,arrival_end_at,expected_complete_at,last_late_notice_at,last_late_minutes').eq('booking_id',bookingId).maybeSingle()
 const active=['confirmed','in_progress'].includes(status),format=(value:string)=>new Date(value).toLocaleString('en-NZ',{dateStyle:'medium',timeStyle:'short',timeZone:'Pacific/Auckland'})
 return <section className="card work-detail"><h2>Arrival & work schedule</h2>{error?<p role="alert">Could not load the schedule. Refresh to try again.</p>:<>{s?<><p>Arrival: {format(s.arrival_start_at)} to {format(s.arrival_end_at)}</p><p>Expected finish: {format(s.expected_complete_at)}</p><p className="muted">New Zealand time (Pacific/Auckland)</p>{s.last_late_notice_at&&<p>Last delay update: about {s.last_late_minutes} minutes late · {format(s.last_late_notice_at)}</p>}</>:<p>Arrival time has not been confirmed. {userId!==providerId?'The provider can set a shared arrival window.':''}</p>}
 {active&&userId===providerId&&<details className="activity-action"><summary>{s?'Update arrival window':'Confirm arrival window'}</summary><ArrivalForm bookingId={bookingId}/></details>}
 {active&&s&&<details className="activity-action"><summary>I&apos;m running late</summary><ActionForm action={saveBookingSchedule} label="Send delay update"><input name="booking_id" type="hidden" value={bookingId}/><input name="intent" type="hidden" value="late"/><label className="lform-field">Expected delay<select name="minutes"><option value="15">About 15 minutes</option><option value="30">About 30 minutes</option></select></label><p>This notifies the other person. Delay updates are limited to one every 15 minutes.</p></ActionForm></details>}
 </>}</section>
}
