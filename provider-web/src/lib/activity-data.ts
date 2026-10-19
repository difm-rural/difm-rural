import type { SupabaseClient } from '@supabase/supabase-js'
import type { ActivityWork, WorkKind } from './activity-policy'

export async function loadActivityWork(client: SupabaseClient, kind: WorkKind, id: string): Promise<ActivityWork | null> {
  if (kind === 'booking') {
    const { data: b, error } = await client.from('bookings').select('*, service:services(id,title,kind,closed_at)').eq('id', id).single()
    if (error) throw error
    if (!b) return null
    return {id:b.id,kind,status:b.status,requesterId:b.requester_id,providerId:b.provider_id,
      title:b.service?.title || 'Booking',location:b.location_name,notes:b.notes,
      serviceId:b.service_id,listingKind:b.service?.kind,closedAt:b.service?.closed_at,
      cancellationReason:b.cancellation_reason,cancellationNote:b.cancellation_note}
  }
  const [{data:j,error},{data:b,error:bidError}] = await Promise.all([
    client.from('jobs_public').select('id,title,status,requester_id,location_name,description,cancellation_reason,cancellation_note').eq('id',id).single(),
    client.from('bids').select('provider_id').eq('job_id',id).eq('status','accepted').maybeSingle(),
  ])
  if(error || bidError) throw error || bidError
  if(!j)return null
  return {id:j.id,kind,status:j.status,requesterId:j.requester_id,providerId:b?.provider_id || null,title:j.title,location:j.location_name,notes:j.description,cancellationReason:j.cancellation_reason,cancellationNote:j.cancellation_note}
}
