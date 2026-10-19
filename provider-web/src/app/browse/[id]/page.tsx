import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireProvider } from '@/lib/auth'
import { AppShell } from '@/components/app-shell'
import { formatRate, addOnDisplay, variantDisplay } from '@shared/listingPricing'
import { CardImage } from '../../listings/listing-card'
export default async function ListingPage({params}:{params:Promise<{id:string}>}) {
  const {supabase,user,profile}=await requireProvider();const {id}=await params
  const {data:s,error}=await supabase.from('services').select('*').eq('id',id).single()
  if(error || !s || ((!s.is_active || s.closed_at) && s.provider_id!==user.id))notFound()
  const {data:owner}=await supabase.from('profiles_public').select('full_name,created_at').eq('id',s.provider_id).maybeSingle()
  const own=s.provider_id===user.id
  return <AppShell providerName={profile?.full_name || 'Member'}><section className="page work-page"><Link href="/browse" className="card-link">Back to listings</Link><p className="eyebrow">{s.kind || 'Service'}</p><h1>{s.title}</h1>
    <div className="work-listing-hero"><CardImage photoUrl={s.photos?.[0]} category={s.category} headline={s.card_headline} supporting={s.card_supporting_text} cardStyle={s.card_style}/></div>
    <article className="card work-detail"><p>{s.category} · {s.location_name}</p><strong>{formatRate(s.pricing_type,s.rate,s.unit_label)}</strong><p className="work-description">{s.description}</p>
      {s.min_charge!=null && <p>Minimum charge: ${s.min_charge} NZD</p>}{s.minimum_units>1 && <p>Minimum quantity: {s.minimum_units}</p>}{s.max_units && <p>Grazing capacity: {s.max_units} head</p>}
      {Array.isArray(s.pricing_add_ons) && s.pricing_add_ons.length>0 && <><h2>Extra charges</h2>{s.pricing_add_ons.map((a: Parameters<typeof addOnDisplay>[0],i:number)=><p key={i}>{a.label}: {addOnDisplay(a)}</p>)}<p className="muted">Extras are not included in the base rate. Agree the final price with the provider.</p></>}
      {Array.isArray(s.pricing_variants) && s.pricing_variants.length>0 && <><h2>Rate options</h2>{s.pricing_variants.map((v: Parameters<typeof variantDisplay>[0],i:number)=><p key={i}>{v.label}: {variantDisplay(v)}</p>)}</>}
      {s.pricing_terms && <><h2>Pricing terms</h2><p className="work-description">{s.pricing_terms}</p></>}
      <p>You arrange payment directly with the provider. Rural Connections does not handle payments.</p>
    </article>
    <article className="card"><h2>{owner?.full_name || 'Listing provider'}</h2>{owner?.created_at && <p className="muted">Member since {new Date(owner.created_at).toLocaleDateString('en-NZ',{month:'long',year:'numeric'})}</p>}</article>
    <div className="lform-actions">{own ? <Link className="lform-save" href={'/listings/'+id+'/edit'}>Edit listing</Link> : <><Link className="lform-save" href={'/enquiries?s='+encodeURIComponent(id)+'&c='+encodeURIComponent(s.provider_id)}>Enquire about this listing</Link>{!['for_sale','lease'].includes(s.kind) && <Link className="lform-cancel" href={'/browse/'+id+'/request'}>{s.pricing_type==='quote_required'?'Request a quote':'Request a booking'}</Link>}</>}</div>
  </section></AppShell>
}
