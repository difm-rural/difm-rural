import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireProvider } from '@/lib/auth'
import { AppShell } from '@/components/app-shell'
import { loadPublicProfile, allPublicReviews, type PublicReview } from '@/lib/profile-data'
import { availabilityDisplay } from '@shared/providerAvailability'
import { ListingCard } from '../../listings/listing-card'
import { formatRate, LISTING_KINDS } from '@shared/listingPricing'
export default async function PublicProfilePage({params}:{params:Promise<{id:string}>}){
  const {supabase,user,profile}=await requireProvider();const {id}=await params
  const {data:p,error}=await loadPublicProfile(supabase,id)
  if(error)throw new Error('Could not load profile')
  if(!p)notFound()
  let reviews:PublicReview[]=[],reviewError=false
  try{reviews=await allPublicReviews(supabase,id)}catch{reviewError=true}
  const {data:listings,error:listingError}=await supabase.from('services').select('id,title,kind,rate,pricing_type,unit_label,photos,category,card_headline,card_supporting_text,card_style').eq('provider_id',id).eq('is_active',true).is('closed_at',null).order('created_at',{ascending:false})
  const avg=reviews.length?reviews.reduce((s,r)=>s+r.rating,0)/reviews.length:0
  const availability=availabilityDisplay(p.availability_status,p.availability_until,p.availability_updated_at)
  return <AppShell providerName={profile?.full_name || 'Member'}><section className="page work-page"><Link href={user.id===id?'/account':'/browse'} className="card-link">{user.id===id?'Back to Account':'Browse listings'}</Link>
    <article className="card account-summary">{p.avatar_url?<img className="account-avatar" src={p.avatar_url} alt={p.full_name || 'Profile photo'}/>:<span className="account-avatar account-initial">{(p.full_name || p.display_name || '?').slice(0,1)}</span>}<div><p className="eyebrow">Public profile</p><h1>{p.full_name || p.display_name || 'Community member'}</h1><p>{p.region || 'Region not provided'}</p><p className="muted">Member since {new Date(p.created_at).toLocaleDateString('en-NZ',{month:'long',year:'numeric'})}</p><Link className="card-link" href={'/people/'+id+'/reviews'}>{reviewError?'View reviews':reviews.length?'★ '+avg.toFixed(1)+' · '+reviews.length+' reviews':'No reviews yet · View reviews'}</Link></div></article>
    {!availability.stale && <p className="account-current">{availability.label}</p>}
    {p.bio && <section className="card"><h2>About</h2><p className="work-description">{p.bio}</p></section>}
    {p.skills?.length>0 && <section className="card"><h2>What I can help with</h2><ul className="profile-tags">{p.skills.map((s:string)=><li key={s}>{s}</li>)}</ul></section>}
    {p.qualifications?.length>0 && <section className="card"><h2>Qualifications & licences</h2><ul>{p.qualifications.map((q:string,i:number)=><li key={i}>{q}</li>)}</ul><p className="muted">Information shared by this member.</p></section>}
    <section><h2>Live listings</h2>{listingError?<p role="alert">Could not load this member&apos;s listings. Refresh to try again.</p>:!listings?.length?<p className="muted">No live listings at the moment.</p>:<div className="work-grid">{listings.map(s=><Link href={'/browse/'+s.id} key={s.id}><ListingCard data={{title:s.title,photoUrl:s.photos?.[0],category:s.category,cardHeadline:s.card_headline,cardSupporting:s.card_supporting_text,cardStyle:s.card_style,priceLabel:formatRate(s.pricing_type,s.rate,s.unit_label),kindLabel:LISTING_KINDS.find(k=>k.id===s.kind)?.label}}/></Link>)}</div>}</section>
  </section></AppShell>
}
