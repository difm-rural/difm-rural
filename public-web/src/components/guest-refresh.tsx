'use client'
import {useTransition} from 'react'
import {useRouter} from 'next/navigation'
import {RefreshCw} from 'lucide-react'
export function GuestRefresh({label='Refresh',className='guest-refresh'}:{label?:string;className?:string}){
  const router=useRouter(),[pending,startTransition]=useTransition()
  return <button type="button" className={className} disabled={pending} aria-label={label==='Refresh'?'Refresh jobs and listings':label} onClick={()=>startTransition(()=>router.refresh())}><RefreshCw size={16} aria-hidden="true"/>{pending?'Refreshing…':label}</button>
}
