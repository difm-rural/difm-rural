'use client'
import {useEffect} from 'react'
import {AppShell} from '@/components/app-shell'
import {useNavigationFeedback} from '@/components/navigation-feedback'
import Link from '@/components/navigation-link'
export default function ErrorPage({reset}:{reset:()=>void}){
 const {settle}=useNavigationFeedback()
 useEffect(()=>{settle()},[settle])
 return <AppShell providerName="Your account" loading><section className="page work-page"><p className="eyebrow">Rural Connections</p><h1>Couldn&apos;t load this screen</h1><p>The screen could not finish loading. Check your connection, then retry. If your session has expired, you’ll be taken to sign in automatically.</p><div className="lform-actions"><button className="lform-save" onClick={reset}>Retry</button><Link href="/" className="card-link">Go to Home</Link></div></section></AppShell>
}
