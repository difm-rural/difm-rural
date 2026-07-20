'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BarChart3, BellRing, ChevronRight, LayoutDashboard, LogOut, Megaphone, ShieldCheck } from 'lucide-react'

const navigation = [
  { href: '/', label: 'Overview', icon: LayoutDashboard },
  { href: '/campaigns', label: 'Campaigns', icon: Megaphone },
]

export function AppShell({ children, adminName }: { children: React.ReactNode; adminName: string }) {
  const pathname = usePathname()
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark small">RC</div>
          <div><strong>Rural Connections</strong><span>Admin console</span></div>
        </div>
        <nav className="sidebar-nav" aria-label="Admin navigation">
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
          <p className="nav-label monitor-label">Monitor</p>
          <div className="nav-item muted-item"><BarChart3 size={18} /><span>Lifecycle history</span><em>Collecting</em></div>
          <div className="nav-item muted-item"><BellRing size={18} /><span>Delivery health</span><em>Next</em></div>
        </nav>
        <div className="sidebar-security"><ShieldCheck size={17} /><span>Protected by Supabase admin policies</span></div>
        <div className="sidebar-user">
          <div className="user-avatar">{adminName.slice(0, 1).toUpperCase()}</div>
          <div><strong>{adminName}</strong><span>Administrator</span></div>
          <a href="/auth/signout" aria-label="Sign out"><LogOut size={17} /></a>
        </div>
      </aside>
      <main className="main-content">{children}</main>
    </div>
  )
}
