'use client'
import { useActionState, useEffect, useRef, type FormEvent, type ReactNode } from 'react'
export type ActionState = { error: string; success?: string }

export function useSubmitGuard(state: ActionState, blocked: boolean) {
  const submitting = useRef(false)
  useEffect(() => { submitting.current = false }, [state])
  return (event: FormEvent<HTMLFormElement>) => {
    if (blocked || submitting.current) event.preventDefault()
    else submitting.current = true
  }
}

export function ActionForm({ action, label, children, disabled=false, pendingLabel='Saving…' }: {
  action: (state: ActionState, data: FormData) => Promise<ActionState>; label: string; children?: ReactNode; disabled?:boolean; pendingLabel?:string
}) {
  const [state, submit, pending] = useActionState(action, { error: '' })
  const guardSubmit = useSubmitGuard(state, pending || disabled)
  return <form action={submit} onSubmit={guardSubmit} aria-busy={pending} className="lform"><fieldset disabled={pending || disabled} className="work-fieldset">{children}</fieldset>
    {state.error && <p className="form-error" role="alert">{state.error}</p>}
    {state.success && <p className="home-clear" role="status">{state.success}</p>}
    <button className="lform-save" disabled={pending || disabled}>{pending ? pendingLabel : label}</button>
  </form>
}
