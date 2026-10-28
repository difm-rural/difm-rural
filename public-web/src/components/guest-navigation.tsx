'use client'
import Link from 'next/link'
import {usePathname} from 'next/navigation'
import {House, BriefcaseBusiness, Search, CirclePlus, UserRound} from 'lucide-react'
import {consoleLink} from '@/lib/console-link'
export function GuestNavigation(){
  const pathname=usePathname()
  const items=[{href:'/',label:'Home',icon:House},{href:'/jobs',label:'Jobs',icon:BriefcaseBusiness},{href:'/listings',label:'Listings',icon:Search},{href:consoleLink('/jobs/new'),label:'Post',icon:CirclePlus},{href:consoleLink(),label:'Account',icon:UserRound}]
  return <nav className="guest-navigation" aria-label="Main navigation">{items.map(item=>{
    const active=item.href==='/'?pathname==='/':item.href.startsWith('/')&&pathname.startsWith(item.href)
    const content=<><item.icon size={21} aria-hidden="true"/><span>{item.label}</span></>
    return item.href.startsWith('/')?<Link key={item.label} href={item.href} aria-current={active?'page':undefined} className={active?'active':''}>{content}</Link>:<a key={item.label} href={item.href}>{content}</a>
  })}</nav>
}
