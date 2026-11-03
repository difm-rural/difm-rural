'use client'

import {DevelopmentBadge} from '@/components/development-badge'


import Link from 'next/link'
import Image from 'next/image'
import {useId,useRef,useState} from 'react'
import { usePathname } from 'next/navigation'
import { Menu, X, ChevronRight, House, ListChecks, LogOut, MessagesSquare, Search, BriefcaseBusiness, Activity, Bell, UserRound, UsersRound } from 'lucide-react'
import { useWebAlerts } from './web-alerts'
import {SetupNavigation} from './setup-navigation'

// Shared navigation for requester and provider workflows.
const navigation = [
  { href: '/', label: 'Home', icon: House },
  { href: '/jobs', label: 'Jobs', icon: BriefcaseBusiness },
  { href: '/browse', label: 'Listings', icon: Search },
  { href: '/activity', label: 'Activity', icon: Activity },
  { href: '/connections', label: 'Connections', icon: UsersRound },
  { href: '/messages', label: 'Messages', icon: MessagesSquare },
  { href: '/notifications', label: 'Notifications', icon: Bell },
  { href: '/listings', label: 'My listings', icon: ListChecks },
  { href: '/account', label: 'Account', icon: UserRound },
]

export function AppShell({ children, providerName, setupMode=false }: { children: React.ReactNode; providerName: string; setupMode?:boolean }) {
  const pathname = usePathname()
  const counts = useWebAlerts()
  const [menuPath,setMenuPath]=useState<string|null>(null)
  const menuOpen=menuPath===pathname,menuId=useId(),menuButton=useRef<HTMLButtonElement>(null)
  const primary=navigation.filter(item=>['/','/jobs','/browse','/activity','/account'].includes(item.href))
  return (
    <div className="app-shell">
      <aside className="sidebar" onKeyDown={e=>{if(e.key==='Escape'){setMenuPath(null);menuButton.current?.focus()}}}>
        <div className="sidebar-brand">
          <Image src="/brand/barn-badge-red.png" alt="" width={40} height={40} className="console-shed-icon" />
          <div><strong>Rural Connections</strong><span>Web console · <DevelopmentBadge/></span></div>
        </div>
        <button ref={menuButton} type="button" className="mobile-menu-toggle" aria-expanded={menuOpen} aria-controls={menuId} onClick={()=>setMenuPath(menuOpen?null:pathname)}>{menuOpen?<X size={20}/>:<Menu size={20}/>}<span>{menuOpen?'Close':'Menu'}</span>{!menuOpen&&counts&&Math.max(counts.messages,counts.notifications)>0&&<span className="web-badge">{Math.max(counts.messages,counts.notifications)}</span>}</button>
        <nav id={menuId} className={'sidebar-nav'+(menuOpen?' mobile-open':'')} aria-label="Main navigation">
          <p className="nav-label">Workspace</p>
          {setupMode?<SetupNavigation items={navigation}/>:navigation.map(item => {
            const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
            const Icon = item.icon
            return (
              <Link key={item.href} href={item.href} aria-current={active?'page':undefined} onClick={()=>setMenuPath(null)} className={active ? 'nav-item active' : 'nav-item'}>
                <Icon size={18} /><span>{item.label}</span>{active && <ChevronRight size={15} className="nav-arrow" />}
                {counts && (item.href==='/messages'?counts.messages:item.href==='/notifications'?counts.notifications:0)>0 && <span className="web-badge" aria-label={(item.href==='/messages'?counts.messages:counts.notifications)+' unread'}>{item.href==='/messages'?counts.messages:counts.notifications}</span>}
              </Link>
            )
          })}
        </nav>
        <div className={'sidebar-user'+(menuOpen?' mobile-open':'')}>
          <div className="user-avatar">{(providerName || '?').slice(0, 1).toUpperCase()}</div>
          <div><strong>{providerName || 'Member'}</strong><span>Your account</span></div>
          <a href="/auth/signout" aria-label="Sign out"><LogOut size={17} /></a>
        </div>
      </aside>
      <main className="main-content">{children}</main>
      {!setupMode&&<nav className="mobile-tabbar" aria-label="Quick navigation">{primary.map(item=>{
        const active=item.href==='/'?pathname==='/':pathname.startsWith(item.href),Icon=item.icon
        const unread=item.href==='/activity'&&counts?Math.max(counts.messages,counts.notifications):0
        return <Link href={item.href} key={item.href} aria-current={active?'page':undefined} onClick={()=>setMenuPath(null)}><span className="mobile-tab-icon"><Icon size={21}/>{unread>0&&<span className="mobile-unread" aria-label={unread+' unread updates'}>{unread>99?'99+':unread}</span>}</span><span>{item.label}</span></Link>
      })}</nav>}
    </div>
  )
}
