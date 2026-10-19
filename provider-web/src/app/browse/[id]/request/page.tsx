import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireProvider } from '@/lib/auth'
import { AppShell } from '@/components/app-shell'
import { RequestForm } from './request-form'
import { addOnDisplay } from '@shared/listingPricing'
export default async function RequestPage({params}:{params:Promise<{id:string}>}){
  const {supabase,user,profile}=await requireProvider();const {id}=await params
  const {data:s,error}=await supabase.from('services').select('*').eq('id',id).eq('is_active',true).is('closed_at',null).single()
  if(error || !s || s.provider_id===user.id || ['for_sale','lease'].includes(s.kind))notFound()
  return <AppShell providerName={profile?.full_name || 'Member'}><section className="page work-page"><Link className="card-link" href={'/browse/'+id}>Back to listing</Link><h1>Review your request</h1><h2>{s.title}</h2>
    {s.pricing_terms && <p className="work-description">{s.pricing_terms}</p>}
    {Array.isArray(s.pricing_add_ons) && s.pricing_add_ons.length>0 && <div className="card"><h3>Extra charges — not included in the estimate</h3>{s.pricing_add_ons.map((a:Parameters<typeof addOnDisplay>[0],i:number)=><p key={i}>{a.label}: {addOnDisplay(a)}</p>)}</div>}
    <RequestForm listing={s}/>
  </section></AppShell>
}
