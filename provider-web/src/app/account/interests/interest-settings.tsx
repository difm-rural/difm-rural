'use client'
import {useState} from 'react'
import {ActionForm} from '@/components/action-form'
import {manageInterest} from '@/app/discovery-actions'
export function InterestSettings({id,frequency:initial,active:initialActive,pushEnabled,emailEnabled}:{id:string;frequency:string;active:boolean;pushEnabled:boolean;emailEnabled:boolean}){
 const [frequency,setFrequency]=useState(initial),[active,setActive]=useState(initialActive),[push,setPush]=useState(pushEnabled),[email,setEmail]=useState(emailEnabled)
 return <ActionForm action={manageInterest} label="Save settings"><input name="id" type="hidden" value={id}/><input name="intent" type="hidden" value="save"/><label className="account-setting"><input type="checkbox" name="active" checked={active} onChange={e=>setActive(e.target.checked)}/>Enabled</label><label className="lform-field">Updates<select name="frequency" value={frequency} onChange={e=>setFrequency(e.target.value)}><option value="off">Saved only — no alerts</option><option value="instant">As matching jobs appear</option><option value="daily">Daily summary</option></select></label><label className="account-setting"><input type="checkbox" name="push_enabled" checked={push} onChange={e=>setPush(e.target.checked)}/>Phone push alerts</label><label className="account-setting"><input type="checkbox" name="email_enabled" checked={email} onChange={e=>setEmail(e.target.checked)}/>Email alerts</label><p className="muted">Phone push needs the installed app and notification permission. Disabled interests and Saved only send no alerts.</p></ActionForm>
}
