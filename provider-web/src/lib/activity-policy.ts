export type WorkKind = 'job' | 'booking'
export type WorkRole = 'requester' | 'provider'
export type ActivityWork = {
  id: string; kind: WorkKind; status: string; requesterId: string; providerId: string | null;
  title: string; location: string | null; notes: string | null;
  cancellationReason?: string | null; cancellationNote?: string | null;
  serviceId?: string; listingKind?: string; closedAt?: string | null;
}
export type WorkAction = 'complete' | 'cancel' | 'withdraw' | 'request_cancel' | 'confirm_cancel' | 'close_grazing' | 'relist_grazing' | 'relist' | 'review'
export function workRole(work: ActivityWork, userId: string): WorkRole | null {
  if (work.requesterId === userId) return 'requester'
  if (work.providerId === userId) return 'provider'
  return null
}
export function workActions(work: ActivityWork, userId: string): WorkAction[] {
  const role = workRole(work, userId)
  if (!role) return []
  if (work.status === 'completed') return [
    ...(work.providerId ? ['review' as const] : []),
    ...(role === 'provider' && work.listingKind === 'grazing' && work.closedAt ? ['relist' as const] : []),
  ]
  if (work.kind === 'job') {
    if (role === 'requester' && ['open', 'accepted', 'in_progress', 'awaiting_completion'].includes(work.status)) return ['cancel']
    if (role === 'provider' && ['accepted', 'in_progress'].includes(work.status)) return ['complete']
  } else {
    if (role === 'requester') {
      if (['pending', 'quote_sent'].includes(work.status)) return ['withdraw']
      if (['confirmed', 'in_progress'].includes(work.status)) return ['request_cancel']
    } else {
      if (work.status === 'cancellation_requested') return ['confirm_cancel']
      if (['confirmed', 'in_progress'].includes(work.status)) return work.listingKind === 'grazing' ? ['close_grazing', 'relist_grazing'] : ['complete']
    }
  }
  return []
}
export function activityIsActive(kind: WorkKind | 'offer', status: string, jobStatus?: string) {
  if (kind === 'offer') return (status === 'pending' && jobStatus === 'open') || (status === 'accepted' && ['accepted', 'in_progress', 'awaiting_completion'].includes(jobStatus || ''))
  return (kind === 'job' ? ['open','accepted','in_progress','awaiting_completion'] : ['pending','quote_sent','confirmed','in_progress','awaiting_completion','cancellation_requested']).includes(status)
}
