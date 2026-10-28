import Link from 'next/link'
import Image from 'next/image'
import type {ReactNode} from 'react'
import {consoleLink} from '@/lib/console-link'
import {GuestNavigation} from './guest-navigation'
export function MarketplaceShell({children,home=false}:{children:ReactNode;home?:boolean}){return <div className="guest-app"><header className="guest-topbar"><div className="guest-topbar-inner"><Link href="/" className="guest-wordmark" aria-label="Rural Connections home"><Image src="/brand/barn-badge-red.png" alt="" width={44} height={44} className="guest-shed-icon"/><div className="guest-wordmark-copy">Rural Connections<span>GET JOBS DONE</span></div></Link><div className="guest-account-links"><a href={consoleLink()}>Sign in</a><a href={consoleLink()} className="guest-join">Sign up</a></div></div></header><GuestNavigation/><main className={'marketplace '+(home?'guest-home':'guest-content')}>{children}</main><footer className="public-footer"><Link href="/">Home</Link><Link href="/privacy">Privacy</Link><a href="mailto:hello@ruralconnections.nz">Help & feedback</a><a href="difmrural://">Open the mobile app</a></footer></div>}
