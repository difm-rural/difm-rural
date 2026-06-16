// Role model: in DIFM Rural everyone can REQUEST (post jobs, book services).
// Providing — advertising services and bidding on the job board — is an
// additive capability on top of requesting, never a replacement. So a
// "provider" is always also a requester; the legacy bare 'provider' role is
// treated the same as 'both'.

export function getPrimaryRole(profile) {
  return profile?.primary_role || profile?.role || 'requester'
}

// True when the user offers services / takes on jobs (provider extras).
export function canProvide(profile) {
  const role = getPrimaryRole(profile)
  return role === 'provider' || role === 'both'
}

// Everyone can request. Kept as a constant so call sites read clearly.
export const CAN_REQUEST = true
