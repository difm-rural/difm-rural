import {formatDateTime as nzDateTime} from '@shared/formatting'
import {requireProvider} from '@/lib/auth'
import {ActionForm} from '@/components/action-form'
import {ArrivalForm} from './arrival-form'
import {saveBookingSchedule} from './booking-schedule-actions'
export async function BookingSchedule({bookingId,userId,providerId,status}:{bookingId:string;userId:string;providerId:string;status:string}){
 const {supabase}=await requireProvider()
 const {data:s,error}=await supabase.from('work_schedules').select('arrival_start_at,arrival_end_at,expected_complete_at,last_late_notice_at,last_late_minutes').eq('booking_id',bookingId).maybeSingle()
 const active=['confirmed','in_progress'].includes(status),format=(value:string)=>nzDateTime(new Date(value))
 return <section className="card work-detail"><h2>Arrival & work schedule</h2>{error?<p role="alert">Could not load the schedule. Refresh to try again.</p>:<>{s?<><p>Expected arrival: {format(s.arrival_start_at)}</p><p className="muted">New Zealand time (Pacific/Auckland)</p>{s.last_late_notice_at&&<p>Last delay update: about {s.last_late_minutes} minutes late · {format(s.last_late_notice_at)}</p>}</>:<p>Arrival time has not been confirmed. {userId!==providerId?'The provider can set a shared arrival window.':''}</p>}
 {active&&userId===providerId&&<details className="activity-action"><summary>{s?'Update arrival window':'Confirm arrival window'}</summary><ArrivalForm bookingId={bookingId}/></details>}
 </>}</section>
}
