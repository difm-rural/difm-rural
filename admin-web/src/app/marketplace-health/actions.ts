'use server'

import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/auth'

export async function runMarketplaceHealth() {
  const { supabase } = await requireAdmin()
  const { data, error } = await supabase.functions.invoke('marketplace-health', { body: {} })
  const outcome = error ? 'unavailable' : data?.status === 'in_progress' ? 'in_progress' : 'done'
  redirect(`/marketplace-health?source=manual&outcome=${outcome}`)
}
