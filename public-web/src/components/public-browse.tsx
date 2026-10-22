/* eslint-disable @next/next/no-img-element -- Public storage photos are supplied by members. */
import Link from 'next/link'
import {CATEGORIES} from '@shared/categories'
import {formatRate,LISTING_KINDS} from '@shared/listingPricing'
import {publicClient} from '@/lib/public-client'
import {browseFilters,browseHref,publicRows,publicResults} from '@/lib/marketplace'
import {MarketplaceShell} from './marketplace-shell'
export async function PublicBrowse({kind,params}:{kind:'jobs'|'listings';params:Record<string,string|undefined>}){
 const listings=kind==='listings',f={...browseFilters(params),...(!listings?{kind:''}:{})},path='/'+kind
 let rows:Awaited<ReturnType<typeof publicRows>>=[],failed=false
 try{rows=await publicRows(publicClient(),kind)}catch{failed=true}
 const result=publicResults(rows,f)
 return <MarketplaceShell><p className="eyebrow">Explore Rural Connections</p><h1>{listings?'Browse listings':'Find local work'}</h1><p>{listings?'Services, grazing, hire and local goods.':'Open jobs from people in your community.'} Browse freely. Sign in when you want to get in touch.</p>
 <form className="public-search" action={path}><label>Search<input name="q" defaultValue={f.q} maxLength={120} placeholder={listings?'e.g. water delivery or grazing':'e.g. fencing or Cambridge'}/></label><label>Category<select name="category" defaultValue={f.category}><option value="">All categories</option>{CATEGORIES.map(c=><option key={c}>{c}</option>)}</select></label>{listings&&<label>Listing type<select name="kind" defaultValue={f.kind}><option value="">All listings</option>{LISTING_KINDS.map(k=><option key={k.id} value={k.id}>{k.label}</option>)}</select></label>}<button className="button primary">Search</button><Link href={path}>Clear search</Link></form>
 {failed?<section className="public-panel" role="alert"><h2>Couldn&apos;t load {kind}</h2><p>Check your connection and try again.</p><Link className="button secondary" href={browseHref(path,f)}>Retry</Link></section>:<><p className="muted">{result.count} matching {result.count===1?(listings?'listing':'job'):kind}</p>{!result.count?<section className="public-panel"><h2>{f.q?'No '+kind+' match “'+f.q+'”':f.category||f.kind?'No '+kind+' match these options':listings?'Nothing listed yet':'No open jobs yet'}</h2><p>{f.q||f.category||f.kind?'Try another word or clear your search.':'Check back soon for new '+kind+' from the community.'}</p><Link href={path}>Clear search & refresh</Link></section>:<div className="service-grid public-grid">{result.rows.map(row=><Link className="service-card" href={path+'/'+row.id} key={row.id}>{row.photos?.[0]&&<img className="public-card-photo" src={row.photos[0]} alt=""/>}<div className="service-body"><span className="eyebrow">{row.category}</span><h2>{row.title}</h2><p className="public-clamp">{row.description}</p><p>{listings?row.location_name:row.location_area || 'Location to be arranged'}</p><strong>{listings?formatRate(row.pricing_type || '',row.rate,row.unit_label):row.price_type==='fixed'&&row.price!=null?'Budget: $'+row.price+'':'Open to offers'}</strong><p className="public-link">View {listings?'listing':'job'} →</p></div></Link>)}</div>}
 {result.pages>1&&<nav className="public-actions" aria-label="Result pages">{result.page>1&&<Link className="button secondary" href={browseHref(path,{...f,page:result.page-1})}>Previous</Link>}<span>Page {result.page} of {result.pages}</span>{result.page<result.pages&&<Link className="button secondary" href={browseHref(path,{...f,page:result.page+1})}>Next</Link>}</nav>}</>}
 </MarketplaceShell>
}
