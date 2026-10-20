'use client'
import Link from 'next/link'
export default function ErrorPage({reset}:{reset:()=>void}){
 return <main className="page work-page"><p className="eyebrow">Rural Connections</p><h1>Couldn&apos;t load this screen</h1><p>Check your connection and try again.</p><div className="lform-actions"><button className="lform-save" onClick={reset}>Retry</button><Link href="/" className="card-link">Go to Home</Link><Link href="/login" className="card-link">Sign in</Link></div></main>
}
