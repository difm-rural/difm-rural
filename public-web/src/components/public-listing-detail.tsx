/* eslint-disable @next/next/no-img-element -- Public storage photos are supplied by members. */
import Link from 'next/link'
import {notFound} from 'next/navigation'
import {formatRate,variantDisplay,addOnDisplay,materialsLabel} from '@shared/listingPricing'
import {publicClient} from '@/lib/public-client'
import {publicListingsQuery,UUID} from '@/lib/marketplace'
import {consoleLink} from '@/lib/console-link'
import {MarketplaceShell} from './marketplace-shell'
export async function PublicListingDetail({id}:{id:string}){
 if(!UUID.test(id))notFound()
 const client=publicClient(),{data:s,error}=await publicListingsQuery(client).eq('id',id).maybeSingle()
 if(error)throw new Error('Could not load listing.');if(!s)notFound()
 const {data:provider,error:profileError}=await client.from('profiles_public').select('full_name,bio,region,created_at').eq('id',s.provider_id).maybeSingle()
 const {data:reviews,error:reviewsError}=await client.from('reviews').select('id,rating,comment,created_at').eq('reviewee_id',s.provider_id).eq('reviewee_role','provider').order('created_at',{ascending:false}).limit(20)
 return <MarketplaceShell><Link href="/listings" className="public-link">← Back to listings</Link><p className="eyebrow">{s.category} · {s.kind?.replace('_',' ')}</p><h1>{s.title}</h1><p>{s.location_name || 'Arrange location with the provider'}</p><div className="public-photos">{s.photos?.map((url:string,i:number)=><a key={i} href={url} target="_blank" rel="noopener noreferrer"><img src={url} alt={s.title+' — photo '+(i+1)}/></a>)}</div>
 <article className="public-panel"><h2>Listing details</h2><p className="public-description">{s.description}</p><h3>Pricing</h3><strong>{formatRate(s.pricing_type,s.rate,s.unit_label)}</strong>{s.min_charge!=null&&<p>Minimum charge: ${s.min_charge} NZD</p>}{s.minimum_units>1&&<p>Minimum quantity: {s.minimum_units}</p>}{s.kind==='grazing'&&s.max_units&&<p>Grazing capacity: {s.max_units} head</p>}
 {!!s.pricing_variants?.length&&<><h3>Rate options</h3>{s.pricing_variants.map((v:Parameters<typeof variantDisplay>[0],i:number)=><p key={i}>{variantDisplay(v)}{Number(v.min_charge)>0?' · Minimum charge: $'+v.min_charge+' NZD':''}</p>)}</>}
 {!!s.pricing_add_ons?.length&&<><h3>Extra charges</h3>{s.pricing_add_ons.map((a:Parameters<typeof addOnDisplay>[0],i:number)=><p key={i}>{addOnDisplay(a)}</p>)}<p>Extra charges are separate from the base rate. Agree which apply with the provider.</p></>}
 {s.pricing_terms&&<><h3>Pricing terms</h3><p className="public-description">{s.pricing_terms}</p></>}{s.travel_range_km>0&&<p>Travel range: {s.travel_range_km} km</p>}<p>Availability: {s.availability?.length?s.availability.join(', '):'Arrange with the provider'}</p>{s.materials&&<p>Materials: {materialsLabel(s.materials)}</p>}{s.payment_timing==='upfront'&&<p>The provider asks for payment upfront. Agree the arrangements directly.</p>}<p>Agree the final price, timing and payment directly with the provider. Rural Connections does not handle payments.</p></article>
 <section className="public-panel"><h2>{profileError?'Listing provider':provider?.full_name || 'Listing provider'}</h2>{profileError?<p>Could not load the provider profile. Refresh to try again.</p>:<>{provider?.region&&<p>{provider.region}</p>}{provider?.created_at&&<p>Member since {new Date(provider.created_at).toLocaleDateString('en-NZ',{month:'long',year:'numeric'})}</p>}{provider?.bio&&<p className="public-description">{provider.bio}</p>}</>}
 <h3>Provider reviews</h3>{reviewsError?<p>Could not load reviews. Refresh to try again.</p>:!reviews?.length?<p>No reviews yet.</p>:<><p>Most recent reviews</p>{reviews.map(r=><article key={r.id} className="public-review"><strong>{r.rating} / 5</strong><span> · {new Date(r.created_at).toLocaleDateString('en-NZ')}</span><p className="public-description">{r.comment || 'No written comment.'}</p></article>)}</>}</section>
 <section className="public-panel public-handoff"><h2>Interested in this listing?</h2><p>Sign in to message the person who listed this. You can create an account with your email; no password is needed.</p><a className="button primary" href={consoleLink('/messages?kind=listing&id='+id+'&person='+s.provider_id)}>Sign in to enquire</a>{!['for_sale','lease'].includes(s.kind)&&<><p>{s.pricing_type==='quote_required'?'The provider will send a quote for you to review.':'The provider will review your request. Your booking is confirmed when they accept.'}</p><a className="button secondary" href={consoleLink('/browse/'+id+'/request')}>{s.pricing_type==='quote_required'?'Sign in to request a quote':'Sign in to request a booking'}</a></>}</section>
 </MarketplaceShell>
}
