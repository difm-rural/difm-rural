'use client'

import {useNavigationFeedback} from './navigation-feedback'
import {ConsolePageLoading} from './console-page-loading'
import {DevelopmentBadge} from '@/components/development-badge'


import Link from '@/components/navigation-link'
import Image from 'next/image'
import {useId,useRef,useState} from 'react'
import { usePathname } from 'next/navigation'
import { Menu, X, ChevronRight, House, ListChecks, LogOut, Search, BriefcaseBusiness, Activity, Bell, UserRound } from 'lucide-react'
import { useWebAlerts } from './web-alerts'
import {SetupNavigation} from './setup-navigation'

// Shared navigation for requester and provider workflows.
const navigation: { href: string; label: string; icon: typeof House; color?: string; colorDark?: string }[] = [
  { href: '/', label: 'Home', icon: House },
  // Amber = jobs, blue = listings — the nav icons carry the same colour code as
  // the tabs and cards (the label is always alongside). colorDark is the
  // lightened shade used on the dark desktop sidebar; color is the base shade
  // used on the light mobile tab bar.
  { href: '/jobs', label: 'Jobs', icon: BriefcaseBusiness, color: 'var(--job-icon)', colorDark: 'var(--job-icon-on-dark)' },
  { href: '/browse', label: 'Listings', icon: Search, color: 'var(--listing-icon)', colorDark: 'var(--listing-icon-on-dark)' },
  { href: '/activity', label: 'Activity', icon: Activity },
  { href: '/listings', label: 'My listings', icon: ListChecks },
  { href: '/account', label: 'Account', icon: UserRound },
]

export function AppShell({ children, providerName, setupMode=false, loading=false, refreshOnAlerts=true }: { children: React.ReactNode; providerName: string; setupMode?:boolean;loading?:boolean;refreshOnAlerts?:boolean }) {
  const pathname = usePathname()
  const feedback=useNavigationFeedback()
  const counts = useWebAlerts(!loading&&!feedback.pending,refreshOnAlerts)
  const pending=!loading?feedback.pending:null
  const displayPath=pending?.href.split('?')[0]||pathname
  const [menuPath,setMenuPath]=useState<string|null>(null)
  const menuOpen=menuPath===pathname,menuId=useId(),menuButton=useRef<HTMLButtonElement>(null)
  const primary=navigation.filter(item=>['/','/jobs','/browse','/activity','/account'].includes(item.href))
  return (
    <div className="app-shell">
      <aside className="sidebar" onKeyDown={e=>{if(e.key==='Escape'){setMenuPath(null);menuButton.current?.focus()}}}>
        <div className="sidebar-brand">
          <Image src="/brand/barn-badge-red.png" alt="" width={40} height={40} className="console-shed-icon" />
          <div><strong>Rural Connections</strong><span>Web console · <DevelopmentBadge/></span></div>
          <Link href="/notifications" className="sidebar-bell" aria-current={displayPath.startsWith('/notifications')?'page':undefined} aria-label={counts&&counts.notifications>0?counts.notifications+' notifications':'Notifications'}><Bell size={18}/>{counts&&counts.notifications>0&&<span className="web-badge" aria-hidden="true">{counts.notifications}</span>}</Link>
        </div>
        <button ref={menuButton} type="button" className="mobile-menu-toggle" aria-expanded={menuOpen} aria-controls={menuId} onClick={()=>setMenuPath(menuOpen?null:pathname)}>{menuOpen?<X size={20}/>:<Menu size={20}/>}<span>{menuOpen?'Close':'Menu'}</span>{!menuOpen&&counts&&Math.max(counts.messages,counts.notifications)>0&&<span className="web-badge">{Math.max(counts.messages,counts.notifications)}</span>}</button>
        <nav id={menuId} className={'sidebar-nav'+(menuOpen?' mobile-open':'')} aria-label="Main navigation">
          <p className="nav-label">Workspace</p>
          {setupMode?<SetupNavigation items={navigation}/>:navigation.map(item => {
            const active = item.href === '/' ? displayPath === '/' : displayPath.startsWith(item.href)
            const Icon = item.icon
            return (
              <Link key={item.href} href={item.href} aria-current={active?'page':undefined} onClick={()=>setMenuPath(null)} className={active ? 'nav-item active' : 'nav-item'}>
                <Icon size={18} style={item.colorDark?{color:item.colorDark}:undefined} /><span>{item.label}</span>{active && <ChevronRight size={15} className="nav-arrow" />}
                {counts && item.href==='/activity' && counts.messages>0 && <span className="web-badge" aria-label={counts.messages+' unread messages'}>{counts.messages}</span>}
              </Link>
            )
          })}
        </nav>
        <div className={'sidebar-user'+(menuOpen?' mobile-open':'')}>
          <div className="user-avatar">{(providerName || '?').slice(0, 1).toUpperCase()}</div>
          <div><strong>{providerName || 'Member'}</strong><span>Your account</span></div>
          <a href="/auth/signout" className="sidebar-signout" aria-label="Sign out"><LogOut size={17} aria-hidden="true"/><span>Sign out</span></a>
        </div>
      </aside>
      <main className="main-content"><div hidden={!!pending}>{children}</div>{pending&&<ConsolePageLoading destination={pending.href} slow={feedback.slow} retry={()=>window.location.assign(pending.href)}/>}</main>
      {!setupMode&&<nav className="mobile-tabbar" aria-label="Quick navigation">{primary.map(item=>{
        const active=item.href==='/'?displayPath==='/':displayPath.startsWith(item.href),Icon=item.icon
        const unread=item.href==='/activity'&&counts?counts.messages:0
        return <Link href={item.href} key={item.href} aria-current={active?'page':undefined} onClick={()=>setMenuPath(null)}><span className="mobile-tab-icon"><Icon size={21} style={item.color&&!active?{color:item.color}:undefined}/>{unread>0&&<span className="mobile-unread" aria-label={unread+' unread updates'}>{unread>99?'99+':unread}</span>}</span><span>{item.label}</span></Link>
      })}</nav>}
    </div>
  )
}
