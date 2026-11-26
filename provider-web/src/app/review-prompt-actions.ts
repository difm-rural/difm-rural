'use server'
import { revalidatePath } from 'next/cache'
import { dismissReviewPrompt } from '@shared/reviewPrompts'
import { requireProvider } from '@/lib/auth'
import { validId } from '@/lib/job-input'
import type { ActionState } from '@/components/action-form'

// Home "Not reviewing": hides one Leave-a-review prompt. RLS only accepts work
// the person took part in, in the role they held.
export async function dismissReview(_: ActionState, data: FormData): Promise<ActionState> {
  const { supabase } = await requireProvider()
  const kind = String(data.get('kind') || ''), id = String(data.get('id') || ''), role = String(data.get('role') || '')
  if (!['job', 'booking'].includes(kind) || !validId(id) || !['requester', 'provider'].includes(role)) return { error: 'Refresh Home and try again.' }
  try {
    await dismissReviewPrompt(supabase, { kind: kind as 'job' | 'booking', id, viewerRole: role as 'requester' | 'provider' })
  } catch { return { error: 'Could not dismiss this review. Refresh and try again.' } }
  revalidatePath('/')
  return { error: '', success: 'Dismissed.' }
}
