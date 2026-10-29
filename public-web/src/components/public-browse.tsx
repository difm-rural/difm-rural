import {GuestCard} from './guest-card'
import Link from 'next/link'
import {CATEGORIES} from '@shared/categories'
import {LISTING_KINDS} from '@shared/listingPricing'
import {publicClient} from '@/lib/public-client'
import {browseFilters,browseHref,publicRows,publicResults} from '@/lib/marketplace'
import {NearbyControls} from './nearby-controls'
import {guestLocation} from '@/lib/guest-location'
import {MarketplaceShell} from './marketplace-shell'
export async function PublicBrowse({kind,params}:{kind:'jobs'|'listings';params:Record<string,string|undefined>}){
 const listings=kind==='listings',f={...browseFilters(params),...(!listings?{kind:''}:{})},path='/'+kind,location=await guestLocation(),radius=location.point?location.radius:null
 let rows:Awaited<ReturnType<typeof publicRows>>=[],failed=false
 try{rows=await publicRows(publicClient(),kind,radius!==null?location.point:null)}catch{failed=true}
 const result=publicResults(rows,f,radius)
 return <MarketplaceShell><p className="eyebrow">Explore Rural Connections</p><h1>{listings?'Browse listings':'Find local work'}</h1><p>{listings?'Services, grazing, hire and local goods.':'Open jobs from people in your community.'} Browse freely. Sign in when you want to get in touch.</p>
 <NearbyControls location={location}/>
 <form className="public-search" action={path}><label>Search<input name="q" defaultValue={f.q} maxLength={120} placeholder={listings?'e.g. water delivery or grazing':'e.g. fencing or Cambridge'}/></label><label>Category<select name="category" defaultValue={f.category}><option value="">All categories</option>{CATEGORIES.map(c=><option key={c}>{c}</option>)}</select></label>{listings&&<label>Listing type<select name="kind" defaultValue={f.kind}><option value="">All listings</option>{LISTING_KINDS.map(k=><option key={k.id} value={k.id}>{k.label}</option>)}</select></label>}<button className="button primary">Search</button><Link href={path}>Clear search</Link></form>
 {failed?<section className="public-panel" role="alert"><h2>Couldn&apos;t load {kind}</h2><p>Check your connection and try again.</p><Link className="button secondary" href={browseHref(path,f)}>Retry</Link></section>:<><p className="muted">{result.count} matching {result.count===1?(listings?'listing':'job'):kind}</p>{!result.count?<section className="public-panel"><h2>{f.q?'No '+kind+' match “'+f.q+'”':radius!==null?'No '+kind+' within '+radius+' km':f.category||f.kind?'No '+kind+' match these options':listings?'Nothing listed yet':'No open jobs yet'}</h2><p>{radius!==null?'Try a wider distance or select All New Zealand above.':f.q||f.category||f.kind?'Try another word or clear your search.':'Check back soon for new '+kind+' from the community.'}</p><Link href={path}>Clear search & refresh</Link></section>:<div className="service-grid public-grid">{result.rows.map(row=><GuestCard key={row.id} row={row} kind={kind}/>)}</div>}
 {radius!==null&&result.unlocated>0&&<p className="muted">{result.unlocated} {kind} whose public area could not be located can be found under All New Zealand.</p>}
 {result.pages>1&&<nav className="public-actions" aria-label="Result pages">{result.page>1&&<Link className="button secondary" href={browseHref(path,{...f,page:result.page-1})}>Previous</Link>}<span>Page {result.page} of {result.pages}</span>{result.page<result.pages&&<Link className="button secondary" href={browseHref(path,{...f,page:result.page+1})}>Next</Link>}</nav>}</>}
 </MarketplaceShell>
}
