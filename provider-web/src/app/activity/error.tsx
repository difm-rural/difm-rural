'use client'
import Link from 'next/link'
export default function ActivityError({reset}:{reset:()=>void}){return <section className="page work-page"><h1>Couldn&apos;t load this arrangement</h1><p>Check your connection and try again.</p><div className="lform-actions"><button className="lform-save" onClick={reset}>Retry</button><Link className="lform-cancel" href="/activity">Back to Activity</Link></div></section>}
