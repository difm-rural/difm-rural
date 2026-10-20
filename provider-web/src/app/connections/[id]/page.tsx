import Link from 'next/link'
import {notFound} from 'next/navigation'
import {AppShell} from '@/components/app-shell'
import {requireProvider} from '@/lib/auth'
import {loadConnections,connectionHistory,type SharedWork} from '@/lib/connections-data'
import {ActionForm} from '@/components/action-form'
import {inviteConnection} from '../actions'
import {ConnectionListings} from '../connection-listings'
import {validId} from '@/lib/job-input'
export default async function ConnectionPage({params}:{params:Promise<{id:string}>}){
 const {id}=await params,{supabase,user,profile}=await requireProvider('/connections/'+id)
 if(!validId(id))notFound()
 const connection=(await loadConnections(supabase,user.id)).find(c=>c.personId===id);if(!connection)notFound()
 let history:SharedWork[]=[],historyError=false
 try{history=await connectionHistory(supabase,user.id,id)}catch{historyError=true}
 const [{data:jobs,error:jobsError},{data:invites,error:inviteError}]=await Promise.all([supabase.from('jobs').select('id,title').eq('requester_id',user.id).eq('status','open').order('created_at',{ascending:false}),supabase.from('job_invites').select('job_id,status').eq('requester_id',user.id).eq('provider_id',id)])
 const name=connection.person?.full_name || 'This person',month=(date:string)=>new Date(date).toLocaleDateString('en-NZ',{month:'long',year:'numeric',timeZone:'Pacific/Auckland'})
 return <AppShell providerName={profile?.full_name || 'Member'}><section className="page work-page"><Link href="/connections" className="card-link">Back to Connections</Link><h1>{name}</h1><section className="card work-detail"><h2>Your history together</h2><p>{connection.times} completed arrangements · {connection.jobs} jobs · {connection.bookings} bookings</p><p>{connection.categories.join(' · ')}</p><p className="muted">First engagement: {month(connection.first)} · Most recent engagement: {month(connection.last)}. These dates refer to when the work was posted or requested.</p>{connection.person&&<Link href={'/people/'+id} className="card-link">View profile, live listings & reviews →</Link>}</section>
 {connection.canInvite&&connection.person&&<section className="card work-detail"><h2>Work together again</h2><Link href={'/jobs/new?invite='+id} className="lform-save">Create a job for {name}</Link><p className="muted">A new invited job is private to you and this provider unless you choose to put it on the public board.</p>{jobsError||inviteError?<p role="alert">Could not check your open jobs and invitations. Refresh before inviting.</p>:jobs?.length?<details className="activity-action"><summary>Invite to an existing open job</summary><ActionForm action={inviteConnection} label="Send invitation"><input name="person_id" type="hidden" value={id}/><label className="lform-field">Your open job<select name="job_id" required defaultValue=""><option value="" disabled>Choose a job</option>{jobs.map(j=><option value={j.id} key={j.id} disabled={invites?.some(i=>i.job_id===j.id)}>{j.title}{invites?.some(i=>i.job_id===j.id)?' — already invited':''}</option>)}</select></label><label className="account-setting"><input name="confirmed" type="checkbox" required/>Invite {name} to view this job and send an offer.</label></ActionForm></details>:<p className="muted">You have no open jobs to invite them to.</p>}</section>}
 {!connection.canInvite&&<p className="muted">This person previously requested your help. Their profile shows any live listings they now offer.</p>}
 <ConnectionListings providerId={id}/>
 <section className="card"><h2>Completed work</h2>{historyError?<p role="alert">Could not load shared work. Refresh to try again.</p>:history.map(w=><p key={w.kind+w.id}><Link href={'/activity/'+w.kind+'/'+w.id+'/manage'} className="card-link">{w.title} · {w.kind==='job'?'Job':'Booking'} · {month(w.created_at)} →</Link></p>)}{!historyError&&!history.length&&<p className="muted">The shared work records are no longer available.</p>}</section>
 </section></AppShell>
}
