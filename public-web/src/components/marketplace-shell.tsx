import Link from 'next/link'
import type {ReactNode} from 'react'
import {consoleLink} from '@/lib/console-link'
export function MarketplaceShell({children}:{children:ReactNode}){return <><header className="site-header public-header"><Link href="/" className="brand"><strong>Rural Connections</strong></Link><nav aria-label="Main navigation"><Link href="/jobs">Jobs</Link><Link href="/listings">Listings</Link><a href={consoleLink('/jobs/new')}>Post a job</a><a href={consoleLink()}>Sign in</a></nav></header><main className="marketplace">{children}</main><footer className="public-footer"><Link href="/">Home</Link><Link href="/privacy">Privacy</Link><a href="mailto:hello@ruralconnections.nz">Help & feedback</a><a href="difmrural://">Open the mobile app</a></footer></>}
