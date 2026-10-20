import Link from 'next/link'
import { UserRound, CalendarClock, Bell, CircleHelp, ArrowRight, Star } from 'lucide-react'
import { requireProvider } from '@/lib/auth'
import { AppShell } from '@/components/app-shell'
import { availabilityDisplay } from '@shared/providerAvailability'
export const dynamic='force-dynamic'
export default async function AccountPage(){
  const {supabase,user,profile}=await requireProvider()
  const [{data:p,error},{data:reviews,error:reviewError}]=await Promise.all([
    supabase.from('profiles').select('id,full_name,display_name,avatar_url,region,created_at,availability_status,availability_until,availability_updated_at').eq('id',user.id).single(),
    supabase.from('reviews').select('rating').eq('reviewee_id',user.id),
  ])
  const count=reviews?.length || 0,average=count?(reviews || []).reduce((sum,r)=>sum+r.rating,0)/count:0
  const availability=availabilityDisplay(p?.availability_status,p?.availability_until,p?.availability_updated_at)
  const items=[{href:'/account/profile',title:'Profile',sub:'Public name, photo, bio, skills and private contact details',icon:UserRound},{href:'/account/availability',title:'Work availability',sub:availability.label,icon:CalendarClock},{href:'/account/notifications',title:'Notification preferences',sub:'Email updates, job alerts and interests',icon:Bell},{href:'/account/interests',title:'Saved interests',sub:'Saved job searches and alert settings',icon:Bell},{href:'/jobs/saved',title:'Saved jobs',sub:'Jobs you want to revisit',icon:Star},{href:'/account/help',title:'Help & feedback',sub:'How it works, questions and feedback',icon:CircleHelp}]
  return <AppShell providerName={profile?.full_name || 'Member'}><section className="page work-page"><p className="eyebrow">Your account</p><h1>Account</h1>
    {error?<p role="alert">Could not load your profile. Refresh to try again.</p>:<article className="card account-summary">{p?.avatar_url?<img className="account-avatar" src={p.avatar_url} alt="Your profile photo"/>:<span className="account-avatar account-initial">{p?.full_name?.slice(0,1) || '?'}</span>}<div><h2>{p?.full_name || p?.display_name || 'Your profile'}</h2><p>{p?.region || 'Add your town or region'}</p><Link href={'/people/'+user.id} className="card-link">View your public profile →</Link></div></article>}
    <nav className="account-menu" aria-label="Account settings">{items.map(item=><Link href={item.href} className="card home-quick" key={item.href}><item.icon size={22}/><span><strong>{item.title}</strong><small>{item.sub}</small></span><ArrowRight size={18}/></Link>)}</nav>
    <Link href={'/people/'+user.id+'/reviews'} className="card home-quick"><Star size={22}/><span><strong>My reviews</strong><small>{reviewError?'View reviews':count?average.toFixed(1)+' out of 5 · '+count+' reviews':'No reviews yet'}</small></span><ArrowRight size={18}/></Link>
    <p className="muted">Signed in as {user.email}. Use the same account in the mobile app.</p><a href="/auth/signout" className="lform-cancel account-signout">Sign out</a>
  </section></AppShell>
}
