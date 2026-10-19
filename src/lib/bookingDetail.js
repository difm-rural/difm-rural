// Cross-user identity must come from profiles_public: the base profiles table
// only exposes the viewer's own private profile under RLS.
export async function fetchBookingDetail(client, bookingId) {
  const { data: booking, error } = await client.from('bookings')
    .select('*, service:service_id(*)').eq('id', bookingId).single()
  if (error) throw error
  if (!booking) throw new Error('This booking is unavailable.')
  const ids = [...new Set([booking.requester_id, booking.provider_id].filter(Boolean))]
  const { data: profiles, error: profileError } = await client.from('profiles_public')
    .select('id, full_name, display_name, avatar_url, created_at').in('id', ids)
  if (profileError) throw profileError
  const people = new Map((profiles || []).map(profile => [profile.id, {
    ...profile, full_name: profile.full_name || profile.display_name,
  }]))
  return {
    ...booking,
    requester: people.get(booking.requester_id) || null,
    provider: people.get(booking.provider_id) || null,
  }
}
