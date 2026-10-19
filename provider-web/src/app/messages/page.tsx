import Link from 'next/link'
import { MessageSquare, Inbox } from 'lucide-react'
import { requireProvider } from '@/lib/auth'
import { AppShell } from '@/components/app-shell'
import { LiveRefresh } from '@/components/live-refresh'
import { loadInbox, loadConversation, unreadNotices, type ConversationContext } from '@/lib/messaging-data'
import { conversationHref, conversationKey, validConversation, type ConversationRef, type InboxThread } from '@/lib/messaging'
import { Conversation } from './conversation'

export const dynamic='force-dynamic'
export default async function MessagesPage({searchParams}:{searchParams:Promise<{kind?:string;id?:string;person?:string}>}){
  const {supabase,user,profile}=await requireProvider();const params=await searchParams
  const ref={kind:params.kind,id:params.id,person:params.person} as ConversationRef
  const selected=validConversation(ref)
  let threads:InboxThread[]=[],context:ConversationContext|null=null,inboxError=false,conversationError=false
  try{const notices=await unreadNotices(supabase,user.id);threads=await loadInbox(supabase,user.id,notices)}catch{inboxError=true}
  if(selected){try{context=await loadConversation(supabase,user.id,ref)}catch{conversationError=true}}
  return <AppShell providerName={profile?.full_name || 'Member'}><section className={'enq messages-page '+(selected?'has-conversation':'')}>
    <header className="home-heading"><div><p className="eyebrow">Stay in touch</p><h1>Messages</h1><p className="muted">Listing enquiries, job conversations and bookings in one place.</p></div><LiveRefresh/></header>
    <div className="enq-panes">
      <aside className="enq-list" aria-label="Conversations">
        {inboxError?<div className="message-load-error" role="alert"><h2>Couldn&apos;t load conversations</h2><p>Check your connection and use Refresh to try again.</p></div>
        :!threads.length?<p className="empty"><Inbox size={18}/> No conversations yet. Messages you send will appear here, even before a reply.</p>
        :<ul>{threads.map(t=><li key={t.key}><Link href={conversationHref(t)} prefetch={false} className={'enq-item '+(selected && t.key===conversationKey(ref)?'active':'')} aria-current={selected && t.key===conversationKey(ref)?'page':undefined}>
          <span className="enq-item-top"><strong>{t.name}</strong>{t.unread>0 && <span className="web-badge" aria-label={t.unread+' unread messages'}>{t.unread}</span>}</span>
          <span className="enq-listing">{t.kind==='listing'?'Listing enquiry':t.kind==='job'?'Job':'Booking'} · {t.title}</span>
          <span className="enq-snippet">{t.preview}</span><time className="enq-time" dateTime={t.updatedAt}>{new Date(t.updatedAt).toLocaleString('en-NZ',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'})}</time>
        </Link></li>)}</ul>}
      </aside>
      <div className="enq-thread">
        {context?<Conversation key={conversationKey(context)} context={context}/>:<div className="enq-placeholder"><MessageSquare size={28}/><h2>{conversationError?"Couldn't load this conversation":selected?'Conversation unavailable':'Your conversations'}</h2><p>{conversationError?'Check your connection and use Refresh to retry.':selected?'This conversation may have been removed or is unavailable to your account.':'Choose a conversation to read and reply.'}</p>{selected && <Link href="/messages" className="card-link">Back to all messages</Link>}</div>}
      </div>
    </div>
  </section></AppShell>
}
