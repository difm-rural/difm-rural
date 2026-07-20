import Link from 'next/link'
import { CalendarDays, Mail, MonitorSmartphone, Plus, Send, Target } from 'lucide-react'
import { AppShell } from '@/components/app-shell'
import { requireAdmin } from '@/lib/auth'
import { toggleCampaign, updateCampaignSettings } from './actions'

function stateFor(campaign: { is_active: boolean; starts_on: string; ends_on: string }) {
  const today = new Date().toISOString().slice(0, 10)
  if (!campaign.is_active) return 'Paused'
  if (campaign.starts_on > today) return 'Scheduled'
  if (campaign.ends_on < today) return 'Ended'
  return 'Live'
}

export default async function CampaignsPage() {
  const { supabase, profile } = await requireAdmin()
  const [{ data: campaigns }, { data: settings }, { data: deliveries }] = await Promise.all([
    supabase.from('seasonal_campaigns').select('*').order('starts_on', { ascending: false }),
    supabase.from('seasonal_reminder_settings').select('*').eq('singleton', true).single(),
    supabase.from('seasonal_campaign_deliveries').select('campaign_id, first_impression_at, dismissed_at, actioned_at, email_sent_at'),
  ])
  const campaignRows = campaigns || []
  const deliveryRows = deliveries || []

  return (
    <AppShell adminName={profile.display_name || profile.full_name || 'Admin'}>
      <header className="page-header campaigns-header">
        <div><p className="eyebrow">Engagement</p><h1>Seasonal campaigns</h1><p>Plan useful, occasional prompts by season, audience and region.</p></div>
        <Link href="/campaigns/new" className="button-link"><Plus size={16} />New campaign</Link>
      </header>

      <section className="panel settings-panel">
        <div className="panel-heading"><div><p className="panel-kicker">Guardrails</p><h2>Global delivery settings</h2></div><span className="period-label">Applies to every campaign</span></div>
        <form action={updateCampaignSettings} className="settings-form">
          <label className="toggle-card"><MonitorSmartphone size={18} /><span><strong>In-app cards</strong><small>Allow active campaigns on Home.</small></span><input type="checkbox" name="in_app_enabled" defaultChecked={settings?.in_app_enabled} /></label>
          <label className="toggle-card"><Mail size={18} /><span><strong>Seasonal email</strong><small>Users must also opt in.</small></span><input type="checkbox" name="email_enabled" defaultChecked={settings?.email_enabled} /></label>
          <label className="toggle-card"><Send size={18} /><span><strong>Push notifications</strong><small>Keep off until push delivery is connected.</small></span><input type="checkbox" name="push_enabled" defaultChecked={settings?.push_enabled} /></label>
          <label className="number-field"><span>Cards per user/month</span><input type="number" min="0" max="10" name="max_cards_per_month" defaultValue={settings?.max_cards_per_month ?? 2} /></label>
          <label className="number-field"><span>Emails per user/month</span><input type="number" min="0" max="5" name="max_emails_per_month" defaultValue={settings?.max_emails_per_month ?? 1} /></label>
          <button type="submit" className="save-settings">Save settings</button>
        </form>
      </section>

      <section className="campaign-list-heading"><div><h2>Campaigns</h2><p>{campaignRows.length} total campaigns</p></div></section>
      <section className="campaign-table-wrap">
        <table className="campaign-table">
          <thead><tr><th>Campaign</th><th>Schedule</th><th>Audience</th><th>Delivery</th><th>Results</th><th>Status</th><th /></tr></thead>
          <tbody>{campaignRows.map(campaign => {
            const rows = deliveryRows.filter(row => row.campaign_id === campaign.id)
            const status = stateFor(campaign)
            return (
              <tr key={campaign.id}>
                <td><Link href={`/campaigns/${campaign.id}`}><strong>{campaign.title}</strong><span>{campaign.category || 'General'}{campaign.regions?.length ? ` · ${campaign.regions.join(', ')}` : ' · All regions'}</span></Link></td>
                <td><span className="table-icon-line"><CalendarDays size={14} />{campaign.starts_on}<br />to {campaign.ends_on}</span></td>
                <td><span className="table-icon-line"><Target size={14} />{campaign.audience}</span></td>
                <td><div className="channel-tags">{campaign.in_app_enabled && <span>In app</span>}{campaign.email_enabled && <span>Email</span>}{campaign.push_enabled && <span>Push</span>}</div></td>
                <td><strong>{rows.filter(row => row.first_impression_at).length}</strong><span> views · {rows.filter(row => row.actioned_at).length} actions</span></td>
                <td><span className={`campaign-state ${status.toLowerCase()}`}>{status}</span></td>
                <td><form action={toggleCampaign}><input type="hidden" name="id" value={campaign.id} /><input type="hidden" name="active" value={campaign.is_active ? 'false' : 'true'} /><button className="table-action" type="submit">{campaign.is_active ? 'Pause' : 'Activate'}</button></form></td>
              </tr>
            )
          })}</tbody>
        </table>
      </section>
    </AppShell>
  )
}
