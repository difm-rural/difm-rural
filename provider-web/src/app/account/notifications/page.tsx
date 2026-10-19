import Link from 'next/link'
import { requireProvider } from '@/lib/auth'
import { AppShell } from '@/components/app-shell'
import { ActionForm } from '@/components/action-form'
import { EMAIL_OPTIONS } from '@/lib/profile-input'
import { CATEGORIES } from '@shared/categories'
import { availabilityDisplay } from '@shared/providerAvailability'
import { saveNotificationPreferences } from '../actions'
export default async function PreferencesPage(){
  const {supabase,user,profile}=await requireProvider()
  const [{data:prefs,error},{data:p,error:profileError}]=await Promise.all([
    supabase.from('user_preferences').select('daily_digest,email_transactional,email_messages,email_seasonal,opportunity_alert_mode,opportunity_radius_km,opportunity_push,opportunity_email,preferred_categories').eq('user_id',user.id).maybeSingle(),
    supabase.from('profiles').select('skills,latitude,longitude,availability_status,availability_until,availability_updated_at').eq('id',user.id).single(),
  ])
  const available=availabilityDisplay(p?.availability_status,p?.availability_until,p?.availability_updated_at)
  const defaults:Record<string,boolean>={email_transactional:prefs?.email_transactional!==false,email_messages:prefs?.email_messages!==false,email_seasonal:!!prefs?.email_seasonal,daily_digest:!!prefs?.daily_digest}
  return <AppShell providerName={profile?.full_name || 'Member'}><section className="page work-page"><Link href="/account" className="card-link">Back to Account</Link><h1>Notification preferences</h1>
    {error?<p role="alert">Could not load notification preferences. Refresh before changing them.</p>:<ActionForm action={saveNotificationPreferences} label="Save notification preferences">
      <section className="card account-form-section"><h2>Email updates</h2>{EMAIL_OPTIONS.map(o=><label className="account-setting" key={o.key}><input type="checkbox" name={o.key} defaultChecked={defaults[o.key]}/><span><strong>{o.label}</strong><small>{o.description}</small></span></label>)}</section>
      <section className="card account-form-section"><h2>Job opportunity alerts</h2><p className="muted">Alerts match your capabilities, private GPS location, travel area and current availability. These settings are shared with the mobile app.</p>
        <label className="lform-field">Frequency<select name="opportunity_alert_mode" defaultValue={prefs?.opportunity_alert_mode || 'off'}><option value="off">Off</option><option value="daily">Daily summary</option><option value="instant">As matching jobs appear</option></select></label>
        <label className="lform-field">Travel area<select name="opportunity_radius_km" defaultValue={prefs?.opportunity_radius_km || 30}>{[15,30,50,100].map(n=><option key={n} value={n}>{n} km</option>)}</select></label>
        <label className="account-setting"><input name="opportunity_push" type="checkbox" defaultChecked={prefs?.opportunity_push!==false}/><span><strong>Job alerts on your phone</strong><small>Push notifications in your installed Rural Connections app.</small></span></label>
        <label className="account-setting"><input name="opportunity_email" type="checkbox" defaultChecked={!!prefs?.opportunity_email}/><span><strong>Job alerts by email</strong><small>Email matching job opportunities.</small></span></label>
        {profileError?<p role="alert">Could not check matching requirements. Refresh to see your current profile status.</p>:<>
          {(!p?.skills?.length || p.latitude===null || p.longitude===null) && <p className="home-load-error">Add capabilities and a private GPS location in <Link href="/account/profile" className="card-link">Profile</Link> before jobs can be matched.</p>}
          {!available.active && <p className="home-load-error">Set your current <Link href="/account/availability" className="card-link">work availability</Link> before matching can begin.</p>}
        </>}
      </section>
      <section className="card account-form-section"><h2>Job interests (optional)</h2><p className="muted">Categories you are interested in. Your capabilities remain important for matching work.</p><div className="account-checkboxes">{CATEGORIES.map(c=><label key={c}><input type="checkbox" name="preferred_categories" value={c} defaultChecked={prefs?.preferred_categories?.includes(c)}/>{c}</label>)}</div></section>
      <p className="muted">Phone notification permissions are managed on your phone. The push preference above controls job opportunity alerts; it does not switch off message or booking notifications. Web unread badges and your notification history remain available.</p>
    </ActionForm>}
  </section></AppShell>
}
