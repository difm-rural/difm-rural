'use client'
import Link from '@/components/navigation-link'
export default function ConnectionsError({reset}:{reset:()=>void}){return <section className="page work-page"><h1>Couldn&apos;t load work history</h1><p>Check your connection and try again.</p><div className="lform-actions"><button className="lform-save" onClick={reset}>Retry</button><Link href="/" className="card-link">Back to Home</Link></div></section>}
