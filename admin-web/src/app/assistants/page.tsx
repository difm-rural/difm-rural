import { Bot, PauseCircle, PlayCircle, Power } from 'lucide-react'
import { AppShell } from '@/components/app-shell'
import { requireAdmin } from '@/lib/auth'
import { setAiEnabled, setMemberPause } from './actions'

export const dynamic = 'force-dynamic'

type MemberRow = {
  user_id: string; full_name: string | null; email: string | null; connected_sessions: number
  calls_today: number; calls_30d: number; refused_30d: number; last_call_at: string | null; paused: boolean; pause_reason: string | null
}

function when(iso: string | null) {
  return iso ? new Date(iso).toLocaleString('en-NZ', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Pacific/Auckland' }) : 'Never'
}

export default async function AssistantsPage({ searchParams }: { searchParams: Promise<{ result?: string }> }) {
  const { result } = await searchParams
  const { supabase, profile } = await requireAdmin()
  const [{ data: settings }, { data: members, error }] = await Promise.all([
    supabase.from('ai_settings').select('ai_enabled, updated_at').eq('id', true).maybeSingle(),
    supabase.rpc('ai_admin_members'),
  ])
  const enabled = settings?.ai_enabled === true
  const rows = (members || []) as MemberRow[]

  return (
    <AppShell adminName={profile.display_name || profile.full_name || 'Admin'}>
      <header className="page-header">
        <div><p className="eyebrow">AI connector</p><h1>Connected assistants</h1><p>Read-only AI access (rc-mcp): 60 calls a minute and 1,000 a day per member, all calls audited.</p></div>
      </header>
      {result === 'saved' && <p className="privacy-note" role="status">Saved.</p>}
      {result === 'error' && <p className="privacy-note" role="alert">That change didn’t save. Refresh and try again.</p>}

      <section className="panel settings-panel">
        <div className="panel-heading"><div><p className="panel-kicker">Global switch</p><h2>AI assistant access is {enabled ? 'on' : 'off'}</h2></div><Power size={20} /></div>
        <p className="privacy-note">Turning this off refuses every assistant tool call for every member straight away. Connections are kept, so turning it back on restores access.</p>
        <form action={setAiEnabled}>
          <input type="hidden" name="enabled" value={enabled ? 'false' : 'true'} />
          <button type="submit" className="save-settings">{enabled ? 'Turn AI access off' : 'Turn AI access on'}</button>
        </form>
      </section>

      <section className="panel" style={{ marginTop: 18 }}>
        <div className="panel-heading"><div><p className="panel-kicker">Members</p><h2>{rows.length} connected or recently active</h2></div><Bot size={20} /></div>
        {error ? <p className="empty-inline" role="alert">Couldn’t load members. Has the ai_connector migration been applied?</p>
          : !rows.length ? <p className="empty-inline">No member has connected an assistant yet.</p>
          : <div className="report-table-wrap"><table className="report-table">
              <thead><tr><th>Member</th><th>Connections</th><th>Calls today</th><th>Calls (30 days)</th><th>Refused (30 days)</th><th>Last call</th><th>Access</th></tr></thead>
              <tbody>{rows.map(m => <tr key={m.user_id}>
                <td>{m.full_name || 'Unnamed member'}<br /><small>{m.email}</small></td>
                <td>{m.connected_sessions}</td><td>{m.calls_today}</td><td>{m.calls_30d}</td><td>{m.refused_30d}</td><td>{when(m.last_call_at)}</td>
                <td><form action={setMemberPause}>
                  <input type="hidden" name="user_id" value={m.user_id} />
                  <input type="hidden" name="paused" value={m.paused ? 'false' : 'true'} />
                  {!m.paused && <input name="reason" placeholder="Reason (optional)" maxLength={300} aria-label={'Reason for pausing ' + (m.full_name || 'member')} />}
                  {m.paused && m.pause_reason && <small>Paused: {m.pause_reason}<br /></small>}
                  <button className="table-action" type="submit">{m.paused ? <><PlayCircle size={13} /> Resume</> : <><PauseCircle size={13} /> Pause</>}</button>
                </form></td>
              </tr>)}</tbody>
            </table></div>}
      </section>
    </AppShell>
  )
}
