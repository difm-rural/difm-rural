'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronRight, House, ListChecks, LogOut, MessagesSquare, Search, BriefcaseBusiness, Activity } from 'lucide-react'

// Provider nav placeholders — the three screens land on these routes later.
const navigation = [
  { href: '/', label: 'Home', icon: House },
  { href: '/jobs', label: 'Jobs', icon: BriefcaseBusiness },
  { href: '/browse', label: 'Listings', icon: Search },
  { href: '/activity', label: 'Activity', icon: Activity },
  { href: '/enquiries', label: 'Messages', icon: MessagesSquare },
  { href: '/listings', label: 'My listings', icon: ListChecks },
]

export function AppShell({ children, providerName }: { children: React.ReactNode; providerName: string }) {
  const pathname = usePathname()
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark small">RC</div>
          <div><strong>Rural Connections</strong><span>Web console</span></div>
        </div>
        <nav className="sidebar-nav" aria-label="Main navigation">
          <p className="nav-label">Workspace</p>
          {navigation.map(item => {
            const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
            const Icon = item.icon
            return (
              <Link key={item.href} href={item.href} className={active ? 'nav-item active' : 'nav-item'}>
                <Icon size={18} /><span>{item.label}</span>{active && <ChevronRight size={15} className="nav-arrow" />}
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
