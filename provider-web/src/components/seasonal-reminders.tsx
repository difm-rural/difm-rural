'use client'
import {useEffect,useRef,useState} from 'react'
import Link from '@/components/navigation-link'
import {Leaf,X,Briefcase,Tag,UserRound,Sprout} from 'lucide-react'
import {createClient} from '@/lib/supabase/client'
import {recordSeasonalEvent,SEASONAL_ACTIONS,type SeasonalCampaign} from '@/lib/seasonal-reminders'

// Side-coloured action pills, matching the jobs/listings colour rule.
const ACTION_SIDE: Record<string, { cls: string; Icon: typeof Briefcase }> = {
  post_job: { cls: 'job', Icon: Briefcase },
  browse_services: { cls: 'listing', Icon: Tag },
  manage_profile: { cls: 'neutral', Icon: UserRound },
}
export function SeasonalReminders({campaigns}:{campaigns:SeasonalCampaign[]}){
  const [client]=useState(()=>createClient()),[dismissed,setDismissed]=useState<string[]>([]),[busy,setBusy]=useState<string[]>([]),[errors,setErrors]=useState<string[]>([])
  const shown=useRef(new Set<string>())
  useEffect(()=>{
    campaigns.forEach(c=>{if(!shown.current.has(c.id)){shown.current.add(c.id);void recordSeasonalEvent(client,c.id,'impression')}})
  },[campaigns,client])
  async function dismiss(id:string){
    if(busy.includes(id))return
    setBusy(items=>[...items,id]);setErrors(items=>items.filter(item=>item!==id))
    const saved=await recordSeasonalEvent(client,id,'dismiss')
    if(saved)setDismissed(items=>[...items,id]);else setErrors(items=>[...items,id])
    setBusy(items=>items.filter(item=>item!==id))
  }
  const visible=campaigns.filter(c=>!dismissed.includes(c.id))
  if(!visible.length)return null
  return <section className="seasonal-section" aria-labelledby="seasonal-heading"><h2 id="seasonal-heading">Useful right now</h2><div className="seasonal-grid">{visible.map(c=>{
    const action=SEASONAL_ACTIONS[c.primary_action]
    const side=ACTION_SIDE[c.primary_action]||ACTION_SIDE.post_job
    return <article className="seasonal-card" key={c.id} aria-label={'Seasonal reminder: '+c.title}>
      <div className="seasonal-image"><Sprout className="seasonal-art" size={40}/><span className="seasonal-label"><Leaf size={12}/> Seasonal</span><button type="button" className="seasonal-dismiss" aria-label={'Dismiss reminder: '+c.title} disabled={busy.includes(c.id)} onClick={()=>void dismiss(c.id)}><span className="seasonal-dismiss-circle"><X size={16}/></span></button></div>
      <div className="seasonal-body">{c.category&&<p className="eyebrow">{c.category}</p>}<h3>{c.title}</h3><p className="seasonal-text">{c.body}</p>{action&&<Link href={action.href} className={'seasonal-action '+side.cls} onClick={()=>{void recordSeasonalEvent(client,c.id,'action')}}><side.Icon size={16}/>{action.label}</Link>}{errors.includes(c.id)&&<p role="alert">Couldn’t dismiss this reminder. Try the dismiss button again.</p>}</div>
    </article>
  })}</div></section>
}
