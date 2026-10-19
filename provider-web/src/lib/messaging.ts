export type ConversationKind = 'listing' | 'job' | 'booking'
export type ConversationRef = { kind: ConversationKind; id: string; person: string }
export type ChatMessage = { id: string; sender_id: string; receiver_id: string; content: string; created_at: string; service_id?: string | null; job_id?: string | null; booking_id?: string | null }
export type Notice = { id: string; type: string; body: string; read: boolean; created_at: string; metadata: Record<string, unknown> | null }
export type InboxThread = ConversationRef & { key: string; name: string; title: string; preview: string; updatedAt: string; unread: number }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function validConversation(ref: ConversationRef) {
  return ['listing','job','booking'].includes(ref.kind) && uuid.test(ref.id) && uuid.test(ref.person)
}
export function conversationKey(ref: ConversationRef) { return `${ref.kind}:${ref.id}:${ref.person}` }
export function conversationHref(ref: ConversationRef) {
  return '/messages?kind='+ref.kind+'&id='+encodeURIComponent(ref.id)+'&person='+encodeURIComponent(ref.person)
}
export function matchesConversation(message: ChatMessage, ref: ConversationRef, userId: string) {
  const id=ref.kind==='booking'?message.booking_id:ref.kind==='listing'?message.service_id:message.job_id
  return id===ref.id && ((message.sender_id===userId && message.receiver_id===ref.person) || (message.receiver_id===userId && message.sender_id===ref.person))
}
export function noticeMatchesConversation(notice: Notice, ref: ConversationRef) {
  const m=notice.metadata || {}
  const id=ref.kind==='booking'?m.booking_id:ref.kind==='listing'?m.service_id:m.job_id
  // Booking message metadata can contain service_id too; it is a different thread.
  if(ref.kind==='listing' && (m.booking_id || m.job_id))return false
  return notice.type==='new_message' && id===ref.id && m.sender_id===ref.person
}
export function canReadConversation(visibility:string,focused:boolean,incomingId:string|undefined) {
  return visibility==='visible' && focused && !!incomingId
}
export function attachment(content: string): {type:'text';text:string}|{type:'photo';url:string;caption:string}|{type:'location';text:string;latitude:number|null;longitude:number|null} {
  try {
    const a=JSON.parse(content)
    if(a?.type==='photo' && typeof a.url==='string') {
      const url=new URL(a.url)
      if(url.protocol==='https:')return {type:'photo',url:url.href,caption:typeof a.caption==='string'?a.caption:''}
      return {type:'text',text:'Photo unavailable'}
    }
    if(a?.type==='location') {
      const valid=typeof a.latitude==='number' && typeof a.longitude==='number' && Number.isFinite(a.latitude) && Number.isFinite(a.longitude) && Math.abs(a.latitude)<=90 && Math.abs(a.longitude)<=180
      return {type:'location',text:typeof a.text==='string'?a.text:'Shared location',latitude:valid?a.latitude:null,longitude:valid?a.longitude:null}
    }
  } catch {}
  return {type:'text',text:content}
}
export function chatPreview(content: string) {
  const a=attachment(content)
  return a.type==='photo'?'Photo':a.type==='location'?'Shared location':a.text
}
export function groupInbox(messages: ChatMessage[], userId: string) {
  const map=new Map<string,{ref:ConversationRef;message:ChatMessage}>()
  for(const m of messages) {
    if(m.sender_id!==userId && m.receiver_id!==userId)continue
    const person=m.sender_id===userId?m.receiver_id:m.sender_id
    const kind=m.booking_id?'booking':m.service_id?'listing':'job',id=m.booking_id || m.service_id || m.job_id
    if(!id || !person || person===userId)continue
    const ref={kind,id,person} as ConversationRef,key=conversationKey(ref),old=map.get(key)
    if(!old || m.created_at>old.message.created_at || (m.created_at===old.message.created_at && m.id>old.message.id))map.set(key,{ref,message:m})
  }
  return [...map.values()].sort((a,b)=>b.message.created_at.localeCompare(a.message.created_at))
}
