// Tiny pub/sub so screens can ask AppNavigator to refresh tab badges
// (e.g. after marking notifications read) without prop drilling.

const listeners = new Set()

export function onBadgeRefresh(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function requestBadgeRefresh() {
  listeners.forEach(listener => {
    try { listener() } catch { /* listener errors must not break callers */ }
  })
}
