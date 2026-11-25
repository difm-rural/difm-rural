// Only public identifiers and allowlisted actions survive authentication.
export const GUEST_INTENT_KEY = 'guestActionIntent'
const actions = new Set(['post-job', 'create-listing', 'job', 'listing', 'booking'])
export function parseGuestIntent(raw, now = Date.now()) {
  try {
    const value = JSON.parse(raw)
    if (!actions.has(value?.action) || !Number.isFinite(value.savedAt)
      || now < value.savedAt || now - value.savedAt >= 60 * 60 * 1000) return null
    if (!['post-job', 'create-listing'].includes(value.action)
      && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.id || '')) return null
    return {action: value.action, id: value.id, savedAt: value.savedAt}
  } catch { return null }
}
export async function saveGuestIntent(storage, action, id) {
  const value = {action, id, savedAt: Date.now()}
  if (!parseGuestIntent(JSON.stringify(value))) throw new Error('Invalid sign-in destination')
  await storage.multiRemove(['pendingJobView', 'pendingListingEnquiry'])
  await storage.setItem(GUEST_INTENT_KEY, JSON.stringify(value))
}
export async function guestIntentDestination(client, intent) {
  if (intent.action === 'post-job') return ['Home', {screen: 'PostJob', params: {resumeGuestDraft: true}}]
  if (intent.action === 'create-listing') return ['Browse', {screen: 'CreateService'}]
  const isJob = intent.action === 'job'
  const {data, error} = await client.from(isJob ? 'jobs_public' : 'services_public').select('*').eq('id', intent.id).maybeSingle()
  if (error) throw error
  if (!data) return null
  if (isJob) return ['Jobs', {screen: 'JobDetail', params: {job: data}}]
  return ['Browse', {screen: intent.action === 'booking' && data.is_active && !data.closed_at && data.availability_status !== 'paused' ? 'BookingConfirm' : 'ServiceDetail', params: {service: data}}]
}
