'use server'
import { requireProvider } from '@/lib/auth'
import { loadConversation } from '@/lib/messaging-data'
import { attachment, noticeMatchesConversation, type ConversationRef, type ChatMessage, type Notice } from '@/lib/messaging'

export async function sendChatMessage(ref:ConversationRef,content:string,id:string):Promise<{message?:ChatMessage;error?:string}>{
  const {supabase,user}=await requireProvider()
  try{
    const context=await loadConversation(supabase,user.id,ref)
    if(!context)return {error:'This conversation is unavailable. Refresh to see its current state.'}
    if(!/^[0-9a-f-]{36}$/i.test(id) || !content.trim() || content.length>10000)return {error:'Add a message of up to 1,000 characters.'}
    const parsed=attachment(content)
    if(parsed.type==='photo'){
      const root=process.env.NEXT_PUBLIC_SUPABASE_URL+'/storage/v1/object/public/job-photos/'+ref.id+'/'+user.id+'/'
      if(!parsed.url.startsWith(root))return {error:'Please choose a photo to upload again.'}
    }else if(parsed.type==='location'){
      if(parsed.latitude===null || parsed.longitude===null)return {error:'The location could not be read. Please choose Share location again.'}
    }else if(content.trim().length>1000)return {error:'Keep your message to 1,000 characters or fewer.'}
    const table=ref.kind==='booking'?'service_booking_messages':'messages'
    const {data:existing,error:existingError}=await supabase.from(table).select('*').eq('id',id).eq('sender_id',user.id).maybeSingle()
    if(existingError)throw existingError
    if(existing){
      if(existing.receiver_id!==ref.person || existing.content!==content || existing[ref.kind==='booking'?'booking_id':ref.kind==='listing'?'service_id':'job_id']!==ref.id)return {error:'This send attempt has changed. Refresh and try again.'}
      return {message:existing as ChatMessage}
    }
    if(context.closed)return {error:'This arrangement has ended, so the conversation is read-only.'}
    const {data,error}=await supabase.from(table).insert({id,[ref.kind==='booking'?'booking_id':ref.kind==='listing'?'service_id':'job_id']:ref.id,sender_id:user.id,receiver_id:ref.person,content:content.trim()}).select('*').single()
    if(error)throw error
    return {message:data as ChatMessage}
  }catch{return {error:'Your message could not be sent. Check your connection and try again. Your draft has been kept.'}}
}

export async function readConversation(ref:ConversationRef,messageId:string){
  const {supabase,user}=await requireProvider()
  const context=await loadConversation(supabase,user.id,ref)
  if(!context)return {error:'This conversation is unavailable.'}
  const latest=context.messages.find(m=>m.id===messageId && m.sender_id===ref.person && m.receiver_id===user.id)
  if(!latest)return {error:'Refresh the conversation before marking it read.'}
  // Read only notifications represented by the messages actually displayed.
  const {data,error}=await supabase.from('notifications').select('id,type,body,metadata,read,created_at')
    .eq('user_id',user.id).eq('read',false).eq('type','new_message')
    .eq('metadata->>sender_id',ref.person)
    .eq(ref.kind==='booking'?'metadata->>booking_id':ref.kind==='listing'?'metadata->>service_id':'metadata->>job_id',ref.id)
    .lte('created_at',latest.created_at)
  if(error)return {error:'Could not update the read status. Refresh to try again.'}
  const ids=(data || []).filter(n=>noticeMatchesConversation(n as Notice,ref)).map(n=>n.id)
  if(ids.length){const result=await supabase.from('notifications').update({read:true}).eq('user_id',user.id).in('id',ids);if(result.error)return {error:'Could not update the read status.'}}
  return {error:null}
}
