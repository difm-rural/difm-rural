'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { ChevronRight, House, ListChecks, LogOut, MessagesSquare, Search, BriefcaseBusiness, Activity, Bell, UserRound, UsersRound } from 'lucide-react'
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
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <Image src="/brand/barn-badge-red.png" alt="" width={40} height={40} className="console-shed-icon" />
          <div><strong>Rural Connections</strong><span>Web console</span></div>
        </div>
        <nav className="sidebar-nav" aria-label="Main navigation">
          <p className="nav-label">Workspace</p>
          {setupMode?<SetupNavigation items={navigation}/>:navigation.map(item => {
            const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
            const Icon = item.icon
            return (
              <Link key={item.href} href={item.href} className={active ? 'nav-item active' : 'nav-item'}>
                <Icon size={18} /><span>{item.label}</span>{active && <ChevronRight size={15} className="nav-arrow" />}
                {counts && (item.href==='/messages'?counts.messages:item.href==='/notifications'?counts.notifications:0)>0 && <span className="web-badge" aria-label={(item.href==='/messages'?counts.messages:counts.notifications)+' unread'}>{item.href==='/messages'?counts.messages:counts.notifications}</span>}
              </Link>
            )
          })}
        </nav>
        <div className="sidebar-user">
          <div className="user-avatar">{(providerName || '?').slice(0, 1).toUpperCase()}</div>
          <div><strong>{providerName || 'Member'}</strong><span>Your account</span></div>
          <a href="/auth/signout" aria-label="Sign out"><LogOut size={17} /></a>
        </div>
      </aside>
      <main className="main-content">{children}</main>
    </div>
  )
}
