'use client'
import {useCallback,useEffect,useState} from 'react'
import Link from '@/components/navigation-link'
import {createClient} from '@/lib/supabase/client'
import {statusLabel} from '@/lib/work'
import {loadPropertyJobs,propertyJobChoices,propertyLinkedJobs,propertyJobDate,setPropertyJob,type AreaJob} from '@shared/propertyNetworkJobs'
export function PropertyAreaJobs({owner,area}:{owner:string;area:string}){
 const [client]=useState(createClient),[data,setData]=useState<Awaited<ReturnType<typeof loadPropertyJobs>>|null>(null)
 const [error,setError]=useState(''),[busy,setBusy]=useState(false),[open,setOpen]=useState(false),[limit,setLimit]=useState(20)
 const load=useCallback(async()=>{setError('');try{setData(await loadPropertyJobs(client,owner))}catch{setError('Could not load linked jobs. Try again.')}},[client,owner])
 useEffect(()=>{let active=true;setData(null);loadPropertyJobs(client,owner).then(rows=>{if(active)setData(rows)}).catch(()=>{if(active)setError('Could not load linked jobs. Try again.')});return()=>{active=false}},[client,owner])
 async function change(job:AreaJob,link:boolean){if(busy)return;setBusy(true);setError('');try{await setPropertyJob(client,owner,area,job,link);await load();if(link)setOpen(false)}catch{setError('Could not update this job link. Try again.')}finally{setBusy(false)}}
 const linked=data?propertyLinkedJobs(data.jobs,data.links,area):[],choices=data?propertyJobChoices(data.jobs,data.links,area):[]
 return <section className="property-service"><h3>Jobs for this area</h3><p>Link jobs you posted to this area. Job details and history stay in Jobs.</p>
  {error&&<p role="alert">{error} <button type="button" onClick={()=>void load()}>Retry jobs</button></p>}
  {!data&&!error&&<p role="status">Loading jobs…</p>}
  {data&&!linked.length&&<p>No jobs linked to this area yet.</p>}
  {linked.map(job=><article key={job.id}><Link href={'/jobs/'+job.id}>{job.title}</Link><p>{statusLabel(job.status)} · {propertyJobDate(job)}{job.provider?' · '+job.provider:''}</p><button type="button" disabled={busy} onClick={()=>void change(job,false)}>Remove job link</button></article>)}
  {data&&<button type="button" aria-expanded={open} onClick={()=>setOpen(value=>!value)}>{open?'Close job selection':'Link an existing job'}</button>}
  {open&&<div><p>Choose one of your active or completed jobs. No category is assigned automatically.</p>
   {!choices.length&&<p>No more active or completed jobs to link.</p>}
   {choices.slice(0,limit).map(job=><article key={job.id}><button type="button" disabled={busy} onClick={()=>void change(job,true)}>Link {job.title}</button><p>{statusLabel(job.status)} · {propertyJobDate(job)}{job.provider?' · '+job.provider:''}</p></article>)}
   {choices.length>limit&&<button type="button" onClick={()=>setLimit(value=>value+20)}>Show more jobs</button>}
  </div>}
 </section>
}
