import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireProvider } from '@/lib/auth'
import { AppShell } from '@/components/app-shell'
import { JOB_EDITOR_COLUMNS, repeatSeed, jobOwnerActions, validId, type JobSeed } from '@/lib/job-input'
import { JobForm } from './job-form'
export default async function NewJobPage({searchParams}:{searchParams:Promise<{repeat?:string;invite?:string}>}){
 const {repeat,invite}=await searchParams
 const query=new URLSearchParams();if(repeat)query.set('repeat',repeat);if(invite)query.set('invite',invite)
 const {supabase,user,profile}=await requireProvider('/jobs/new'+(query.size?'?'+query:''))
 let inviteProvider:{id:string;name:string}|undefined
 if(invite){if(!validId(invite))notFound();const {data:connection,error}=await supabase.from('connections').select('provider_id').eq('requester_id',user.id).eq('provider_id',invite).maybeSingle();if(error)throw new Error('Could not load this connection.');if(!connection)notFound();const {data:person,error:personError}=await supabase.from('profiles_public').select('id,full_name').eq('id',invite).maybeSingle();if(personError)throw new Error('Could not load this provider.');if(!person)notFound();inviteProvider={id:person.id,name:person.full_name || 'Your previous provider'}}
 let seed:JobSeed|undefined
 if(repeat){if(!validId(repeat))notFound();const {data,error}=await supabase.from('jobs').select(JOB_EDITOR_COLUMNS).eq('id',repeat).eq('requester_id',user.id).single();if(error)throw new Error('Could not load the original job.');if(!data||!jobOwnerActions(data.status,0).repeat)notFound();seed=repeatSeed(data as JobSeed)}
 return <AppShell providerName={profile?.full_name || 'Member'}><section className="page work-page"><Link className="card-link" href="/jobs">Back to Jobs</Link><h1>{inviteProvider?'Create an invited job':seed?'Repeat a job':'Post a job'}</h1><JobForm inviteProvider={inviteProvider} userId={user.id} seed={seed} mode={seed?'repeat':'new'}/></section></AppShell>
}
