'use client'
import Link from 'next/link'
import {MarketplaceShell} from '@/components/marketplace-shell'
export default function ErrorPage({reset}:{reset:()=>void}){return <MarketplaceShell><h1>Couldn&apos;t load this page</h1><p>Check your connection and try again.</p><div className="public-actions"><button className="button primary" onClick={reset}>Retry</button><Link href="/listings">Browse listings</Link><Link href="/jobs">Browse jobs</Link></div></MarketplaceShell>}
