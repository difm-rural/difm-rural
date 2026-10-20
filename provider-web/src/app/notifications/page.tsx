import Link from 'next/link'
import { Bell, MessageSquare } from 'lucide-react'
import { requireProvider } from '@/lib/auth'
import { AppShell } from '@/components/app-shell'
import { LiveRefresh } from '@/components/live-refresh'
import { ActionForm } from '@/components/action-form'
import { updateNotification, visitNotification } from './actions'

export const dynamic='force-dynamic'
export default async function NotificationsPage({searchParams}:{searchParams:Promise<{filter?:string;page?:string}>}){
  const {supabase,user,profile}=await requireProvider();const params=await searchParams
  const unread=params.filter==='unread',page=Math.max(1,Math.min(10000,Number.parseInt(params.page || '1',10) || 1))
  let q=supabase.from('notifications').select('id,type,body,metadata,read,created_at',{count:'exact'}).eq('user_id',user.id)
  if(unread)q=q.eq('read',false)
  const [{data,error,count},{data:latest,error:latestError}]=await Promise.all([
    q.order('created_at',{ascending:false}).order('id',{ascending:false}).range((page-1)*30,page*30-1),
    supabase.from('notifications').select('created_at').eq('user_id',user.id).eq('read',false).order('created_at',{ascending:false}).limit(1),
  ])
  const base='/notifications?filter='+(unread?'unread':'all')
  return <AppShell providerName={profile?.full_name || 'Member'}><section className="page work-page">
    <header className="home-heading"><div><p className="eyebrow">Your updates</p><h1>Notifications</h1></div><LiveRefresh/></header>
    <nav className="activity-segments" aria-label="Notification filter"><Link href="/notifications" aria-current={!unread?'page':undefined}>All</Link><Link href="/notifications?filter=unread" aria-current={unread?'page':undefined}>Unread</Link></nav>
    {!latestError && latest?.[0] && <ActionForm action={updateNotification} label="Mark all read"><input type="hidden" name="all" value="true"/><input type="hidden" name="cutoff" value={latest[0].created_at}/></ActionForm>}
    {error?<div className="card" role="alert"><h2>Couldn&apos;t load notifications</h2><p>Check your connection and use Refresh to retry.</p></div>:!data?.length?<div className="home-empty"><Bell size={28}/><h2>{count? 'No notifications on this page':unread?'All caught up':'No notifications here yet'}</h2><p>{count?'Return to the first page to see your notifications.':unread?'You have no unread notifications.':'Messages, offers and booking updates will appear here.'}</p>{page>1 && <Link href={base} className="card-link">First page</Link>}</div>
    :<ul className="notification-list">{data.map(n=>{const meta=n.metadata || {},openable=!!(meta.job_id || meta.booking_id || meta.service_id || meta.saved_interest_id || meta.availability_prompt || n.type==='availability_check');return <li key={n.id} className={'card notification-item '+(n.read?'':'unread')}>
      <div className="notification-body">{n.type==='new_message'?<MessageSquare size={20}/>:<Bell size={20}/>}<div><p>{n.body}</p><time dateTime={n.created_at}>{new Date(n.created_at).toLocaleString('en-NZ',{day:'numeric',month:'short',year:'numeric',hour:'numeric',minute:'2-digit'})}</time></div>{!n.read && <span className="notification-dot" aria-label="Unread"/>}</div>
      <div className="notification-actions">{openable && <ActionForm action={visitNotification} label={n.type==='new_message'?'Open conversation':'View details'}><input type="hidden" name="id" value={n.id}/></ActionForm>}
        {!n.read && <ActionForm action={updateNotification} label="Mark read"><input type="hidden" name="id" value={n.id}/></ActionForm>}
      </div>
      {n.type==='availability_check' && <p className="muted">Update your work availability in Account.</p>}
    </li>})}</ul>}
    {!error && <nav className="notification-pagination" aria-label="Notification pages">{page>1 && <Link className="lform-cancel" href={base+'&page='+(page-1)}>Previous</Link>}<span>Page {page}</span>{count!==null && page*30<count && <Link className="lform-cancel" href={base+'&page='+(page+1)}>Next</Link>}</nav>}
  </section></AppShell>
}
