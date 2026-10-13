// A guest's intent survives email sign-in and optional onboarding. No message
// is sent until they explicitly send one in Chat.
export const PENDING_LISTING_ENQUIRY_KEY = 'pendingListingEnquiry'
const MAX_AGE_MS = 60 * 60 * 1000

export function canResumeGuestAction(session, profile, loading, showOnboarding) {
  // Auth arrives before the profile: wait until we know whether setup is needed.
  return !!session?.user?.id && profile?.id === session.user.id && !loading && !showOnboarding
}

export function listingChatParams(service, profile) {
  return {
    serviceId: service.id,
    otherUserId: service.provider_id,
    jobTitle: service.title,
    otherUserName: profile?.full_name || 'Provider',
  }
}

export function parsePendingListingEnquiry(raw, now = Date.now()) {
  try {
    const pending = JSON.parse(raw)
    const age = now - pending.savedAt
    if (!pending.service?.id || !pending.service?.provider_id
      || !Number.isFinite(pending.savedAt) || age < 0 || age >= MAX_AGE_MS) return null
    // Derive the recipient from the saved listing, never a separate destination.
    return { service: pending.service, chatParams: listingChatParams(pending.service, pending.service.profile) }
  } catch {
    return null
  }
}

export function listingEnquiryNavigationState(pending) {
  return {
    index: 2,
    routes: [
      { name: 'Home' },
      { name: 'Jobs' },
      {
        name: 'Browse',
        state: {
          index: 2,
          routes: [
            { name: 'BrowseMain' },
            { name: 'ServiceDetail', params: { service: pending.service } },
            { name: 'Chat', params: pending.chatParams },
          ],
        },
      },
      { name: 'Activity' },
      { name: 'Account' },
    ],
  }
}
