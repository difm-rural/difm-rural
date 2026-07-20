import { notFound } from 'next/navigation'
import { AppShell } from '@/components/app-shell'
import { CampaignForm } from '@/components/campaign-form'
import { requireAdmin } from '@/lib/auth'

export default async function EditCampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase, profile } = await requireAdmin()
  const { data: campaign } = await supabase.from('seasonal_campaigns').select('*').eq('id', id).maybeSingle()
  if (!campaign) notFound()
  return <AppShell adminName={profile.display_name || profile.full_name || 'Admin'}><header className="page-header"><div><p className="eyebrow">Campaigns</p><h1>Edit campaign</h1><p>Changes affect future eligibility and delivery immediately.</p></div></header><section className="panel form-panel"><CampaignForm campaign={campaign} /></section></AppShell>
}
