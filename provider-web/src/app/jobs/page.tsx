import Link from 'next/link'
import { AppShell } from '@/components/app-shell'
import { requireProvider } from '@/lib/auth'
export const dynamic='force-dynamic'
export default async function JobsPage({searchParams}:{searchParams:Promise<{q?:string}>}) {
  const {supabase,profile}=await requireProvider();const {q=''}=await searchParams
  let query=supabase.from('jobs_public').select('id,title,description,category,location_name,location_area,price_type,price,created_at').eq('status','open').order('created_at',{ascending:false}).limit(60)
  if(q.trim())query=query.ilike('title','%'+q.trim().replace(/[\\%_]/g,'\\$&')+'%')
  const {data,error}=await query
  return <AppShell providerName={profile?.full_name || 'Member'}><section className="page"><header className="home-heading"><div><p className="eyebrow">Jobs</p><h1>Find local work</h1><p className="muted">Open jobs from people in your community</p></div><Link href="/jobs/new" className="lform-save">Post a job</Link></header>
    <form className="work-search"><label htmlFor="job-search">Search jobs</label><div><input id="job-search" name="q" defaultValue={q} placeholder="e.g. fencing or mowing"/><button className="lform-save">Search</button>{q && <Link className="card-link" href="/jobs">Clear search</Link>}</div></form>
    {error ? <div role="alert" className="card"><h2>Couldn&apos;t load jobs</h2><p>Check your connection and try again.</p><Link className="card-link" href={'/jobs?q='+encodeURIComponent(q)}>Retry</Link></div>
    : !data?.length ? <div className="home-empty"><h2>{q?'No jobs match “'+q+'”':'No open jobs yet'}</h2><p>{q?'Try another word or clear your search.':'Check back soon or post work you need done.'}</p></div>
    : <div className="work-grid">{data.map(j=><Link key={j.id} href={'/jobs/'+j.id} className="card work-result"><span className="kind-tag">{j.category}</span><h2>{j.title}</h2><p className="work-clamp">{j.description}</p><p className="muted">{j.location_area || j.location_name || 'Location to be arranged'}</p><strong>{j.price_type==='fixed'?'$'+j.price+' NZD':'Open to offers'}</strong><span className="card-link">View job →</span></Link>)}</div>}
  </section></AppShell>
}
