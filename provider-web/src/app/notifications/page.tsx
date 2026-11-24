import {arrangementTime} from '@shared/notificationArrangement'
import {formatDateTime as nzDateTime} from '@shared/formatting'
import {notificationBody} from '@shared/notificationBody'
import {notificationIconKey} from '@shared/notificationIcons'
import {groupByDay, relativeTime} from '@shared/notificationGroups'
import {notificationSide, sideTag} from '@shared/marketSide'
import Link from '@/components/navigation-link'
import { Bell } from 'lucide-react'
import { requireProvider } from '@/lib/auth'
import { notificationHref } from '@/lib/work'
import { AppShell } from '@/components/app-shell'
import { LiveRefresh } from '@/components/live-refresh'
import { MarkAllRead, NotificationRow, type NotificationRowData } from '@/components/notification-action'
import { answerAvailabilityCheck, markNotificationRead, updateNotification } from './actions'

const PAGE_SIZE=30

export const dynamic='force-dynamic'
export default async function NotificationsPage({searchParams}:{searchParams:Promise<{filter?:string;page?:string}>}){
  const {supabase,user,profile}=await requireProvider();const params=await searchParams
  const unread=params.filter==='unread',page=Math.max(1,Math.min(10000,Number.parseInt(params.page || '1',10) || 1))
  let q=supabase.from('notifications').select('id,type,body,metadata,read,created_at',{count:'exact'}).eq('user_id',user.id)
  if(unread)q=q.eq('read',false)
  const [{data,error,count},{data:latest,error:latestError,count:unreadCount}]=await Promise.all([
    q.order('created_at',{ascending:false}).order('id',{ascending:false}).range((page-1)*PAGE_SIZE,page*PAGE_SIZE-1),
    // Newest unread row (the "Mark all read" cutoff) plus the unread total.
    supabase.from('notifications').select('created_at',{count:'exact'}).eq('user_id',user.id).eq('read',false).order('created_at',{ascending:false}).limit(1),
  ])
  const base='/notifications?filter='+(unread?'unread':'all')
  const pages=count?Math.ceil(count/PAGE_SIZE):1
  const now=new Date()
  const rows:NotificationRowData[]=(data || []).map(n=>{
    const side=notificationSide(n)
    return {id:n.id,type:n.type,href:notificationHref(n),read:!!n.read,body:notificationBody(n),arrangement:arrangementTime(n),
      iconKey:notificationIconKey(n.type),side,tag:sideTag(side,n),
      created_at:n.created_at,relative:relativeTime(n.created_at,now),fullDate:nzDateTime(n.created_at)}
  })
  return <AppShell providerName={profile?.full_name || 'Member'}><section className="page work-page">
    <header className="home-heading"><div><h1>Notifications</h1></div>
      <div className="notification-header-actions">
        {!latestError && latest?.[0] && <MarkAllRead action={updateNotification} cutoff={latest[0].created_at}/>}
        <LiveRefresh/>
      </div>
    </header>
    <nav className="activity-segments" aria-label="Notification filter">
      <Link href="/notifications" aria-current={!unread?'page':undefined}>All</Link>
      <Link href="/notifications?filter=unread" aria-current={unread?'page':undefined}>Unread{!latestError && !!unreadCount && <span aria-label={unreadCount+' unread'}>{unreadCount}</span>}</Link>
    </nav>
    {error?<div className="card" role="alert"><h2>Couldn&apos;t load notifications</h2><p>Check your connection and use Refresh to retry.</p></div>:!rows.length?<div className="home-empty"><Bell size={28}/><h2>{count? 'No notifications on this page':unread?'All caught up':'No notifications here yet'}</h2><p>{count?'Return to the first page to see your notifications.':unread?'You have no unread notifications.':'Messages, offers and booking updates will appear here.'}</p>{page>1 && <Link href={base} className="card-link">First page</Link>}</div>
    :<div className="notification-groups">{groupByDay(rows,now).map(group=><section key={group.label} className="notification-group" aria-labelledby={'notif-'+group.label.replace(' ','-')}>
      <h2 id={'notif-'+group.label.replace(' ','-')} className="notification-group-heading">{group.label}</h2>
      <ul className="notification-list">{group.items.map(n=><NotificationRow key={n.id} n={n} markRead={markNotificationRead} answerAvailability={n.type==='availability_check'?answerAvailabilityCheck:undefined}/>)}</ul>
    </section>)}</div>}
    {!error && count!==null && count>PAGE_SIZE && <nav className="notification-pagination" aria-label="Notification pages">
      {page>1 && <Link className="lform-cancel" href={base+'&page='+(page-1)}>Previous</Link>}
      <span>Page {page} of {pages}</span>
      {page<pages && <Link className="lform-cancel" href={base+'&page='+(page+1)}>Next</Link>}
    </nav>}
  </section></AppShell>
}
