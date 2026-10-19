import Link from 'next/link'
import { AppShell } from '@/components/app-shell'
import { requireProvider } from '@/lib/auth'
import { ListingCard } from '../listings/listing-card'
import { formatRate, LISTING_KINDS } from '@shared/listingPricing'
export const dynamic='force-dynamic'
export default async function BrowsePage({searchParams}:{searchParams:Promise<{q?:string}>}){
  const {supabase,profile}=await requireProvider();const {q=''}=await searchParams
  let query=supabase.from('services').select('id,title,kind,rate,pricing_type,unit_label,category,location_name,photos,card_headline,card_supporting_text,card_style').eq('is_active',true).is('closed_at',null).order('created_at',{ascending:false}).limit(60)
  if(q.trim())query=query.ilike('title','%'+q.trim().replace(/[\\%_]/g,'\\$&')+'%')
  const {data,error}=await query
  return <AppShell providerName={profile?.full_name || 'Member'}><section className="page"><header className="home-heading"><div><p className="eyebrow">Listings</p><h1>Browse listings</h1><p className="muted">Services, grazing, hire and local goods</p></div><Link href="/listings" className="lform-cancel">My listings</Link></header>
    <form className="work-search"><label htmlFor="listing-search">Search listings</label><div><input id="listing-search" name="q" defaultValue={q} placeholder="e.g. tractor or grazing"/><button className="lform-save">Search</button>{q && <Link href="/browse" className="card-link">Clear search</Link>}</div></form>
    {error ? <div className="card" role="alert"><h2>Couldn&apos;t load listings</h2><p>Check your connection and try again.</p><Link className="card-link" href={'/browse?q='+encodeURIComponent(q)}>Retry</Link></div>
    : !data?.length ? <div className="home-empty"><h2>{q?'No listings match “'+q+'”':'Nothing listed yet'}</h2><p>{q?'Try another word or clear your search.':'Check back soon for local listings.'}</p></div>
    : <div className="work-grid">{data.map(s=><Link key={s.id} href={'/browse/'+s.id}><ListingCard data={{title:s.title,photoUrl:s.photos?.[0],category:s.category,cardHeadline:s.card_headline,cardSupporting:s.card_supporting_text,cardStyle:s.card_style,priceLabel:formatRate(s.pricing_type,s.rate,s.unit_label),kindLabel:LISTING_KINDS.find(k=>k.id===s.kind)?.label}} footer={<p className="work-card-location">{s.location_name || 'Location to be arranged'}</p>}/></Link>)}</div>}
  </section></AppShell>
}
