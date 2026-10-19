import Link from 'next/link'
import { Inbox, MessagesSquare } from 'lucide-react'
import { requireProvider } from '@/lib/auth'
import { AppShell } from '@/components/app-shell'
import { ReplyForm } from './reply-form'
import { LiveRefresh } from '@/components/live-refresh'
import { messagePreview } from '@/lib/work'

export const dynamic = 'force-dynamic'

type Msg = { id: string; service_id: string; sender_id: string; receiver_id: string; content: string | null; created_at: string }

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24); if (d < 7) return `${d}d ago`
  return new Date(iso).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' })
}
function stamp(iso: string): string {
  return new Date(iso).toLocaleString('en-NZ', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
}

export default async function EnquiriesPage({ searchParams }: { searchParams: Promise<{ s?: string; c?: string }> }) {
  const { supabase, user, profile } = await requireProvider()
  const me = user.id
  const sp = await searchParams
  const selService = sp.s ?? null
  const selCounterpart = sp.c ?? null

  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const selectedService = selService && uuid.test(selService) ? selService : null
  const selectedPerson = selCounterpart && uuid.test(selCounterpart) ? selCounterpart : null
  const {data: msgs, error: messageError} = await supabase.from('messages')
    .select('id, service_id, sender_id, receiver_id, content, created_at').not('service_id','is',null)
    .or('sender_id.eq.' + me + ',receiver_id.eq.' + me).order('created_at',{ascending:false})
  const threads: {serviceId:string;counterpart:string;last:Msg;awaiting:boolean}[]=[]
  const seen=new Set<string>()
  for(const m of (msgs || []) as Msg[]){
    const counterpart=m.sender_id===me?m.receiver_id:m.sender_id,key=m.service_id+':'+counterpart
    if(seen.has(key))continue
    seen.add(key);threads.push({serviceId:m.service_id,counterpart,last:m,awaiting:m.sender_id!==me})
  }
  const serviceIds=[...new Set([...threads.map(t=>t.serviceId),...(selectedService?[selectedService]:[])])]
  const services=serviceIds.length?await supabase.from('services').select('id,title,provider_id,is_active,closed_at').in('id',serviceIds):{data:[]}
  const titleById=new Map((services.data || []).map(s=>[s.id,s.title]))
  const ids=[...new Set([...threads.map(t=>t.counterpart),...(selectedPerson?[selectedPerson]:[])])]
  const profiles=ids.length?await supabase.from('profiles_public').select('id,full_name').in('id',ids):{data:[]}
  const nameById=new Map((profiles.data || []).map(p=>[p.id,p.full_name]))
  const listing=(services.data || []).find(s=>s.id===selectedService)
  const existing=threads.some(t=>t.serviceId===selectedService && t.counterpart===selectedPerson)
  const validOpen=!!(selectedService && selectedPerson && selectedPerson!==me && (existing || (listing?.provider_id===selectedPerson && listing?.is_active && !listing?.closed_at)))
  const openMsgs=validOpen?((msgs || []) as Msg[]).filter(m=>m.service_id===selectedService && ((m.sender_id===me && m.receiver_id===selectedPerson)||(m.receiver_id===me && m.sender_id===selectedPerson))).reverse():[]
  const openName=validOpen?nameById.get(selectedPerson!) || 'Community member':''
  const openTitle=validOpen?titleById.get(selectedService!) || 'Listing':''
  if(validOpen && !messageError){
    await supabase.from('notifications').update({read:true}).eq('user_id',me).eq('type','new_message')
      .eq('metadata->>service_id',selectedService).eq('metadata->>sender_id',selectedPerson)
  }

  return (
    <AppShell providerName={(profile?.full_name as string) ?? 'Provider'}>
      <section className="enq">
        <header className="enq-head">
          <p className="eyebrow">Provider console</p>
          <h1>Messages</h1>
          {messageError && <p role="alert" className="form-error">Could not load messages. Refresh to try again.</p>}
        </header>

        <LiveRefresh />
        <div className="enq-panes">
          {/* Thread list */}
          <aside className="enq-list">
            {threads.length === 0 ? (
              <p className="empty"><Inbox size={16} /> No enquiries yet.</p>
            ) : (
              <ul>
                {threads.map(t => {
                  const active = validOpen && t.serviceId === selService && t.counterpart === selCounterpart
                  const fromMe = t.last.sender_id === me
                  return (
                    <li key={`${t.serviceId}:${t.counterpart}`}>
                      <Link
                        href={`/enquiries?s=${encodeURIComponent(t.serviceId)}&c=${encodeURIComponent(t.counterpart)}`}
                        className={active ? 'enq-item active' : 'enq-item'}
                      >
                        <span className="enq-item-top">
                          <strong>{nameById.get(t.counterpart) ?? 'Someone'}</strong>
                          <span className="enq-time">{timeAgo(t.last.created_at)}</span>
                        </span>
                        <span className="enq-listing">{titleById.get(t.serviceId) ?? 'a listing'}</span>
                        <span className="enq-snippet">{fromMe ? 'You: ' : ''}{messagePreview(t.last.content).slice(0, 80)}</span>
                        {t.awaiting && <span className="enq-flag">Awaiting your reply</span>}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </aside>

          {/* Open thread */}
          <div className="enq-thread">
            {!validOpen ? (
              <div className="enq-placeholder"><MessagesSquare size={26} /><p>Select an enquiry to read and reply.</p></div>
            ) : (
              <>
                <div className="enq-thread-head">
                  <strong>{openName}</strong>
                  <span>{openTitle}</span>
                </div>
                <div className="enq-messages">
                  {openMsgs.length === 0 ? (
                    <p className="empty">No messages in this thread.</p>
                  ) : openMsgs.map(m => (
                    <div key={m.id} className={m.sender_id === me ? 'bubble mine' : 'bubble theirs'}>
                      <p>{messagePreview(m.content)}</p>
                      <span className="bubble-time">{stamp(m.created_at)}</span>
                    </div>
                  ))}
                </div>
                <ReplyForm serviceId={selService as string} enquirerId={selCounterpart as string} />
              </>
            )}
          </div>
        </div>
      </section>
    </AppShell>
  )
}
