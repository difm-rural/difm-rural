'use server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireProvider } from '@/lib/auth'
import { CATEGORIES } from '@shared/categories'
import type { ActionState } from '@/components/action-form'
import { bookingEstimate } from '@/lib/booking-estimate'

const text = (data: FormData, name: string) => String(data.get(name) || '').trim()
const failed = (): ActionState => ({ error: 'Could not save. Check your connection, refresh this page and try again.' })

export async function postJob(_: ActionState, data: FormData): Promise<ActionState> {
  const { supabase, user } = await requireProvider()
  const title = text(data,'title'), description = text(data,'description'), category = text(data,'category')
  const location = text(data,'location'), area = text(data,'area'), priceType = text(data,'price_type'), price = Number(text(data,'price'))
  if (!title || !description || !location || !area || !CATEGORIES.includes(category)) return { error: 'Add a title, description, category, property location and public area.' }
  if (!['fixed','open'].includes(priceType) || (priceType === 'fixed' && (!text(data,'price') || !Number.isFinite(price) || price <= 0))) return { error: 'Enter a positive budget or choose Open to offers.' }
  const schedule = text(data,'scheduled_date')
  if (schedule && (!/^\d{4}-\d{2}-\d{2}$/.test(schedule) || Number.isNaN(Date.parse(schedule)))) return {error:'Choose a valid date.'}
  const { data: job, error } = await supabase.from('jobs').insert({ requester_id:user.id, title, description, category,
    location_name:location, location_area:area, hide_exact_location:true, price_type:priceType,
    price:priceType === 'fixed' ? price : null, status:'open', schedule_type:schedule ? 'specific' : 'flexible', scheduled_date:schedule || null,
  }).select('id').single()
  if (error || !job) return failed()
  revalidatePath('/')
  redirect('/jobs/' + job.id)
}

export async function sendOffer(_: ActionState, data: FormData): Promise<ActionState> {
  const { supabase, user } = await requireProvider()
  const id = text(data,'job_id'), amount = Number(text(data,'amount')), message = text(data,'message')
  if (!Number.isFinite(amount) || amount <= 0 || !message) return { error:'Add a positive offer amount and a message describing how you can help.' }
  const { data: job, error: jobError } = await supabase.from('jobs_public').select('id,requester_id,status').eq('id',id).single()
  if (jobError || !job || job.status !== 'open' || job.requester_id === user.id) return {error:'This job is no longer accepting your offers. Refresh to see its current status.'}
  const existing = await supabase.from('bids').select('id').eq('job_id',id).eq('provider_id',user.id).in('status',['pending','accepted'])
  if (existing.error) return failed()
  if (existing.data?.length) return {error:'You already have an offer on this job. You can track it in Activity.'}
  const { error } = await supabase.from('bids').insert({job_id:id,provider_id:user.id,amount,message,status:'pending'})
  if (error) return failed()
  revalidatePath('/')
  redirect('/activity')
}

export async function acceptOffer(_: ActionState, data: FormData): Promise<ActionState> {
  const { supabase, user } = await requireProvider()
  const id=text(data,'offer_id')
  const { data: bid, error } = await supabase.from('bids').select('id,job_id').eq('id',id).single()
  if(error || !bid) return failed()
  const {data:job}=await supabase.from('jobs').select('requester_id,status').eq('id',bid.job_id).single()
  if(!job || job.requester_id !== user.id || job.status !== 'open') return {error:'This job is no longer accepting offers.'}
  const result=await supabase.rpc('accept_job_offer',{p_offer_id:id})
  if(result.error) return failed()
  revalidatePath('/')
  redirect('/jobs/'+bid.job_id)
}

export async function requestBooking(_:ActionState,data:FormData):Promise<ActionState>{
  const {supabase,user}=await requireProvider()
  const id=text(data,'service_id'), location=text(data,'location'), quantity=Number(text(data,'quantity'))
  if(!location || !Number.isFinite(quantity) || quantity<=0)return {error:'Add a location and a positive quantity.'}
  const {data:s,error}=await supabase.from('services').select('*').eq('id',id).single()
  if(error || !s || !s.is_active || s.closed_at || s.provider_id===user.id || ['for_sale','lease'].includes(s.kind))return {error:'This listing is unavailable for booking requests. Refresh and try again.'}
  const existing=await supabase.from('bookings').select('id').eq('service_id',id).eq('requester_id',user.id).in('status',['pending','quote_sent','confirmed','in_progress','cancellation_requested'])
  if(existing.error)return failed()
  if(existing.data?.length)return {error:'You already have an active request for this listing. Open Activity to view it.'}
  const estimate=bookingEstimate(s,quantity)
  const {error:saveError}=await supabase.from('bookings').insert({service_id:id,provider_id:s.provider_id,requester_id:user.id,status:'pending',quantity:estimate.quantity,total_amount:estimate.amount ?? 0,payment_timing:s.payment_timing,location_name:location,scheduled_date:text(data,'date') || 'flexible',notes:text(data,'notes') || null})
  if(saveError)return failed()
  revalidatePath('/')
  redirect('/activity')
}

export async function respondBooking(_:ActionState,data:FormData):Promise<ActionState>{
  const {supabase,user}=await requireProvider();const id=text(data,'booking_id'),intent=text(data,'intent')
  const {data:b,error}=await supabase.from('bookings').select('*,service:services(pricing_type)').eq('id',id).single()
  if(error || !b)return failed()
  const provider=b.provider_id===user.id,requester=b.requester_id===user.id
  let patch:Record<string,unknown>={}
  if(provider && b.status==='pending' && intent==='confirm' && b.service?.pricing_type!=='quote_required')patch={status:'confirmed'}
  else if(provider && b.status==='pending' && intent==='quote'){
    const amount=Number(text(data,'amount'));if(!Number.isFinite(amount)||amount<=0)return {error:'Enter a positive quote amount.'}
    patch={status:'quote_sent',quote_amount:amount,quote_notes:text(data,'notes') || null,quote_sent_at:new Date().toISOString()}
  }
  else if(provider && ['pending','quote_sent'].includes(b.status) && intent==='decline')patch={status:'cancelled'}
  else if(provider && b.status==='cancellation_requested' && intent==='cancel')patch={status:'cancelled'}
  else if(requester && b.status==='quote_sent' && intent==='accept')patch={status:'confirmed',quote_accepted_at:new Date().toISOString()}
  else return {error:'This request has changed. Refresh to see its current state.'}
  const result=await supabase.from('bookings').update(patch).eq('id',id).eq('status',b.status).select('id')
  if(result.error || !result.data?.length)return failed()
  revalidatePath('/');revalidatePath('/activity');return {error:''}
}
