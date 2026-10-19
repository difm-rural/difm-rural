'use client'
import Link from 'next/link'
export default function JobsError({reset}:{reset:()=>void}){
 return <section className="page work-page"><h1>Couldn&apos;t load this job screen</h1><p>Check your connection and try again.</p><div className="lform-actions"><button type="button" className="lform-save" onClick={reset}>Retry</button><Link href="/jobs" className="lform-cancel">Back to Jobs</Link><Link href="/activity" className="card-link">Open Activity</Link></div></section>
}
