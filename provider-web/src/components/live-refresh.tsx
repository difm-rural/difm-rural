'use client'
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'

export function LiveRefresh() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  return <button type="button" className="lform-cancel" onClick={() => startTransition(() => router.refresh())} disabled={pending}>
    <RefreshCw size={15} className={pending ? 'spin' : ''} /> {pending ? 'Refreshing…' : 'Refresh'}
  </button>
}
