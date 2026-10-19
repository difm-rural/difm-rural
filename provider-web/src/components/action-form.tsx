'use client'
import { useActionState, type ReactNode } from 'react'
export type ActionState = { error: string; success?: string }
export function ActionForm({ action, label, children, disabled=false }: {
  action: (state: ActionState, data: FormData) => Promise<ActionState>; label: string; children?: ReactNode; disabled?:boolean
}) {
  const [state, submit, pending] = useActionState(action, { error: '' })
  return <form action={submit} className="lform"><fieldset disabled={pending || disabled} className="work-fieldset">{children}</fieldset>
    {state.error && <p className="form-error" role="alert">{state.error}</p>}
    {state.success && <p className="home-clear" role="status">{state.success}</p>}
    <button className="lform-save" disabled={pending || disabled}>{pending ? 'Saving…' : label}</button>
  </form>
}
