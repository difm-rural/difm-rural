import Link from 'next/link'
export default function NotFound(){return <main className="marketplace"><h1>This item is no longer available</h1><p>It may have been closed, removed or made private.</p><div className="public-actions"><Link className="button primary" href="/listings">Browse listings</Link><Link className="button secondary" href="/jobs">Browse jobs</Link></div></main>}
