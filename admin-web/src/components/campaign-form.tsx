import Link from 'next/link'
import { CATEGORIES, AUDIENCES, CAMPAIGN_ACTIONS } from '@/lib/categories'
import { saveCampaign } from '@/app/campaigns/actions'

type Campaign = Record<string, unknown> & { id?: string; title?: string; body?: string; category?: string; capability?: string; audience?: string; regions?: string[]; starts_on?: string; ends_on?: string; primary_action?: string; priority?: number; in_app_enabled?: boolean; email_enabled?: boolean; push_enabled?: boolean; is_active?: boolean }

export function CampaignForm({ campaign = {} }: { campaign?: Campaign }) {
  const today = new Date()
  const later = new Date(today)
  later.setDate(today.getDate() + 30)
  return (
    <form action={saveCampaign} className="campaign-form">
      <input type="hidden" name="id" value={campaign.id || ''} />
      <div className="form-grid">
        <label className="full-field"><span>Campaign title</span><input name="title" defaultValue={campaign.title || ''} placeholder="Prepare your water system for summer" maxLength={100} required /></label>
        <label className="full-field"><span>Message</span><textarea name="body" defaultValue={campaign.body || ''} placeholder="Explain why this reminder is useful now." maxLength={300} required rows={4} /></label>
        <label><span>Category</span><select name="category" defaultValue={campaign.category || CATEGORIES[0]}>{CATEGORIES.map(category => <option key={category}>{category}</option>)}</select></label>
        <label><span>Suggested capability</span><input name="capability" defaultValue={campaign.capability || ''} placeholder="Optional" /></label>
        <label><span>Audience</span><select name="audience" defaultValue={campaign.audience || 'requester'}>{AUDIENCES.map(audience => <option key={audience} value={audience}>{audience}</option>)}</select></label>
        <label><span>Regions</span><input name="regions" defaultValue={(campaign.regions || []).join(', ')} placeholder="Blank for all, or Waikato, Auckland" /></label>
        <label><span>Starts</span><input type="date" name="starts_on" defaultValue={campaign.starts_on || today.toISOString().slice(0, 10)} required /></label>
        <label><span>Ends</span><input type="date" name="ends_on" defaultValue={campaign.ends_on || later.toISOString().slice(0, 10)} required /></label>
        <label><span>Primary action</span><select name="primary_action" defaultValue={campaign.primary_action || 'post_job'}>{CAMPAIGN_ACTIONS.map(action => <option key={action} value={action}>{action.replaceAll('_', ' ')}</option>)}</select></label>
        <label><span>Priority</span><input type="number" name="priority" min="0" max="100" defaultValue={campaign.priority ?? 20} /></label>
      </div>
      <fieldset><legend>Delivery and activation</legend><label><input type="checkbox" name="in_app_enabled" defaultChecked={campaign.in_app_enabled ?? true} />In-app card</label><label><input type="checkbox" name="email_enabled" defaultChecked={campaign.email_enabled ?? false} />Email</label><label><input type="checkbox" name="push_enabled" defaultChecked={campaign.push_enabled ?? false} />Push</label><label className="activate-check"><input type="checkbox" name="is_active" defaultChecked={campaign.is_active ?? false} />Activate campaign</label></fieldset>
      <div className="form-actions"><Link href="/campaigns">Cancel</Link><button type="submit" className="button-link">Save campaign</button></div>
    </form>
  )
}
