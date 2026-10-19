import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireProvider } from '@/lib/auth'
import { AppShell } from '@/components/app-shell'
import { JOB_EDITOR_COLUMNS, type JobSeed } from '@/lib/job-input'
import { JobForm } from '../../new/job-form'
export default async function EditJobPage({params}:{params:Promise<{id:string}>}){
 const {supabase,user,profile}=await requireProvider(),{id}=await params
 const {data:job,error}=await supabase.from('jobs').select(JOB_EDITOR_COLUMNS).eq('id',id).eq('requester_id',user.id).maybeSingle()
 if(error)throw new Error('Could not load your job. Refresh to try again.');if(!job)notFound()
 const {count,error:offerError}=await supabase.from('bids').select('id',{count:'exact',head:true}).eq('job_id',id)
 return <AppShell providerName={profile?.full_name || 'Member'}><section className="page work-page"><Link href={'/jobs/'+id} className="card-link">Back to job</Link><h1>Edit job</h1>{job.status!=='open'?<p>This job is no longer open and cannot be edited.</p>:offerError?<p role="alert">Could not check existing offers. Refresh before editing.</p>:<JobForm userId={user.id} seed={job as JobSeed} mode="edit" offerCount={count || 0}/>}</section></AppShell>
}
