import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireProvider } from '@/lib/auth'
import { AppShell } from '@/components/app-shell'
import { JOB_EDITOR_COLUMNS, repeatSeed, jobOwnerActions, validId, type JobSeed } from '@/lib/job-input'
import { JobForm } from './job-form'
export default async function NewJobPage({searchParams}:{searchParams:Promise<{repeat?:string}>}){
 const {supabase,user,profile}=await requireProvider(),{repeat}=await searchParams
 let seed:JobSeed|undefined
 if(repeat){if(!validId(repeat))notFound();const {data,error}=await supabase.from('jobs').select(JOB_EDITOR_COLUMNS).eq('id',repeat).eq('requester_id',user.id).single();if(error)throw new Error('Could not load the original job.');if(!data||!jobOwnerActions(data.status,0).repeat)notFound();seed=repeatSeed(data as JobSeed)}
 return <AppShell providerName={profile?.full_name || 'Member'}><section className="page work-page"><Link className="card-link" href="/jobs">Back to Jobs</Link><h1>{seed?'Repeat a job':'Post a job'}</h1><JobForm userId={user.id} seed={seed} mode={seed?'repeat':'new'}/></section></AppShell>
}
