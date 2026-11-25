import Link from 'next/link'
import {ArrowRight, Search, House, BriefcaseBusiness} from 'lucide-react'
import {MarketplaceShell} from '@/components/marketplace-shell'
import {GuestCard} from '@/components/guest-card'
import {GuestRefresh} from '@/components/guest-refresh'
import {publicClient} from '@/lib/public-client'
import {browseFilters, browseHref, publicRows, publicResults, type PublicRow} from '@/lib/marketplace'
import {guestLocation} from '@/lib/guest-location'
import {NearbyControls} from '@/components/nearby-controls'
import {consoleLink} from '@/lib/console-link'
export const dynamic='force-dynamic'
export const metadata={title:'Get jobs done. Find work.',alternates:{canonical:'/'}}
function BrowseSection({kind,rows,failed,q,radius,filledNote}:{kind:'jobs'|'listings';rows:PublicRow[];failed:boolean;q:string;radius:number|null;filledNote?:string}){
 const title=kind==='jobs'?'Open jobs':'Available listings',filters=browseFilters({q}),result=publicResults(rows,filters,radius),href=browseHref('/'+kind,filters)
 return <section className="guest-section" aria-labelledby={kind+'-heading'}>
  <div className="guest-section-heading"><div><h2 id={kind+'-heading'}>{title}</h2><p>{kind==='jobs'?'Work people in your community need done':'Services, grazing, hire and local goods'}</p></div><Link href={href}>See all <ArrowRight size={16} aria-hidden="true"/></Link></div>
  {failed?<div className="guest-empty" role="alert"><h3>Couldn&apos;t load {kind}</h3><p>Check your connection and try again.</p><GuestRefresh label="Retry" className="button secondary"/></div>
  :!result.count?<div className="guest-empty"><h3>{q?'No '+kind+' match “'+q+'”':radius!==null?'No '+kind+' within '+radius+' km':kind==='jobs'?'No open jobs yet':'Nothing listed yet'}</h3><p>{radius!==null?'Try a wider distance or select All New Zealand above.':q?'Try another word or clear your search.':'Check back soon for new '+kind+' from your community.'}</p>{q?<Link href="/" className="public-link">Clear search</Link>:<Link href={href} className="public-link">Refresh {kind}</Link>}</div>
  :<><div className="guest-card-row" tabIndex={0} role="region" aria-label={title+' — scroll to browse'}>{result.rows.slice(0,8).map(row=><GuestCard key={row.id} row={row} kind={kind}/>)}</div><p className="guest-row-hint">{result.count>8?'Showing the latest 8 of '+result.count+' matches. ':''}Scroll to explore · <Link href={href}>View all {kind}</Link></p></>}
  {radius!==null&&result.unlocated>0&&<p className="guest-row-hint">{result.unlocated} {kind} whose public area could not be located can be found under All New Zealand.</p>}
  {filledNote&&<p className="guest-row-hint">{filledNote}</p>}
 </section>
}
export default async function Home({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
 const {q}=browseFilters(await searchParams),location=await guestLocation(),radius=location.point?location.radius:null,origin=radius!==null?location.point:null
 const results=await Promise.allSettled([Promise.resolve().then(()=>publicRows(publicClient(),'jobs',origin)),Promise.resolve().then(()=>publicRows(publicClient(),'listings',origin))])
 // Nationwide aggregate only; shown when >= 5 so it never advertises a quiet month.
 let filledCount=0
 try{const {data,error}=await publicClient().rpc('filled_jobs_count');if(!error&&typeof data==='number')filledCount=data}catch{}
 return <MarketplaceShell home>
  <header className="guest-intro"><p className="eyebrow">Local help. Rural know-how.</p><div className="guest-intro-title"><h1>Get jobs done. Find work.</h1><Link href="/how-it-works" className="guest-how-link">How it works</Link></div><p>Connect with rural people nearby for practical help, services, equipment and more.</p><p className="guest-signin-hint">Browse freely. <a href={consoleLink()}>Sign in or join</a> to get in touch and manage your work.</p>
   <form className="guest-search" action="/" role="search"><label className="guest-sr-only" htmlFor="guest-search">Search jobs and listings</label><Search size={21} aria-hidden="true"/><input id="guest-search" name="q" defaultValue={q} maxLength={120} placeholder="Search jobs, services and equipment..."/><button className="button primary">Search</button></form>
   {q&&<p className="guest-search-context">Results for “{q}” <Link href="/">Clear search</Link></p>}
  </header>
  <section className="guest-entry-cards" aria-label="Explore Rural Connections">
   <Link href="/listings" className="guest-entry-card"><House size={25} aria-hidden="true"/><h2>Find help</h2><p>Find services and people to help.</p><strong>Browse listings <ArrowRight size={16} aria-hidden="true"/></strong></Link>
   <Link href="/jobs" className="guest-entry-card"><BriefcaseBusiness size={25} aria-hidden="true"/><h2>Find work</h2><p>Find jobs posted near you.</p><strong>Browse jobs <ArrowRight size={16} aria-hidden="true"/></strong></Link>
  </section>
  <NearbyControls location={location}/>
  <div className="guest-browse-heading"><p>Explore your community</p><GuestRefresh/></div>
  {(['jobs','listings'] as const).map((kind,i)=>{const result=results[i];return <BrowseSection key={kind} kind={kind} q={q} radius={radius} failed={result.status==='rejected'} rows={result.status==='fulfilled'?result.value:[]} filledNote={kind==='jobs'&&filledCount>=5?filledCount+' jobs filled across New Zealand this month':undefined}/>})}
  <section className="guest-get-started"><div><h2>Have something in mind?</h2><p>Post a job for help, or create a listing to offer a service, grazing, hire or local goods.</p></div><div className="public-actions"><a className="button primary" href={consoleLink('/jobs/new')}>Post a job <ArrowRight size={17} aria-hidden="true"/></a><a className="button secondary" href={consoleLink('/listings/new')}>Create a listing</a></div></section>
 </MarketplaceShell>
}
