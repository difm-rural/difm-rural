// Refresh badges and visible inboxes for this signed-in user. Polling covers
// reconnects and older deployments without notifications in the publication.
export function watchNotifications(client, userId, onChange, appState, timers = globalThis) {
  let active = true
  let busy = false
  let signature = null
  const visible = () => active && appState.currentState === 'active'
  async function refresh() {
    if (!visible() || busy) return
    busy = true
    try {
      const { data, error } = await client.from('notifications').select('id,read')
        .eq('user_id', userId).order('created_at', { ascending: false }).limit(100)
      if (!visible() || error) return
      const next = JSON.stringify(data || [])
      if (signature !== next) { signature = next; onChange() }
    } finally { busy = false }
  }
  const channel = client.channel(`live-notifications-${userId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, () => {
      if (visible()) onChange()
    }).subscribe()
  const interval = timers.setInterval(() => refresh().catch(() => {}), 10000)
  const listener = appState.addEventListener('change', state => {
    if (state === 'active') refresh().catch(() => {})
  })
  refresh().catch(() => {})
  return () => { active = false; timers.clearInterval(interval); listener.remove(); client.removeChannel(channel) }
}
