// Role model: the requester/provider split is retired for now — everyone can both
// REQUEST (post jobs, book services) and PROVIDE (advertise services, bid on jobs),
// invisibly. canProvide() is therefore universally true. getPrimaryRole() is kept
// for admin analytics and display reads (and reflects the signup-time column), and
// per-record transaction direction is still derived separately (viewerRole).

export function getPrimaryRole(profile) {
  return profile?.primary_role || profile?.role || 'requester'
}

// True when the user may offer services / take on jobs. Providing is available to
// everyone now, so this always returns true (profile kept for call-site stability).
// eslint-disable-next-line no-unused-vars
export function canProvide(profile) {
  return true
}

// Everyone can request. Kept as a constant so call sites read clearly.
export const CAN_REQUEST = true
