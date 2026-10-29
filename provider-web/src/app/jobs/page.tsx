import {JobCardImage} from '@/components/job-card-image'
import Link from 'next/link'
import {redirect} from 'next/navigation'
import {AppShell} from '@/components/app-shell'
import {requireProvider} from '@/lib/auth'
import {DiscoverySearch} from '@/components/discovery-search'
import {SaveSearch} from '@/components/save-search'
import {ActionForm} from '@/components/action-form'
import {saveWatchedJob} from '../discovery-actions'
import {discoveryFilters,discover,discoveryHref,coordinates} from '@/lib/discovery'
import {loadDiscoveryJobs,watchedJobs,ownedInterest} from '@/lib/discovery-data'
import {browsingOrigin} from '@/lib/browsing-origin'
export const dynamic='force-dynamic'
export default async function JobsPage({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
 const {supabase,user,profile}=await requireProvider('/jobs'),params=await searchParams
 let f={...discoveryFilters(params),kind:''},locationLabel='your private profile location',origin=null as ReturnType<typeof coordinates>,error=false,watchError=false,locationError=false,providerDestination=''
 let rows:Awaited<ReturnType<typeof loadDiscoveryJobs>>=[],watch=new Set<string>()
 const [jobs,watched,location]=await Promise.allSettled([loadDiscoveryJobs(supabase),watchedJobs(supabase,user.id),browsingOrigin(supabase,user.id)])
 if(jobs.status==='fulfilled')rows=jobs.value;else error=true
 if(watched.status==='fulfilled')watch=new Set(watched.value.map(r=>r.job_id));else watchError=true
 if(location.status==='fulfilled'){origin=location.value.point;locationLabel=location.value.label}else locationError=true
 if(f.interest){try{const saved=await ownedInterest(supabase,user.id,f.interest);if(!saved)throw new Error('Unavailable search');if(saved.kind==='provider'&&saved.provider_id)providerDestination='/people/'+saved.provider_id;f={...f,q:saved.query || saved.capability || saved.recurring_work || '',category:saved.category || '',radius:saved.radius_km || null};if(saved.radius_km){origin=coordinates(saved.latitude,saved.longitude);locationLabel=saved.location_name || 'the saved search location'}}catch{error=true}}
 if(providerDestination)redirect(providerDestination)
 const needsLocation=(f.sort==='nearest'||!!f.radius)&&!origin,result=discover(rows,f,origin),href=(page:number)=>discoveryHref('/jobs',{...f,page})
 return <AppShell providerName={profile?.full_name || 'Member'}><section className="page work-page"><header className="home-heading"><div><p className="eyebrow">Jobs</p><h1>Find local work</h1><p className="muted">Open jobs from people in your community</p></div><Link href="/jobs/new" className="lform-save">Post a job</Link></header><div className="lform-actions"><Link href="/jobs/saved" className="card-link">Saved jobs</Link><Link href="/account/interests" className="card-link">Saved searches & alerts</Link><Link href="/activity" className="card-link">Manage my work</Link><Link href="/connections" className="card-link">Connections</Link></div>
 <DiscoverySearch filters={f} locationLabel={locationLabel} hasLocation={!!origin}/>{f.interest&&<p className="account-current">Viewing a saved search. Changing the search options starts a new search; your saved search stays unchanged.</p>}
 {watchError&&<p role="alert">Could not load saved-job status. Refresh before saving or removing jobs.</p>}
 {error?<div className="card" role="alert"><h2>Couldn&apos;t load jobs or the saved search</h2><p>Check your connection and try again.</p><Link href={href(f.page)} className="card-link">Retry</Link></div>:needsLocation?<div className="card"><h2>{locationError?'Could not load your location':'Choose a browsing location'}</h2><p>Use current location in Search options, add a private GPS location to your profile, or search Any distance with Newest first.</p><Link href="/account/profile" className="card-link">Open Profile</Link></div>:<>
 <p className="muted">{result.count} matching job{result.count===1?'':'s'}</p>{!result.count?<div className="home-empty"><h2>{f.q?'No jobs match “'+f.q+'”':f.category||f.radius?'No jobs match these options':'No open jobs yet'}</h2><p>Try another word or clear the search options.</p><Link href="/jobs" className="card-link">Clear search & options</Link></div>:<div className="work-grid">{result.rows.map(j=><article className="card work-result" key={j.id}><Link href={'/jobs/'+j.id}><JobCardImage photos={j.photos} category={j.category}/><span className="kind-tag">{j.category}</span><h2>{j.title}</h2><p className="work-clamp">{j.description}</p><p className="muted">{j.location_area || j.location_name || 'Location to be arranged'}{j.distance!==null?' · About '+j.distance.toFixed(1)+' km'+(j.discovery_location_approximate?' · town area':''):''}</p><strong>{j.price_type==='fixed'?'$'+j.price+'':'Open to offers'}</strong><p className="card-link">View job →</p></Link>{!watchError&&<ActionForm action={saveWatchedJob} label={watch.has(j.id)?'Remove saved job':'Save job'}><input name="job_id" type="hidden" value={j.id}/><input name="intent" type="hidden" value={watch.has(j.id)?'remove':'save'}/></ActionForm>}</article>)}</div>}
 {result.pages>1&&<nav className="lform-actions" aria-label="Job result pages">{result.page>1&&<Link href={href(result.page-1)} className="lform-cancel">Previous</Link>}<span>Page {result.page} of {result.pages}</span>{result.page<result.pages&&<Link href={href(result.page+1)} className="lform-cancel">Next</Link>}</nav>}
 <SaveSearch key={JSON.stringify(f)} filters={f} locationName={locationLabel}/>
 </>}
 </section></AppShell>
}
