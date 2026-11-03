'use client'
import {useEffect,useState} from 'react'
import {usePathname} from 'next/navigation'
import Image from 'next/image'
import {AppShell} from './app-shell'
import {ConsolePageLoading} from './console-page-loading'
export function ConsoleLoading(){
 const pathname=usePathname()
 const [slow,setSlow]=useState(false)
 useEffect(()=>{const timer=setTimeout(()=>setSlow(true),10000);return ()=>clearTimeout(timer)},[])
 if(pathname==='/login'||pathname.startsWith('/auth/'))return <main className="login-panel" style={{minHeight:'100svh'}}><section className="login-card" role="status"><Image src="/brand/barn-badge-red.png" alt="" width={52} height={52}/><h1>Rural Connections</h1><p>Loading sign-in…</p>{slow&&<button className="lform-cancel" onClick={()=>window.location.reload()}>Try again</button>}</section></main>
 return <AppShell providerName="Loading account…" loading><ConsolePageLoading destination={pathname} slow={slow} retry={()=>window.location.reload()}/></AppShell>
}
