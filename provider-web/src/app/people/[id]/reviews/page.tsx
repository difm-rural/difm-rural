import {formatDate as nzDate} from '@shared/formatting'
import Link from '@/components/navigation-link'
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
  let request=supabase.from('reviews').select('id,reviewer_id,rating,comment,created_at,reviewee_role,job_id',{count:'exact'}).eq('reviewee_id',id)
  if(role)request=request.eq('reviewee_role',role)
  const {data:reviews,error,count}=await request.order('created_at',{ascending:false}).order('id',{ascending:false}).range((page-1)*20,page*20-1)
  const ids=[...new Set((reviews || []).map(r=>r.reviewer_id))]
  // Job titles tell reviews apart. Read through jobs_public, so a job the viewer
  // can't see simply shows no title.
  const jobIds=[...new Set((reviews || []).map(r=>r.job_id).filter(Boolean))]
  const [people,jobs]=await Promise.all([
    ids.length?supabase.from('profiles_public').select('id,full_name,display_name').in('id',ids):Promise.resolve({data:[]}),
    jobIds.length?supabase.from('jobs_public').select('id,title').in('id',jobIds):Promise.resolve({data:[]}),
  ])
  const jobTitles=new Map(((jobs.data || []) as {id:string;title:string|null}[]).map(j=>[j.id,j.title]))
  const names=new Map((people.data || []).map(p=>[p.id,(p.full_name || p.display_name || 'Member').split(/\s+/)[0]]))
  const base='/people/'+id+'/reviews'+(role?'?role='+role:'?role=all')
  return <AppShell providerName={profile?.full_name || 'Member'}><section className="page work-page"><Link href={'/people/'+id} className="card-link">Back to profile</Link><header className="home-heading"><div><h1>{p.full_name || p.display_name || 'Member'}&apos;s reviews</h1></div><LiveRefresh/></header>
    <nav className="activity-segments" aria-label="Review type">{[{label:'All',value:null},{label:'When providing',value:'provider'},{label:'When requesting',value:'requester'}].map(r=><Link key={r.label} href={'/people/'+id+'/reviews'+(r.value?'?role='+r.value:'')} aria-current={role===r.value?'page':undefined}>{r.label}</Link>)}</nav>
    {error?<p role="alert">Could not load reviews. Refresh to try again.</p>:!reviews?.length?<div className="home-empty"><h2>{count?'No reviews on this page':'No reviews yet'}</h2><p>Reviews appear after completed work.</p>{page>1 && <Link href={base}>First page</Link>}</div>:reviews.map(r=><article className="card" key={r.id}><div className="card-head"><h2>{names.get(r.reviewer_id) || 'Member'}</h2><strong aria-label={r.rating+' out of 5'}>{'★'.repeat(r.rating)+'☆'.repeat(5-r.rating)}</strong></div>{r.job_id&&jobTitles.get(r.job_id)&&<p className="review-job">For: {jobTitles.get(r.job_id)}</p>}<p className="muted">{nzDate(new Date(r.created_at))} · {r.reviewee_role==='provider'?'Reviewed for work they did':'Reviewed for a job they posted'}</p><p className="work-description">{r.comment || 'No written comment.'}</p></article>)}
    {!error && <nav className="notification-pagination" aria-label="Review pages">{page>1 && <Link href={base+'&page='+(page-1)} className="lform-cancel">Previous</Link>}<span>Page {page}</span>{count!==null && page*20<count && <Link href={base+'&page='+(page+1)} className="lform-cancel">Next</Link>}</nav>}
  </section></AppShell>
}
