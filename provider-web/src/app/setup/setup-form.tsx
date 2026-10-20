'use client'
import { useActionState, useState } from 'react'
import { finishSetup } from './actions'
export function SetupForm({name='',region='',next}:{name?:string;region?:string;next:string}){
  const [publicName,setName]=useState(name),[location,setLocation]=useState(region)
  const [state,action,pending]=useActionState(finishSetup,{error:''})
  return <form action={action} className="lform"><input type="hidden" name="next" value={next}/>
    <fieldset className="work-fieldset" disabled={pending}>
      <label htmlFor="public-name">Public name</label><input id="public-name" name="name" autoComplete="name" required maxLength={80} value={publicName} onChange={e=>setName(e.target.value)}/>
      <label htmlFor="region">Town or region</label><input id="region" name="region" autoComplete="address-level2" required maxLength={120} value={location} onChange={e=>setLocation(e.target.value)}/>
      <p className="muted">Your name and town or region appear on your public profile. A town or region is enough; do not enter your street address.</p>
      <p className="muted">Photo, skills, qualifications and notification preferences are optional. Add them later in Account.</p>
      {state.error && <p className="form-error" role="alert">{state.error}</p>}
      {next!=='/'?<button className="lform-save" name="intent" value="continue">{pending?'Saving…':'Save and continue'}</button>:<div className="setup-actions"><button className="lform-save" name="intent" value="post_job">Post a job</button><button className="lform-save" name="intent" value="listings">Browse listings</button><button className="lform-save" name="intent" value="home">Explore the app</button></div>}
      <button type="submit" className="back-email" formNoValidate name="intent" value="later">{pending?'Saving…':'Finish setup later'}</button>
    </fieldset>
  </form>
}
