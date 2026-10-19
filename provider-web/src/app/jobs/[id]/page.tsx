import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AppShell } from '@/components/app-shell'
import { requireProvider } from '@/lib/auth'
import { ActionForm } from '@/components/action-form'
import { sendOffer, acceptOffer } from '../../work-actions'
import { statusLabel } from '@/lib/work'
export default async function JobPage({params}:{params:Promise<{id:string}>}) {
  const {supabase,user,profile}=await requireProvider();const {id}=await params
  const {data:job,error}=await supabase.from('jobs_public').select('*').eq('id',id).single()
  if(error || !job)notFound()
  const own=job.requester_id===user.id
  const {data:offers}=await supabase.from('bids').select('id,provider_id,amount,message,status').eq('job_id',id).order('created_at',{ascending:false})
  const ids=[...new Set([job.requester_id,...(offers || []).map(b=>b.provider_id)])]
  const {data:people}=await supabase.from('profiles_public').select('id,full_name').in('id',ids)
  const names=new Map((people || []).map(p=>[p.id,p.full_name]))
  return <AppShell providerName={profile?.full_name || 'Member'}><section className="page work-page"><Link href="/jobs" className="card-link">Back to Jobs</Link><p className="eyebrow">{statusLabel(job.status)}</p><h1>{job.title}</h1>
    <article className="card work-detail"><p>{job.category} · {job.location_area || job.location_name}</p><p className="work-description">{job.description}</p><strong>{job.price_type==='fixed'?'Budget: $'+job.price+' NZD':'Open to offers'}</strong><p>{job.scheduled_date || 'Flexible timing'}</p><p className="muted">Posted by {names.get(job.requester_id) || 'a community member'}</p>
      {job.location_name && <p>Location: {job.location_name}</p>}
      {job.hide_exact_location && <p className="muted">The exact property location is shared with the accepted provider.</p>}
    </article>
    {(offers || []).some(b=>b.status==='accepted' && (own || b.provider_id===user.id)) && <Link className="lform-save" href={'/activity/job/'+id}>Open conversation</Link>}
    {own ? <section className="card"><h2>Offers</h2>{!offers?.length && <p className="muted">Offers will appear here when people respond.</p>}{offers?.map(b=><article className="work-offer" key={b.id}><h3>{names.get(b.provider_id) || 'Provider'} · ${b.amount} NZD</h3><p className="work-description">{b.message}</p><p>{statusLabel(b.status)}</p>{job.status==='open' && b.status==='pending' && <ActionForm action={acceptOffer} label="Accept offer"><input type="hidden" name="offer_id" value={b.id}/><p>Accepting awards this job to this provider and declines the other offers.</p></ActionForm>}</article>)}</section>
    : offers?.some(b=>b.provider_id===user.id) ? <div className="card"><h2>Your offer</h2><p>You have already responded to this job.</p><Link href="/activity" className="card-link">Track it in Activity →</Link></div>
    : job.status==='open' && <section className="card"><h2>Send an offer</h2><ActionForm action={sendOffer} label="Send offer"><input type="hidden" name="job_id" value={id}/><label className="lform-field">Offer amount (NZD) *<input name="amount" type="number" min="0.01" step="0.01" required/></label><label className="lform-field">How can you help? *<textarea name="message" rows={4} required/></label><p className="muted">The requester will review your offer. Work is agreed when they accept.</p></ActionForm></section>}
  </section></AppShell>
}
