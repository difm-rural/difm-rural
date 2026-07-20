import { AppShell } from '@/components/app-shell'
import { CampaignForm } from '@/components/campaign-form'
import { requireAdmin } from '@/lib/auth'

export default async function NewCampaignPage() {
  const { profile } = await requireAdmin()
  return <AppShell adminName={profile.display_name || profile.full_name || 'Admin'}><header className="page-header"><div><p className="eyebrow">Campaigns</p><h1>New seasonal campaign</h1><p>Create it as a paused draft, review the targeting, then activate it.</p></div></header><section className="panel form-panel"><CampaignForm /></section></AppShell>
}
