'use client'
import { useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'

export function LiveRefresh() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') router.refresh() }
    const timer = window.setInterval(refresh, 15000)
    window.addEventListener('focus', refresh)
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh) }
  }, [router])
  return <button type="button" className="lform-cancel" onClick={() => startTransition(() => router.refresh())} disabled={pending}>
    <RefreshCw size={15} className={pending ? 'spin' : ''} /> {pending ? 'Refreshing…' : 'Refresh'}
  </button>
}
