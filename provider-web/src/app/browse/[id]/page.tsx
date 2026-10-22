import Link from 'next/link'
import {notFound} from 'next/navigation'
import {requireProvider} from '@/lib/auth'
import {AppShell} from '@/components/app-shell'
import {PhotoGallery} from '@/components/photo-gallery'
import {formatRate,addOnDisplay,variantDisplay,materialsLabel} from '@shared/listingPricing'
import {allPublicReviews} from '@/lib/profile-data'
import {paymentCopy} from '@/lib/booking-detail'
import {statusLabel} from '@/lib/work'
import {ListingRequestPanel} from './request-panel'
export default async function ListingPage({params}:{params:Promise<{id:string}>}){
 const {id}=await params,{supabase,user,profile}=await requireProvider('/browse/'+id)
 const {data:s,error}=await supabase.from('services').select('*').eq('id',id).maybeSingle()
 if(error)throw new Error('Could not load this listing.');if(!s||((!s.is_active||s.closed_at)&&s.provider_id!==user.id))notFound()
 const own=s.provider_id===user.id
 const [{data:owner,error:ownerError},bookings]=await Promise.all([supabase.from('profiles_public').select('full_name,created_at').eq('id',s.provider_id).maybeSingle(),supabase.from('bookings').select('id,status,created_at').eq('service_id',id).eq(own?'provider_id':'requester_id',user.id).order('created_at',{ascending:false})])
 let reviews:{rating:number;reviewee_role:string}[]=[],reviewError=false
 try{reviews=(await allPublicReviews(supabase,s.provider_id)).filter(r=>r.reviewee_role==='provider')}catch{reviewError=true}
 const average=reviews.length?reviews.reduce((sum,r)=>sum+r.rating,0)/reviews.length:0
 const active=bookings.data?.filter(b=>['pending','quote_sent','confirmed','in_progress','cancellation_requested'].includes(b.status)) || []
 return <AppShell providerName={profile?.full_name || 'Member'}><section className="page work-page"><Link href="/browse" className="card-link">Back to listings</Link><p className="eyebrow">{({service:'Service',grazing:'Grazing',hire:'Gear for hire',lease:'Space to lease',for_sale:'For sale'} as Record<string,string>)[s.kind] || 'Listing'}{own?' · Your listing':''}</p><h1>{s.title}</h1>
 {s.photos?.length?<PhotoGallery photos={s.photos} title={s.title}/>:<div className="card"><p className="muted">No photos provided.</p></div>}
 {own&&<p className="account-current">{s.closed_at?'Closed':s.is_active?'Live listing':'Paused listing'} · Manage your listing from My listings.</p>}
 <article className="card work-detail"><h2>Listing details</h2><p>{s.category} · {s.location_name || 'Location to be arranged'}</p><strong>{formatRate(s.pricing_type,s.rate,s.unit_label)}</strong><p className="work-description">{s.description}</p>
 {s.latitude!=null&&s.longitude!=null&&<a className="card-link" href={'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(s.latitude+','+s.longitude)} target="_blank" rel="noopener noreferrer">Open listing location in Maps</a>}
 {s.materials&&<p>Materials: {materialsLabel(s.materials)}</p>}{s.travel_range_km>0&&<p>Travel range: {s.travel_range_km} km</p>}<p>Availability: {s.availability?.length?s.availability.join(', '):'Arrange with the provider'}</p>
 {s.min_charge!=null&&<p>Minimum charge: ${s.min_charge}</p>}{s.minimum_units>1&&<p>Minimum quantity: {s.minimum_units}</p>}{s.kind==='grazing'&&s.max_units&&<p>Grazing capacity: {s.max_units} head</p>}
 {!!s.pricing_variants?.length&&<section><h3>Rate options</h3>{s.pricing_variants.map((v:Parameters<typeof variantDisplay>[0],i:number)=><p key={i}>{variantDisplay(v)}{Number(v.min_charge)>0?' · Minimum charge: $'+v.min_charge+'':''}</p>)}</section>}
 {!!s.pricing_add_ons?.length&&<section><h3>Extra charges</h3>{s.pricing_add_ons.map((a:Parameters<typeof addOnDisplay>[0],i:number)=><p key={i}>{addOnDisplay(a)}</p>)}<p className="muted">These charges are not included in the base estimate. Agree which apply with the provider.</p></section>}
 {s.pricing_terms&&<section><h3>Pricing terms</h3><p className="work-description">{s.pricing_terms}</p></section>}<p>{paymentCopy(s)}</p></article>
 <article className="card"><h2>{ownerError?'Provider profile unavailable':<Link href={'/people/'+s.provider_id}>{owner?.full_name || 'Listing provider'}</Link>}</h2>{owner?.created_at&&<p className="muted">Member since {new Date(owner.created_at).toLocaleDateString('en-NZ',{month:'long',year:'numeric'})}</p>}<Link href={'/people/'+s.provider_id+'/reviews?role=provider'} className="card-link">{reviewError?'Read reviews and comments':reviews.length?'★ '+average.toFixed(1)+' · '+reviews.length+' reviews — read comments':'No reviews yet — view profile'}</Link></article>
 {bookings.error?<p role="alert" className="card">Could not check your existing requests. Refresh before sending another request.</p>:bookings.data?.length? <section className="card"><h2>{own?'Bookings for this listing':'Your requests for this listing'}</h2>{bookings.data.map(b=><p key={b.id}><Link href={'/activity/booking/'+b.id+'/manage'} className="card-link">{statusLabel(b.status)} · {new Date(b.created_at).toLocaleDateString('en-NZ')} — View details</Link></p>)}</section>:null}
 {own?<div className="lform-actions"><Link className="lform-save" href={'/listings/'+id+'/edit'}>Edit listing</Link><Link className="lform-cancel" href="/listings">Manage My listings</Link></div>:<><Link className="lform-cancel" href={'/messages?kind=listing&id='+id+'&person='+s.provider_id}>Enquire about this listing</Link>{!['for_sale','lease'].includes(s.kind)&&!active.length&&!bookings.error&&<ListingRequestPanel listing={s}/>}</>}
 </section></AppShell>
}
