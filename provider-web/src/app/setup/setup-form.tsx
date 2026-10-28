'use client'
import { useActionState, useState } from 'react'
import { finishSetup } from './actions'
export function SetupForm({name='',region='',next}:{name?:string;region?:string;next:string}){
  const [publicName,setName]=useState(name),[location,setLocation]=useState(region)
  const [state,action,pending]=useActionState(finishSetup,{error:''})
  return <form action={action} className="lform"><input type="hidden" name="next" value={next}/>
    <fieldset className="work-fieldset" disabled={pending}>
      <label className="lform-field" htmlFor="public-name">Public name<input id="public-name" name="name" autoComplete="name" required maxLength={80} value={publicName} onChange={e=>setName(e.target.value)}/></label>
      <label className="lform-field" htmlFor="region">Town or region<input id="region" name="region" autoComplete="address-level2" required maxLength={120} value={location} onChange={e=>setLocation(e.target.value)}/></label>
      <p className="muted">Your name and town or region appear on your public profile. A town or region is enough; do not enter your street address.</p>
      <p className="muted">Photo, skills, qualifications and notification preferences are optional. Add them later in Account.</p>
      {state.error && <p className="form-error" role="alert">{state.error}</p>}
      <button type="submit" className="lform-save setup-save" name="intent" value="continue">{pending?'Saving…':'Save profile and continue'}</button>
      {next==='/'&&<div className="setup-actions"><button type="submit" className="lform-cancel" name="intent" value="post_job">Save and post a job</button><button type="submit" className="lform-cancel" name="intent" value="listings">Save and browse listings</button></div>}
      <button type="submit" className="setup-later" formNoValidate name="intent" value="later">{pending?'Saving…':'Finish setup later'}</button>
      <p className="muted setup-later-hint">Finish setup later leaves these edits unsaved. You can return from Account.</p>
    </fieldset>
  </form>
}
