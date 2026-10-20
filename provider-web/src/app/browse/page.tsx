import Link from 'next/link'
import {AppShell} from '@/components/app-shell'
import {requireProvider} from '@/lib/auth'
import {ListingCard} from '../listings/listing-card'
import {formatRate,LISTING_KINDS} from '@shared/listingPricing'
import {DiscoverySearch} from '@/components/discovery-search'
import {discoveryFilters,discover,discoveryHref,coordinates} from '@/lib/discovery'
import {loadDiscoveryListings} from '@/lib/discovery-data'
import {browsingOrigin} from '@/lib/browsing-origin'
export const dynamic='force-dynamic'
export default async function BrowsePage({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
 const {supabase,user,profile}=await requireProvider('/browse'),f=discoveryFilters(await searchParams)
 let rows:Awaited<ReturnType<typeof loadDiscoveryListings>>=[],origin=null as ReturnType<typeof coordinates>,label='your private profile location',error=false
 const [listings,location]=await Promise.allSettled([loadDiscoveryListings(supabase),browsingOrigin(supabase,user.id)])
 if(listings.status==='fulfilled')rows=listings.value;else error=true
 if(location.status==='fulfilled'){origin=location.value.point;label=location.value.label}
 const result=discover(rows,f,origin),needsLocation=(f.sort==='nearest'||!!f.radius)&&!origin,href=(page:number)=>discoveryHref('/browse',{...f,page})
 return <AppShell providerName={profile?.full_name || 'Member'}><section className="page work-page"><header className="home-heading"><div><p className="eyebrow">Listings</p><h1>Browse listings</h1><p className="muted">Services, grazing, hire and local goods</p></div><Link href="/listings" className="lform-cancel">My listings</Link></header><DiscoverySearch filters={f} listings hasLocation={!!origin} locationLabel={label}/>
 {error?<div className="card" role="alert"><h2>Couldn&apos;t load listings</h2><p>Check your connection and try again.</p><Link href={href(f.page)} className="card-link">Retry</Link></div>:needsLocation?<div className="card"><h2>Choose a browsing location</h2><p>Use current location in Search options or add a private GPS location in Profile. Any distance with Newest first includes listings without pins.</p><Link href="/account/profile" className="card-link">Open Profile</Link></div>:<>
 <p className="muted">{result.count} matching listing{result.count===1?'':'s'}</p>{!result.count?<div className="home-empty"><h2>{f.q?'No listings match “'+f.q+'”':f.category||f.kind||f.radius?'No listings match these options':'Nothing listed yet'}</h2><p>Try another word or clear the search options.</p><Link href="/browse" className="card-link">Clear search & options</Link></div>:<div className="work-grid">{result.rows.map(s=><Link key={s.id} href={'/browse/'+s.id}><ListingCard data={{title:s.title,photoUrl:s.photos?.[0],category:s.category,cardHeadline:s.card_headline,cardSupporting:s.card_supporting_text,cardStyle:s.card_style,priceLabel:formatRate(s.pricing_type,s.rate,s.unit_label),kindLabel:LISTING_KINDS.find(k=>k.id===s.kind)?.label}} footer={<p className="work-card-location">{s.location_name || 'Location to be arranged'}{s.distance!==null?' · About '+s.distance.toFixed(1)+' km':''}</p>}/></Link>)}</div>}
 {result.pages>1&&<nav className="lform-actions" aria-label="Listing result pages">{result.page>1&&<Link href={href(result.page-1)} className="lform-cancel">Previous</Link>}<span>Page {result.page} of {result.pages}</span>{result.page<result.pages&&<Link href={href(result.page+1)} className="lform-cancel">Next</Link>}</nav>}
 </>}
 </section></AppShell>
}
