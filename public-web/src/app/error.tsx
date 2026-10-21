'use client'
import Link from 'next/link'
export default function ErrorPage({reset}:{reset:()=>void}){return <main className="marketplace"><h1>Couldn&apos;t load this page</h1><p>Check your connection and try again.</p><div className="public-actions"><button className="button primary" onClick={reset}>Retry</button><Link href="/listings">Browse listings</Link><Link href="/jobs">Browse jobs</Link></div></main>}
