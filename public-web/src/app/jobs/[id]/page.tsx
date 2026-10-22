/* eslint-disable @next/next/no-img-element -- Public storage photos are supplied by members. */
import Link from 'next/link'
import {notFound} from 'next/navigation'
import {publicClient} from '@/lib/public-client'
import {publicJobsQuery,UUID} from '@/lib/marketplace'
import {consoleLink} from '@/lib/console-link'
import {MarketplaceShell} from '@/components/marketplace-shell'
export const dynamic='force-dynamic'
export async function generateMetadata({params}:{params:Promise<{id:string}>}){return {title:'Job details',alternates:{canonical:'/jobs/'+(await params).id}}}
export default async function Job({params}:{params:Promise<{id:string}>}){
 const {id}=await params;if(!UUID.test(id))notFound()
 const {data:j,error}=await publicJobsQuery(publicClient()).eq('id',id).maybeSingle()
 if(error)throw new Error('Could not load job.');if(!j)notFound()
 return <MarketplaceShell><Link href="/jobs" className="public-link">← Back to jobs</Link><p className="eyebrow">Open job · {j.category}</p><h1>{j.title}</h1><p>{j.location_area || 'Location to be arranged'}</p><div className="public-photos">{j.photos?.map((url:string,i:number)=><a key={i} href={url} target="_blank" rel="noopener noreferrer"><img src={url} alt={j.title+' — photo '+(i+1)}/></a>)}</div>
 <article className="public-panel"><h2>The work</h2><p className="public-description">{j.description}</p><strong>{j.price_type==='fixed'&&j.price!=null?'Budget: $'+j.price+'':'Open to offers'}</strong><p>Timing: {j.schedule_type==='specific'?j.scheduled_date:j.schedule_type==='range'?j.date_from+' to '+j.date_to:'Arrange with the requester'}</p>{j.hide_exact_location&&<p>The exact property location is shared with the accepted provider.</p>}<p>Agree scope, timing and payment directly with the requester. Rural Connections does not handle payments.</p></article>
 <section className="public-panel public-handoff"><h2>Can you help with this job?</h2><p>Sign in to send an offer or ask a question. You can create an account with your email; no password is needed.</p><div className="public-actions"><a className="button primary" href={consoleLink('/jobs/'+id+'#offer')}>Sign in to send an offer</a><a className="button secondary" href={consoleLink('/jobs/'+id+'#questions')}>Sign in to ask a question</a></div><p>You will return to this job after sign-in and setup.</p></section>
 </MarketplaceShell>
}
