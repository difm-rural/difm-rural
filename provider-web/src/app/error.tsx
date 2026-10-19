'use client'
export default function ErrorPage({reset}:{reset:()=>void}) {
  return <main className="message-page"><section className="message-card"><h1>Couldn&apos;t load this page</h1><p>Check your connection and try again.</p><button type="button" className="lform-save" onClick={reset}>Retry</button></section></main>
}
