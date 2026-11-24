import { after } from 'next/server'
import { revalidatePath } from 'next/cache'
import type { createClient } from '@/lib/supabase/server'

type Supabase = Awaited<ReturnType<typeof createClient>>

// Server-side twin of the app's markNotificationsReadFor (src/lib/notifications.js):
// opening a job or booking acknowledges the viewer's unread notices about it.
// Message notices are left alone — the conversation marks those read once its
// messages have loaded. Best-effort: a failure never blocks the page.
export async function markNotificationsReadFor(supabase: Supabase, userId: string, target: { jobId?: string; bookingId?: string }) {
  let q = supabase.from('notifications').update({ read: true }).eq('user_id', userId).eq('read', false).neq('type', 'new_message')
  if (target.bookingId) q = q.eq('metadata->>booking_id', target.bookingId)
  else if (target.jobId) q = q.eq('metadata->>job_id', target.jobId)
  else return
  try {
    const { data, error } = await q.select('id')
    if (error || !data?.length) return
    // revalidatePath is not allowed during a render; after() runs it once the
    // response is sent.
    after(() => { revalidatePath('/'); revalidatePath('/notifications') })
  } catch {}
}
