import Link from '@/components/navigation-link'
import {notFound} from 'next/navigation'
import {requireProvider} from '@/lib/auth'
import {AppShell} from '@/components/app-shell'
import {RequestForm} from './request-form'
import {addOnDisplay} from '@shared/listingPricing'
import {selectedRate} from '@/lib/booking-detail'
import {listingAvailability, ESTIMATED_TIMING_NOTE, PAUSED_REQUEST_MESSAGE} from '@shared/listingAvailability'
import {bookingQuantityLimits} from '@shared/bookingQuantity'
export default async function RequestPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{quantity?:string;variant?:string}>}){
 const {id}=await params,{quantity,variant=''}=await searchParams
 const query=new URLSearchParams({variant});if(quantity)query.set('quantity',quantity)
 const {supabase,user,profile}=await requireProvider('/browse/'+id+'/request?'+query)
 const {data:s,error}=await supabase.from('services_public').select('*').eq('id',id).eq('is_active',true).is('closed_at',null).maybeSingle()
 if(error)throw new Error('Could not load listing pricing.');if(!s||s.provider_id===user.id||['for_sale','lease'].includes(s.kind))notFound()
 const {data:active,error:activeError}=await supabase.from('bookings').select('id,status').eq('service_id',id).eq('requester_id',user.id).in('status',['pending','quote_sent','confirmed','in_progress','cancellation_requested'])
 const availability=listingAvailability(s)
 let index=variant,invalid=false
 try{selectedRate(s,index)}catch{index='';invalid=true}
 const requested=Number(quantity),limits=bookingQuantityLimits(selectedRate(s,index).rate),initialQuantity=Number.isFinite(requested)?requested:limits.minimum
 return <AppShell providerName={profile?.full_name || 'Member'}><section className="page work-page"><Link className="card-link" href={'/browse/'+id}>Back to listing</Link><h1>Review your request</h1><h2>{s.title}</h2>
 {activeError?<p role="alert">Could not check your existing requests. Refresh before sending another request.</p>:active?.length?<div className="card"><h2>You already have an active request</h2>{active.map(b=><p key={b.id}><Link href={'/activity/booking/'+b.id+'/manage'} className="card-link">View your request →</Link></p>)}</div>:availability.paused?<p role="status">{PAUSED_REQUEST_MESSAGE}</p>:<>
 {availability.lead&&<p><strong>{availability.lead}</strong>{availability.estimate&&<>. {ESTIMATED_TIMING_NOTE}</>}</p>}
 {invalid&&<p role="alert">That rate option is unavailable. Review the standard rate or choose another option below.</p>}
 {s.pricing_terms&&<section className="card"><h3>Pricing terms</h3><p className="work-description">{s.pricing_terms}</p></section>}
 {!!s.pricing_add_ons?.length&&<section className="card"><h3>Extra charges — not included in the estimate</h3>{s.pricing_add_ons.map((a:Parameters<typeof addOnDisplay>[0],i:number)=><p key={i}>{addOnDisplay(a)}</p>)}</section>}
 <RequestForm listing={s} requestId={crypto.randomUUID()} initialVariant={index} initialQuantity={initialQuantity}/>
 </>}
 </section></AppShell>
}
