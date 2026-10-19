import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireProvider } from '@/lib/auth'
import { AppShell } from '@/components/app-shell'
import { LiveRefresh } from '@/components/live-refresh'
import { ReplyForm } from '../../../enquiries/reply-form'
import { messagePreview } from '@/lib/work'
export default async function ConversationPage({params}:{params:Promise<{kind:string;id:string}>}){
  const {supabase,user,profile}=await requireProvider();const {kind,id}=await params
  if(!['booking','job'].includes(kind))notFound()
  let other:string|null=null,title='',closed=false
  if(kind==='booking'){
    const {data:b}=await supabase.from('bookings').select('provider_id,requester_id,status,service:services(title)').eq('id',id).single()
    if(!b || ![b.requester_id,b.provider_id].includes(user.id))notFound()
    other=b.requester_id===user.id?b.provider_id:b.requester_id
    title=(b.service as unknown as {title?:string})?.title || 'Booking'
    closed=['completed','cancelled','withdrawn','declined'].includes(b.status)
  }else{
    const {data:j}=await supabase.from('jobs_public').select('requester_id,title,status').eq('id',id).single()
    const {data:b}=await supabase.from('bids').select('provider_id').eq('job_id',id).eq('status','accepted').maybeSingle()
    if(!j || !b || ![j.requester_id,b.provider_id].includes(user.id))notFound()
    other=j.requester_id===user.id?b.provider_id:j.requester_id;title=j.title;closed=['completed','cancelled'].includes(j.status)
  }
  if(!other)notFound()
  const [{data:person},{data:messages,error}]=await Promise.all([
    supabase.from('profiles_public').select('full_name').eq('id',other).maybeSingle(),
    supabase.from(kind==='booking'?'service_booking_messages':'messages').select('id,sender_id,content,created_at').eq(kind==='booking'?'booking_id':'job_id',id).order('created_at',{ascending:true}),
  ])
  if(!error)await supabase.from('notifications').update({read:true}).eq('user_id',user.id).eq('type','new_message').eq(kind==='booking'?'metadata->>booking_id':'metadata->>job_id',id).eq('metadata->>sender_id',other)
  return <AppShell providerName={profile?.full_name || 'Member'}><section className="page work-page"><Link href="/activity" className="card-link">Back to Activity</Link><h1>{person?.full_name || 'Conversation'}</h1><h2>{title}</h2><LiveRefresh/>
    {error?<p role="alert">Could not load messages. Refresh to retry.</p>:<div className="card enq-messages">{!messages?.length && <p className="muted">Send a message to get started.</p>}{messages?.map(m=><div key={m.id} className={m.sender_id===user.id?'bubble mine':'bubble theirs'}><p>{messagePreview(m.content)}</p><span className="bubble-time">{new Date(m.created_at).toLocaleString('en-NZ')}</span></div>)}</div>}
    {closed?<p className="muted">This conversation is read-only because the arrangement has ended.</p>:<ReplyForm enquirerId={other} {...(kind==='booking'?{bookingId:id}:{jobId:id})}/>}
  </section></AppShell>
}
