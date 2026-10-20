import Link from 'next/link'
import {requireProvider} from '@/lib/auth'
import {ListingCard} from '../listings/listing-card'
import {formatRate,LISTING_KINDS} from '@shared/listingPricing'
export async function ConnectionListings({providerId}:{providerId:string}){
 const {supabase}=await requireProvider(),{data:rows,error}=await supabase.from('services').select('id,title,category,kind,photos,rate,pricing_type,unit_label,card_headline,card_supporting_text,card_style').eq('provider_id',providerId).eq('is_active',true).is('closed_at',null).order('created_at',{ascending:false}).limit(6)
 return <section><h2>Latest live listings</h2>{error?<p role="alert">Could not load live listings. Refresh to try again.</p>:!rows?.length?<p className="muted">This person has no live listings right now.</p>:<><div className="work-grid">{rows.map(r=><Link href={'/browse/'+r.id} key={r.id}><ListingCard data={{title:r.title,category:r.category,photoUrl:r.photos?.[0],priceLabel:formatRate(r.pricing_type,r.rate,r.unit_label),kindLabel:LISTING_KINDS.find(k=>k.id===r.kind)?.label,cardHeadline:r.card_headline,cardSupporting:r.card_supporting_text,cardStyle:r.card_style}}/></Link>)}</div><p><Link href={'/people/'+providerId} className="card-link">View full profile & all live listings →</Link></p></>}</section>
}
