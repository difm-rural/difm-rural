// Realtime channels that stay open. A channel is closed by the server when its
// token expires and can error or time out on a flaky connection; supabase-js
// does not rejoin those by itself. liveChannel rejoins with backoff (after
// refreshing the realtime token), straight away when the tab comes back into
// view, and stops for good on cleanup.

import type { RealtimeChannel } from '@supabase/supabase-js'

export type RealtimeLike = {
  channel(name: string): RealtimeChannel
  removeChannel(channel: RealtimeChannel): unknown
}

export const RETRY_BASE_MS = 1000
export const RETRY_MAX_MS = 30000
export const retryDelay = (attempt: number) => Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** Math.max(0, attempt))

export function liveChannel(
  client: RealtimeLike,
  name: string,
  bind: (channel: RealtimeChannel) => RealtimeChannel,
  {
    refreshAuth = async () => {},
    setTimer = (fn: () => void, ms: number) => setTimeout(fn, ms),
    clearTimer = (timer: ReturnType<typeof setTimeout>) => clearTimeout(timer),
    watchVisibility = typeof document !== 'undefined',
    uniqueId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(16).slice(2)),
  }: {
    refreshAuth?: () => Promise<unknown>
    setTimer?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>
    clearTimer?: (timer: ReturnType<typeof setTimeout>) => void
    watchVisibility?: boolean
    uniqueId?: () => string
  } = {},
): () => void {
  let current: RealtimeChannel | null = null
  let retry: ReturnType<typeof setTimeout> | null = null
  let attempt = 0
  let stopped = false

  function open() {
    if (stopped) return
    retry = null
    const mine = bind(client.channel(name + '-' + uniqueId()))
    current = mine
    mine.subscribe(status => {
      // Ignore late callbacks from a channel that has been replaced or removed.
      if (stopped || current !== mine) return
      if (status === 'SUBSCRIBED') { attempt = 0; return }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') reopen(retryDelay(attempt++))
    })
  }

  function reopen(delay: number) {
    const old = current
    current = null
    if (old) void client.removeChannel(old)
    if (retry) clearTimer(retry)
    retry = setTimer(() => { void refreshAuth().catch(() => {}).then(open) }, delay)
  }

  function onVisible() {
    if (document.visibilityState !== 'visible' || stopped) return
    // Waiting to rejoin: do it now that the tab is back.
    if (!current) { attempt = 0; reopen(0) }
  }

  open()
  if (watchVisibility) document.addEventListener('visibilitychange', onVisible)
  return () => {
    stopped = true
    if (retry) clearTimer(retry)
    if (watchVisibility) document.removeEventListener('visibilitychange', onVisible)
    const old = current
    current = null
    if (old) void client.removeChannel(old)
  }
}

// Conversations the page is showing live, so web-alerts can skip a full page
// refresh for their messages (the conversation adds them in place).
export type ThreadKey = { kind: 'job' | 'listing' | 'booking'; id: string }
const liveThreads = new Map<string, number>()
const threadKey = (kind: string, id: unknown) => kind + ':' + String(id)

export function showThreadLive(thread: ThreadKey): () => void {
  const key = threadKey(thread.kind, thread.id)
  liveThreads.set(key, (liveThreads.get(key) || 0) + 1)
  return () => {
    const left = (liveThreads.get(key) || 1) - 1
    if (left > 0) liveThreads.set(key, left)
    else liveThreads.delete(key)
  }
}

type Row = { type?: unknown; booking_id?: unknown; job_id?: unknown; service_id?: unknown; metadata?: unknown }

// Is this realtime row a chat message (or its new-message notification) for a
// conversation currently shown live on the page?
export function isLiveThreadRow(table: string, row: Row | null | undefined): boolean {
  if (!row || !liveThreads.size) return false
  if (table === 'service_booking_messages') return liveThreads.has(threadKey('booking', row.booking_id))
  if (table === 'messages') {
    return row.job_id ? liveThreads.has(threadKey('job', row.job_id)) : liveThreads.has(threadKey('listing', row.service_id))
  }
  if (table === 'notifications' && row.type === 'new_message') {
    const m = (row.metadata || {}) as Row
    if (m.booking_id) return liveThreads.has(threadKey('booking', m.booking_id))
    if (m.job_id) return liveThreads.has(threadKey('job', m.job_id))
    if (m.service_id) return liveThreads.has(threadKey('listing', m.service_id))
  }
  return false
}
