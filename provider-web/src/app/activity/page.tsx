import Link from 'next/link'
import { requireProvider } from '@/lib/auth'
import { AppShell } from '@/components/app-shell'
import { LiveRefresh } from '@/components/live-refresh'
import { ActionForm } from '@/components/action-form'
import { respondBooking } from '../work-actions'
import { statusLabel } from '@/lib/work'
export const dynamic='force-dynamic'
export default async function ActivityPage(){
  const {supabase,user,profile}=await requireProvider()
  const [jobs,offers,bookings]=await Promise.all([
    supabase.from('jobs').select('id,title,status,created_at').eq('requester_id',user.id).order('created_at',{ascending:false}),
    supabase.from('bids').select('id,job_id,amount,status').eq('provider_id',user.id),
    supabase.from('bookings').select('*,service:services(title,kind,pricing_type)').or('requester_id.eq.'+user.id+',provider_id.eq.'+user.id).order('created_at',{ascending:false}),
  ])
  const jobIds=[...new Set((offers.data || []).map(o=>o.job_id))]
  const offerJobs=jobIds.length?await supabase.from('jobs_public').select('id,title,status').in('id',jobIds):{data:[],error:null}
  const nameIds=[...new Set((bookings.data || []).flatMap(b=>[b.provider_id,b.requester_id]))]
  const people=nameIds.length?await supabase.from('profiles_public').select('id,full_name').in('id',nameIds):{data:[]}
  const names=new Map((people.data || []).map(p=>[p.id,p.full_name]))
  const hasError=[jobs,offers,bookings,offerJobs].some(r=>r.error)
  return <AppShell providerName={profile?.full_name || 'Member'}><section className="page work-page"><header className="home-heading"><div><p className="eyebrow">Your arrangements</p><h1>Activity</h1></div><LiveRefresh/></header>
    <Link href="/enquiries" className="card home-quick">Messages — listing enquiries →</Link>
    {hasError && <p className="home-load-error" role="alert">Some activity could not be loaded. Refresh to try again.</p>}
    <section><h2>Your jobs</h2>{!jobs.error && !jobs.data?.length && <p className="muted">No jobs posted yet. <Link className="card-link" href="/jobs/new">Post a job</Link></p>}<div className="work-grid">{jobs.data?.map(j=><Link className="card" key={j.id} href={'/jobs/'+j.id}><h3>{j.title}</h3><p>{statusLabel(j.status)}</p><span className="card-link">View job & offers →</span></Link>)}</div></section>
    <section><h2>Your offers</h2>{!offers.error && !offers.data?.length && <p className="muted">No offers yet. <Link className="card-link" href="/jobs">Find jobs</Link></p>}<div className="work-grid">{offers.data?.map(o=>{const job=offerJobs.data?.find(j=>j.id===o.job_id);return <article className="card" key={o.id}><h3><Link href={'/jobs/'+o.job_id}>{job?.title || 'Job'}</Link></h3><p>${o.amount} NZD · {o.status==='pending'?'Awaiting response':statusLabel(o.status)}</p>{o.status==='accepted' && <Link className="card-link" href={'/activity/job/'+o.job_id}>Open conversation →</Link>}</article>})}</div></section>
    <section><h2>Bookings & requests</h2>{!bookings.error && !bookings.data?.length && <p className="muted">No bookings or requests yet. <Link className="card-link" href="/browse">Browse listings</Link></p>}
      <div className="work-grid">{bookings.data?.map(b=>{const provider=b.provider_id===user.id, other=provider?b.requester_id:b.provider_id;return <article key={b.id} id={'booking-'+b.id} className="card work-detail"><p className="eyebrow">{provider?'Providing':'Requested by you'}</p><h3>{b.service?.title || 'Booking'}</h3><strong>{statusLabel(b.status)}</strong><p>{names.get(other) || 'Community member'}</p><p>{b.location_name}</p><p>{b.scheduled_date}</p>{b.notes && <p className="work-description">{b.notes}</p>}
        {b.quote_amount!=null && <p>Quote: ${b.quote_amount} NZD</p>}{b.quote_notes && <p>{b.quote_notes}</p>}
        {b.status==='confirmed' && <p>{b.service?.kind==='grazing'?'Grazing arrangement accepted. Use Chat to agree ongoing dates, details and payment.':'Your booking is confirmed. Use Chat to arrange details and payment.'}</p>}
        <Link href={'/activity/booking/'+b.id} className="card-link">Open conversation →</Link>
        {provider && b.status==='pending' && <ActionForm action={respondBooking} label={b.service?.pricing_type==='quote_required'?'Send quote':'Confirm booking'}><input type="hidden" name="booking_id" value={b.id}/><input type="hidden" name="intent" value={b.service?.pricing_type==='quote_required'?'quote':'confirm'}/>{b.service?.pricing_type==='quote_required' && <><label className="lform-field">Quote (NZD)<input type="number" name="amount" min="0.01" step="0.01" required/></label><label className="lform-field">Quote notes<textarea name="notes"/></label></>}</ActionForm>}
        {provider && ['pending','quote_sent'].includes(b.status) && <ActionForm action={respondBooking} label="Decline request"><input type="hidden" name="booking_id" value={b.id}/><input type="hidden" name="intent" value="decline"/></ActionForm>}
        {!provider && b.status==='quote_sent' && <ActionForm action={respondBooking} label="Accept quote"><input type="hidden" name="booking_id" value={b.id}/><input type="hidden" name="intent" value="accept"/></ActionForm>}
        {provider && b.status==='cancellation_requested' && <ActionForm action={respondBooking} label="Confirm cancellation"><input type="hidden" name="booking_id" value={b.id}/><input type="hidden" name="intent" value="cancel"/><p>The requester has asked to cancel this arrangement.</p></ActionForm>}
      </article>})}</div>
    </section>
  </section></AppShell>
}
