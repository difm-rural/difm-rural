import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireProvider } from '@/lib/auth'
import { AppShell } from '@/components/app-shell'
import { loadPublicProfile } from '@/lib/profile-data'
import { LiveRefresh } from '@/components/live-refresh'
export default async function PublicReviewsPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{role?:string;page?:string}>}){
  const {supabase,profile}=await requireProvider();const {id}=await params,query=await searchParams
  const {data:p,error:profileError}=await loadPublicProfile(supabase,id)
  if(profileError)throw new Error('Could not load profile')
  if(!p)notFound()
  const role=['provider','requester'].includes(query.role || '')?query.role:null,page=Math.max(1,Number.parseInt(query.page || '1',10)||1)
  let request=supabase.from('reviews').select('id,reviewer_id,rating,comment,created_at,reviewee_role',{count:'exact'}).eq('reviewee_id',id)
  if(role)request=request.eq('reviewee_role',role)
  const {data:reviews,error,count}=await request.order('created_at',{ascending:false}).order('id',{ascending:false}).range((page-1)*20,page*20-1)
  const ids=[...new Set((reviews || []).map(r=>r.reviewer_id))]
  const people=ids.length?await supabase.from('profiles_public').select('id,full_name,display_name').in('id',ids):{data:[]}
  const names=new Map((people.data || []).map(p=>[p.id,(p.full_name || p.display_name || 'Member').split(/\s+/)[0]]))
  const base='/people/'+id+'/reviews'+(role?'?role='+role:'?role=all')
  return <AppShell providerName={profile?.full_name || 'Member'}><section className="page work-page"><Link href={'/people/'+id} className="card-link">Back to profile</Link><header className="home-heading"><div><p className="eyebrow">Reviews</p><h1>{p.full_name || p.display_name || 'Member'}&apos;s reviews</h1></div><LiveRefresh/></header>
    <nav className="activity-segments" aria-label="Review type">{[{label:'All',value:null},{label:'As provider',value:'provider'},{label:'As requester',value:'requester'}].map(r=><Link key={r.label} href={'/people/'+id+'/reviews'+(r.value?'?role='+r.value:'')} aria-current={role===r.value?'page':undefined}>{r.label}</Link>)}</nav>
    {error?<p role="alert">Could not load reviews. Refresh to try again.</p>:!reviews?.length?<div className="home-empty"><h2>{count?'No reviews on this page':'No reviews yet'}</h2><p>Reviews appear after completed work.</p>{page>1 && <Link href={base}>First page</Link>}</div>:reviews.map(r=><article className="card" key={r.id}><div className="card-head"><h2>{names.get(r.reviewer_id) || 'Member'}</h2><strong>{r.rating} / 5 ★</strong></div><p className="muted">{new Date(r.created_at).toLocaleDateString('en-NZ',{day:'numeric',month:'short',year:'numeric'})} · As {r.reviewee_role==='provider'?'provider':'requester'}</p><p className="work-description">{r.comment || 'No written comment.'}</p></article>)}
    {!error && <nav className="notification-pagination" aria-label="Review pages">{page>1 && <Link href={base+'&page='+(page-1)} className="lform-cancel">Previous</Link>}<span>Page {page}</span>{count!==null && page*20<count && <Link href={base+'&page='+(page+1)} className="lform-cancel">Next</Link>}</nav>}
  </section></AppShell>
}
