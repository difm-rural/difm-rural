import Link from 'next/link'
import {ArrowRight, Search, CircleHelp} from 'lucide-react'
import {MarketplaceShell} from '@/components/marketplace-shell'
import {GuestCard} from '@/components/guest-card'
import {GuestRefresh} from '@/components/guest-refresh'
import {publicClient} from '@/lib/public-client'
import {browseFilters, browseHref, publicRows, publicResults, type PublicRow} from '@/lib/marketplace'
import {consoleLink} from '@/lib/console-link'
export const dynamic='force-dynamic'
export const metadata={title:'Find rural help',alternates:{canonical:'/'}}
function BrowseSection({kind,rows,failed,q}:{kind:'jobs'|'listings';rows:PublicRow[];failed:boolean;q:string}){
 const title=kind==='jobs'?'Open jobs':'Available listings',filters=browseFilters({q}),result=publicResults(rows,filters),href=browseHref('/'+kind,filters)
 return <section className="guest-section" aria-labelledby={kind+'-heading'}>
  <div className="guest-section-heading"><div><h2 id={kind+'-heading'}>{title}</h2><p>{kind==='jobs'?'Work people in your community need done':'Services, grazing, hire and local goods'}</p></div><Link href={href}>View all <ArrowRight size={16} aria-hidden="true"/></Link></div>
  {failed?<div className="guest-empty" role="alert"><h3>Couldn&apos;t load {kind}</h3><p>Check your connection and try again.</p><GuestRefresh label="Retry" className="button secondary"/></div>
  :!result.count?<div className="guest-empty"><h3>{q?'No '+kind+' match “'+q+'”':kind==='jobs'?'No open jobs yet':'Nothing listed yet'}</h3><p>{q?'Try another word or clear your search.':'Check back soon for new '+kind+' from your community.'}</p>{q?<Link href="/" className="public-link">Clear search</Link>:<Link href={href} className="public-link">Refresh {kind}</Link>}</div>
  :<><div className="guest-card-row" tabIndex={0} role="region" aria-label={title+' — scroll to browse'}>{result.rows.slice(0,8).map(row=><GuestCard key={row.id} row={row} kind={kind}/>)}</div><p className="guest-row-hint">{result.count>8?'Showing the latest 8 of '+result.count+' matches. ':''}Scroll to explore · <Link href={href}>View all {kind}</Link></p></>}
 </section>
}
export default async function Home({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
 const {q}=browseFilters(await searchParams)
 const results=await Promise.allSettled([Promise.resolve().then(()=>publicRows(publicClient(),'jobs')),Promise.resolve().then(()=>publicRows(publicClient(),'listings'))])
 return <MarketplaceShell home>
  <header className="guest-intro"><p className="eyebrow">Local help. Rural know-how.</p><div className="guest-intro-title"><h1>Find rural help</h1><Link href="/how-it-works" className="guest-how-link"><CircleHelp size={20} aria-hidden="true"/>How it works</Link></div><p>Find nearby people with the practical skills your property needs — or turn your rural know-how into work in your community.</p><p className="guest-signin-hint">Browse freely. <a href={consoleLink()}>Sign in or sign up</a> to get in touch and manage your work.</p>
   <form className="guest-search" action="/" role="search"><label className="guest-sr-only" htmlFor="guest-search">Search jobs and listings</label><Search size={21} aria-hidden="true"/><input id="guest-search" name="q" defaultValue={q} maxLength={120} placeholder="Search water, fencing, tractor…"/><button className="button primary">Search</button></form>
   {q&&<p className="guest-search-context">Results for “{q}” <Link href="/">Clear search</Link></p>}
  </header>
  <div className="guest-browse-heading"><p>Explore your community</p><GuestRefresh/></div>
  {(['jobs','listings'] as const).map((kind,i)=>{const result=results[i];return <BrowseSection key={kind} kind={kind} q={q} failed={result.status==='rejected'} rows={result.status==='fulfilled'?result.value:[]}/>})}
  <section className="guest-get-started"><div><h2>Have something in mind?</h2><p>Post a job for help, or create a listing to offer a service, grazing, hire or local goods.</p></div><div className="public-actions"><a className="button primary" href={consoleLink('/jobs/new')}>Post a job <ArrowRight size={17} aria-hidden="true"/></a><a className="button secondary" href={consoleLink('/listings/new')}>Create a listing</a></div></section>
 </MarketplaceShell>
}
