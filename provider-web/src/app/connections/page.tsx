import Link from '@/components/navigation-link'
import {AppShell} from '@/components/app-shell'
import {requireProvider} from '@/lib/auth'
import {loadConnections,type Connection} from '@/lib/connections-data'
import {relationshipLabels,relationshipSide} from '@shared/relationshipHistory'

export default async function ConnectionsPage({searchParams}:{searchParams:Promise<{q?:string;view?:string}>}){
 const {q='',view}=await searchParams
 const side=relationshipSide(view),label=relationshipLabels[side],base='/connections?view='+side
 const {supabase,user,profile}=await requireProvider(base)
 let rows:Connection[]=[],error=false
 try{rows=await loadConnections(supabase,user.id,side)}catch{error=true}
 const query=q.trim().toLowerCase()
 const shown=rows.filter(c=>!query||[c.person?.full_name,c.person?.region,...c.categories].some(v=>String(v??'').toLowerCase().includes(query)))
 return <AppShell providerName={profile?.full_name || 'Member'}><section className="page work-page">
  <header className="home-heading"><div><h1>{label}</h1><p className="muted">{side==='locals'?'Providers you’ve worked with':'Requesters you’ve completed work for'}</p></div>
   <Link href="/connections/invitations" className="lform-cancel">Job invitations</Link>
  </header>
  <nav className="activity-segments" aria-label="Work relationships">
   {Object.entries(relationshipLabels).map(([value,name])=><Link key={value} href={'/connections?view='+value} aria-current={side===value?'page':undefined}>{name}</Link>)}
  </nav>
  <h2>Worked together</h2>
  <form className="work-search"><input type="hidden" name="view" value={side}/><label htmlFor="connection-search">{side==='locals'?'Find a previous provider':'Find a previous customer'}</label>
   <div><input id="connection-search" name="q" defaultValue={q} maxLength={120} placeholder="Name, region or type of work"/><button className="lform-save">Search</button>{q&&<Link href={base} className="card-link">Clear search</Link>}</div>
  </form>
  {error?<div className="card" role="alert"><h2>Couldn&apos;t load work history</h2><Link href={base+'&q='+encodeURIComponent(q)} className="card-link">Retry</Link></div>
   :!shown.length?<div className="home-empty"><h2>{query?'No matches':side==='locals'?'No previous providers yet':'No previous customers yet'}</h2>
    <p>{query?'Try another name or clear your search.':'Completed jobs and bookings appear here.'}</p>
    <Link href={query?base:'/activity'} className="card-link">{query?'Clear search':'Open Activity'}</Link>
   </div>:<div className="work-grid">{shown.map(c=><Link className="card connection-card" href={'/connections/'+c.personId+'?view='+side} key={c.personId}>
    {c.person?.avatar_url?<img className="account-avatar" src={c.person.avatar_url} alt=""/>:<span className="account-avatar account-initial">{c.person?.full_name?.slice(0,1)||'?'}</span>}
    <div><h2>{c.person?.full_name||'Profile unavailable'}</h2><p>{c.person?.region}</p><strong>{c.times===1?'Worked together once':'Worked together '+c.times+' times'}</strong>
     <p>{c.categories.join(' · ')}</p><span className="card-link">View shared history →</span></div>
   </Link>)}</div>}
 </section></AppShell>
}
