import { supabase } from './supabase'

export function groupMessageThreads(messages, userId) {
  const threads = new Map()
  for (const message of messages) {
    if (message.sender_id !== userId && message.receiver_id !== userId) continue
    const otherUserId = message.sender_id === userId ? message.receiver_id : message.sender_id
    const type = message.booking_id ? 'booking' : message.service_id ? 'listing' : 'job'
    const subjectId = message.booking_id || message.service_id || message.job_id
    if (!subjectId || !otherUserId) continue
    const key = `${type}:${subjectId}:${otherUserId}`
    const existing = threads.get(key)
    if (!existing || new Date(message.created_at) > new Date(existing.message.created_at)) {
      threads.set(key, { key, type, subjectId, otherUserId, message })
    }
  }
  return [...threads.values()].sort((a, b) => new Date(b.message.created_at) - new Date(a.message.created_at))
}

export function messagePreview(content) {
  try {
    const attachment = JSON.parse(content)
    if (attachment.type === 'photo') return 'Photo'
    if (attachment.type === 'location') return 'Shared location'
  } catch { /* ordinary text */ }
  return content || 'Message'
}

async function readMessages(table, userId) {
  const rows = []
  // Page through participant-visible history so an older conversation isn't
  // lost behind PostgREST's default row limit. RLS remains authoritative.
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.from(table).select('*')
      .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
      .order('created_at', { ascending: false }).order('id', { ascending: false })
      .range(offset, offset + 499)
    if (error) throw error
    rows.push(...(data || []))
    if (!data || data.length < 500) return rows
  }
}

async function readSubjects(table, columns, ids) {
  const unique = [...new Set(ids)]
  const rows = []
  for (let offset = 0; offset < unique.length; offset += 100) {
    const { data, error } = await supabase.from(table).select(columns).in('id', unique.slice(offset, offset + 100))
    if (error) throw error
    rows.push(...(data || []))
  }
  return new Map(rows.map(row => [row.id, row]))
}

export async function fetchMessageThreads() {
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error) throw error
  if (!user) throw new Error('Please sign in to view messages.')
  const messages = await Promise.all([readMessages('messages', user.id), readMessages('service_booking_messages', user.id)])
  const threads = groupMessageThreads(messages.flat(), user.id)
  const [profiles, jobs, bookings] = await Promise.all([
    readSubjects('profiles_public', 'id,full_name', threads.map(thread => thread.otherUserId)),
    readSubjects('jobs_public', 'id,title', threads.filter(thread => thread.type === 'job').map(thread => thread.subjectId)),
    readSubjects('bookings', 'id,service_id', threads.filter(thread => thread.type === 'booking').map(thread => thread.subjectId)),
  ])
  const listings = await readSubjects('services', 'id,title', [
    ...threads.filter(thread => thread.type === 'listing').map(thread => thread.subjectId),
    ...[...bookings.values()].map(booking => booking.service_id).filter(Boolean),
  ])
  return threads.map(thread => {
    const title = thread.type === 'job' ? jobs.get(thread.subjectId)?.title
      : listings.get(thread.type === 'booking' ? bookings.get(thread.subjectId)?.service_id : thread.subjectId)?.title
    const otherUserName = profiles.get(thread.otherUserId)?.full_name || 'Member'
    const subjectLabel = thread.type === 'listing' ? 'Listing enquiry' : thread.type === 'booking' ? 'Booking' : 'Job'
    return {
      ...thread, title: title || subjectLabel, otherUserName, subjectLabel,
      preview: `${thread.message.sender_id === user.id ? 'You: ' : ''}${messagePreview(thread.message.content)}`,
      chatParams: {
        [thread.type === 'booking' ? 'bookingId' : thread.type === 'listing' ? 'serviceId' : 'jobId']: thread.subjectId,
        otherUserId: thread.otherUserId, otherUserName, jobTitle: title || subjectLabel,
      },
    }
  })
}
