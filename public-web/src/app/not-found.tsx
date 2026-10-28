import Link from 'next/link'
import {MarketplaceShell} from '@/components/marketplace-shell'
export default function NotFound(){return <MarketplaceShell><h1>This item is no longer available</h1><p>It may have been closed, removed or made private.</p><div className="public-actions"><Link className="button primary" href="/listings">Browse listings</Link><Link className="button secondary" href="/jobs">Browse jobs</Link></div></MarketplaceShell>}
