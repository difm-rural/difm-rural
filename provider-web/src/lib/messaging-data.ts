import type { SupabaseClient } from '@supabase/supabase-js'
import { groupInbox, chatPreview, conversationKey, noticeMatchesConversation, validConversation, type ChatMessage, type ConversationRef, type InboxThread, type Notice } from './messaging'

async function readMessages(client: SupabaseClient, table: string, userId: string, ref?: ConversationRef) {
  const rows: ChatMessage[]=[]
  for(let offset=0;;offset+=500){
    let q=client.from(table).select('*').or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
    if(ref)q=q.eq(ref.kind==='booking'?'booking_id':ref.kind==='listing'?'service_id':'job_id',ref.id)
      .or(`and(sender_id.eq.${userId},receiver_id.eq.${ref.person}),and(sender_id.eq.${ref.person},receiver_id.eq.${userId})`)
    const {data,error}=await q.order('created_at',{ascending:false}).order('id',{ascending:false}).range(offset,offset+499)
    if(error)throw error
    rows.push(...(data || []));if(!data || data.length<500)return rows
  }
}
async function subjects(client:SupabaseClient,table:string,columns:string,ids:string[]){
  const unique=[...new Set(ids.filter(Boolean))], rows:Record<string,unknown>[]=[]
  for(let i=0;i<unique.length;i+=100){
    const {data,error}=await client.from(table).select(columns).in('id',unique.slice(i,i+100))
    if(error)throw error
    rows.push(...((data || []) as unknown as Record<string,unknown>[]))
  }
  return new Map(rows.map(r=>[String(r.id),r]))
}
export async function loadInbox(client:SupabaseClient,userId:string,notices:Notice[]):Promise<InboxThread[]>{
  const messages=await Promise.all([readMessages(client,'messages',userId),readMessages(client,'service_booking_messages',userId)])
  const threads=groupInbox(messages.flat(),userId)
  const [people,jobs,bookings]=await Promise.all([
    subjects(client,'profiles_public','id,full_name,display_name',threads.map(t=>t.ref.person)),
    subjects(client,'jobs_public','id,title',threads.filter(t=>t.ref.kind==='job').map(t=>t.ref.id)),
    subjects(client,'bookings','id,service_id',threads.filter(t=>t.ref.kind==='booking').map(t=>t.ref.id)),
  ])
  const listings=await subjects(client,'services','id,title',[...threads.filter(t=>t.ref.kind==='listing').map(t=>t.ref.id),...[...bookings.values()].map(b=>String(b.service_id))])
  return threads.map(({ref,message})=>({ ...ref,key:conversationKey(ref),
    name:String(people.get(ref.person)?.full_name || people.get(ref.person)?.display_name || 'Community member'),
    title:String((ref.kind==='job'?jobs.get(ref.id)?.title:listings.get(ref.kind==='booking'?String(bookings.get(ref.id)?.service_id):ref.id)?.title) || (ref.kind==='listing'?'Listing enquiry':ref.kind==='job'?'Job':'Booking')),
    preview:(message.sender_id===userId?'You: ':'')+chatPreview(message.content),updatedAt:message.created_at,
    unread:notices.filter(n=>!n.read && noticeMatchesConversation(n,ref)).length,
  }))
}
export type ConversationContext = ConversationRef & {title:string;name:string;closed:boolean;userId:string;messages:ChatMessage[]}
export async function loadConversation(client:SupabaseClient,userId:string,ref:ConversationRef):Promise<ConversationContext|null>{
  if(!validConversation(ref) || userId===ref.person)return null
  const messages=await readMessages(client,ref.kind==='booking'?'service_booking_messages':'messages',userId,ref)
  let title='',closed=false
  if(ref.kind==='listing'){
    const {data:s,error}=await client.from('services').select('id,title,provider_id,is_active,closed_at').eq('id',ref.id).maybeSingle()
    if(error)throw error
    if(!messages.length && (!s || !s.is_active || s.closed_at || ![userId,ref.person].includes(s.provider_id)))return null
    // Only the owner and an enquirer may start a fresh thread.
    if(!messages.length && s?.provider_id!==ref.person)return null
    title=s?.title || 'Listing enquiry'
  }else if(ref.kind==='booking'){
    const {data:b,error}=await client.from('bookings').select('requester_id,provider_id,status,service:services(title)').eq('id',ref.id).maybeSingle()
    if(error)throw error
    if(!b || ![b.requester_id,b.provider_id].includes(userId) || (userId===b.requester_id?b.provider_id:b.requester_id)!==ref.person)return null
    title=(b.service as unknown as {title?:string})?.title || 'Booking'
    closed=['completed','cancelled','withdrawn','declined'].includes(b.status)
  }else{
    const [{data:j,error},{data:b,error:bidError}]=await Promise.all([
      client.from('jobs_public').select('title,requester_id,status').eq('id',ref.id).maybeSingle(),
      client.from('bids').select('provider_id').eq('job_id',ref.id).eq('status','accepted').maybeSingle(),
    ])
    if(error || bidError)throw error || bidError
    const expected=j && b && (j.requester_id===userId?b.provider_id:b.provider_id===userId?j.requester_id:null)
    if(!j || expected!==ref.person){if(!messages.length)return null;closed=true}
    else closed=['completed','cancelled'].includes(j.status)
    title=j?.title || 'Job'
  }
  const {data:p,error}=await client.from('profiles_public').select('full_name,display_name').eq('id',ref.person).maybeSingle()
  if(error)throw error
  return {...ref,title,name:p?.full_name || p?.display_name || 'Community member',closed,userId,messages:messages.reverse()}
}
export async function unreadNotices(client:SupabaseClient,userId:string){
  const rows:Notice[]=[]
  for(let offset=0;;offset+=500){
    const {data,error}=await client.from('notifications').select('id,type,body,metadata,read,created_at').eq('user_id',userId).eq('read',false).order('created_at',{ascending:false}).order('id',{ascending:false}).range(offset,offset+499)
    if(error)throw error
    rows.push(...(data || []));if(!data || data.length<500)return rows
  }
}
