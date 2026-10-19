import Link from 'next/link'
import { requireProvider } from '@/lib/auth'
import { AppShell } from '@/components/app-shell'
import { ActionForm } from '@/components/action-form'
import { availabilityDisplay, PROVIDER_AVAILABILITY_OPTIONS } from '@shared/providerAvailability'
import { saveAvailability } from '../actions'
import { nzToday } from '@/lib/profile-input'
export default async function AvailabilityPage(){
  const {supabase,user,profile}=await requireProvider()
  const {data:p,error}=await supabase.from('profiles').select('availability_status,availability_until,availability_updated_at').eq('id',user.id).single()
  const current=availabilityDisplay(p?.availability_status,p?.availability_until,p?.availability_updated_at)
  return <AppShell providerName={profile?.full_name || 'Member'}><section className="page work-page"><Link href="/account" className="card-link">Back to Account</Link><h1>Work availability</h1>
    {error?<p role="alert">Could not load availability. Refresh before making changes.</p>:<ActionForm action={saveAvailability} label="Save availability"><p className="account-current">Currently: {current.label}</p>
      <p className="muted">Your declared availability appears on your public profile and helps match suitable work. Available now expires after 7 days, limited availability after 14 days, and this week at the end of the week. Update it when your plans change.</p>
      <div className="account-radio-options">{[...PROVIDER_AVAILABILITY_OPTIONS,{value:'unknown',label:'Not sharing availability',description:'Do not show an active availability claim.'}].map(o=><label key={o.value}><input name="availability_status" type="radio" value={o.value} defaultChecked={p?.availability_status===o.value}/><span><strong>{o.label}</strong><small>{o.description}</small></span></label>)}</div>
      <label className="lform-field">Unavailable until date<input type="date" name="availability_until" min={nzToday()} defaultValue={p?.availability_until || ''}/></label><p className="muted">Only needed when you choose Unavailable until.</p>
    </ActionForm>}
  </section></AppShell>
}
