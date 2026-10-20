'use client'
import Link from 'next/link'
export default function ConnectionsError({reset}:{reset:()=>void}){return <section className="page work-page"><h1>Couldn&apos;t load connections</h1><p>Check your connection and try again.</p><div className="lform-actions"><button className="lform-save" onClick={reset}>Retry</button><Link href="/connections" className="card-link">Back to Connections</Link></div></section>}
