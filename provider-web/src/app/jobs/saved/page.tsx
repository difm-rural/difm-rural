import Link from 'next/link'
import {AppShell} from '@/components/app-shell'
import {requireProvider} from '@/lib/auth'
import {ActionForm} from '@/components/action-form'
import {saveWatchedJob} from '../../discovery-actions'
import {watchedJobs,allRows,type DiscoveryJob} from '@/lib/discovery-data'
import {statusLabel} from '@/lib/work'
export default async function SavedJobsPage(){
 const {supabase,user,profile}=await requireProvider('/jobs/saved')
 let saved:{job_id:string}[]=[],error=false
 const jobs:DiscoveryJob[]=[]
 try{saved=await watchedJobs(supabase,user.id);for(let i=0;i<saved.length;i+=200){const ids=saved.slice(i,i+200).map(r=>r.job_id);jobs.push(...await allRows<DiscoveryJob>(()=>supabase.from('jobs_public').select('id,title,status,category,location_name,location_area,description,created_at,price_type,price,requester_id,latitude,longitude').in('id',ids).order('id')))}}catch{error=true}
 const byId=new Map(jobs.map(j=>[j.id,j]))
 return <AppShell providerName={profile?.full_name || 'Member'}><section className="page work-page"><Link href="/jobs" className="card-link">Back to Jobs</Link><h1>Saved jobs</h1><p className="muted">The same saved jobs are available in the app. Closed jobs stay here until you remove them.</p>{error?<div className="card" role="alert"><h2>Couldn&apos;t load saved jobs</h2><p>Check your connection and try again.</p><Link href="/jobs/saved" className="card-link">Retry</Link></div>:!saved.length?<div className="home-empty"><h2>No saved jobs yet</h2><p>Save jobs from the Jobs board or a job detail screen to return to them later.</p><Link href="/jobs" className="lform-save">Find jobs</Link></div>:<div className="work-grid">{saved.map(item=>{const j=byId.get(item.job_id);return <article key={item.job_id} className="card work-detail">{j?<><p className="eyebrow">{statusLabel(j.status)}</p><h2><Link href={'/jobs/'+j.id}>{j.title}</Link></h2><p>{j.category} · {j.location_area || j.location_name || 'Location to be arranged'}</p><p className="work-clamp">{j.description}</p><Link href={'/jobs/'+j.id} className="card-link">View job →</Link></>:<><h2>Job unavailable</h2><p>This saved job was removed or is no longer visible to your account.</p></>}<ActionForm action={saveWatchedJob} label="Remove saved job"><input name="job_id" type="hidden" value={item.job_id}/><input name="intent" type="hidden" value="remove"/></ActionForm></article>})}</div>}</section></AppShell>
}
