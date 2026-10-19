'use client'
import Link from 'next/link'
export default function ListingError({reset}:{reset:()=>void}){return <section className="page work-page"><h1>Couldn&apos;t load listings</h1><p>Check your connection and try again.</p><div className="lform-actions"><button className="lform-save" onClick={reset}>Retry</button><Link className="lform-cancel" href="/browse">Back to listings</Link></div></section>}
