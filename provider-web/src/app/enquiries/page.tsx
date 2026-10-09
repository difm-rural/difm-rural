import Link from 'next/link'
import { Inbox, MessagesSquare } from 'lucide-react'
import { requireProvider } from '@/lib/auth'
import { AppShell } from '@/components/app-shell'
import { ReplyForm } from './reply-form'

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

  // My listings (filter — services RLS also exposes everyone's active ones).
  const { data: svc } = await supabase.from('services').select('id, title').eq('provider_id', me)
  const services = svc ?? []
  const serviceIds = services.map(s => s.id)
  const titleById = new Map(services.map(s => [s.id, s.title as string]))

  // Thread list: latest message per (listing, enquirer) pair on my listings.
  const threads: { serviceId: string; counterpart: string; last: Msg; awaiting: boolean }[] = []
  if (serviceIds.length) {
    const { data: msgs } = await supabase
      .from('messages')
      .select('id, service_id, sender_id, receiver_id, content, created_at')
      .not('service_id', 'is', null)
      .in('service_id', serviceIds)
      .order('created_at', { ascending: false })
    const seen = new Set<string>()
    for (const m of (msgs ?? []) as Msg[]) {
      const counterpart = m.sender_id === me ? m.receiver_id : m.sender_id
      const key = `${m.service_id}:${counterpart}`
      if (seen.has(key)) continue
      seen.add(key)
      threads.push({ serviceId: m.service_id, counterpart, last: m, awaiting: m.sender_id !== me })
    }
    threads.sort((a, b) =>
      (Number(b.awaiting) - Number(a.awaiting)) ||
      (new Date(b.last.created_at).getTime() - new Date(a.last.created_at).getTime()))
  }

  // Names for every enquirer.
  const ids = [...new Set(threads.map(t => t.counterpart))]
  const nameById = new Map<string, string>()
  if (ids.length) {
    const { data } = await supabase.from('profiles_public').select('id, full_name').in('id', ids)
    for (const p of data ?? []) nameById.set(p.id, (p.full_name as string) ?? 'Someone')
  }

  // Open thread — pair-scoped, only if the listing is mine.
  const validOpen = !!(selService && selCounterpart && serviceIds.includes(selService))
  let openMsgs: Msg[] = []
  if (validOpen) {
    const { data } = await supabase
      .from('messages')
      .select('id, service_id, sender_id, receiver_id, content, created_at')
      .eq('service_id', selService as string)
      .or(`and(sender_id.eq.${me},receiver_id.eq.${selCounterpart}),and(sender_id.eq.${selCounterpart},receiver_id.eq.${me})`)
      .order('created_at', { ascending: true })
    openMsgs = (data ?? []) as Msg[]
  }
  const openName = validOpen ? (nameById.get(selCounterpart as string) ?? 'Enquirer') : ''
  const openTitle = validOpen ? (titleById.get(selService as string) ?? 'Listing') : ''

  return (
    <AppShell providerName={(profile?.full_name as string) ?? 'Provider'}>
      <section className="enq">
        <header className="enq-head">
          <p className="eyebrow">Provider console</p>
          <h1>Enquiries</h1>
        </header>

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
                        <span className="enq-snippet">{fromMe ? 'You: ' : ''}{(t.last.content ?? '').slice(0, 80)}</span>
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
                      <p>{m.content}</p>
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
