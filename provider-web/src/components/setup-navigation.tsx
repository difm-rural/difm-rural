'use client'
import {useActionState} from 'react'
import type {LucideIcon} from 'lucide-react'
import {finishSetup} from '@/app/setup/actions'

export function SetupNavigation({items}:{items:{href:string;label:string;icon:LucideIcon}[]}){
  const [state,action,pending]=useActionState(finishSetup,{error:''})
  return <><p className="setup-nav-hint">Navigation skips setup for now. Use Save profile to keep your changes.</p>
    <form action={action}><input type="hidden" name="intent" value="later"/>
      <fieldset className="setup-nav-items" disabled={pending}>{items.map(item=><button key={item.href} type="submit" name="next" value={item.href} className="nav-item"><item.icon size={18}/><span>{item.label}</span></button>)}</fieldset>
      {pending&&<p className="setup-nav-hint" role="status">Opening your destination…</p>}
      {state.error&&<p className="setup-nav-error" role="alert">{state.error}</p>}
    </form>
  </>
}
