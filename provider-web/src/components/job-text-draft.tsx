'use client'

import {useEffect,useRef,useState} from 'react'
import {Camera,ChevronRight,Mic,SquarePen} from 'lucide-react'
import {jobDraftCategory} from '@shared/categories'
import {nzToday} from '@shared/postingDates'
import {createClient} from '@/lib/supabase/client'

type TextDraft={title:string;description:string;category:string}
const choices={
 Photo:{label:'Use a photo',description:'Take or choose a photo and add a few words if you like.',Icon:Camera},
 Speak:{label:'Speak',description:'Tell our Assistant what needs doing.',Icon:Mic},
 Describe:{label:'Describe',description:'Write a few details and let AI prepare your job.',Icon:SquarePen},
}

export function JobAiChoiceCopy({choice}:{choice:keyof typeof choices}){
 const {label,description,Icon}=choices[choice]
 return <><Icon size={18} aria-hidden="true"/><span className="job-ai-choice-copy">
  <strong>{label}</strong><small>{description}</small>
 </span><ChevronRight className="job-ai-chevron" size={16} aria-hidden="true"/></>
}

export function revealJobAiContent(panel:HTMLElement|null){
 if(!panel)return
 const footer=panel.closest('form')?.querySelector('.lform-wizard-actions')
 const view=window.visualViewport
 const visibleBottom=(view?.offsetTop??0)+(view?.height??window.innerHeight)
 const bottom=Math.min(visibleBottom,footer?.getBoundingClientRect().top??visibleBottom)-16
 const bounds=panel.getBoundingClientRect()
 const delta=bounds.top+Math.min(bounds.height,140)-bottom
 if(delta>0)window.scrollBy({top:delta})
}

export function JobTextDraft({onUse}:{onUse:(draft:TextDraft)=>boolean}){
 const [mode,setMode]=useState<'Speak'|'Describe'|null>(null)
 const [text,setText]=useState('')
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')
 const [draft,setDraft]=useState<TextDraft|null>(null)
 const lock=useRef(false)
 const panel=useRef<HTMLDivElement>(null)
 useEffect(()=>{if(mode)revealJobAiContent(panel.current)},[mode])

 async function suggest(){
  if(lock.current||text.trim().length<8)return
  lock.current=true
  setBusy(true);setError('');setDraft(null)
  try{
   const {data,error}=await createClient().functions.invoke('draft-job-from-text',{
    body:{text:text.trim(),today:nzToday()},timeout:30000,
   })
   if(error||typeof data?.draft?.title!=='string'||!data.draft.title.trim()||typeof data.draft.description!=='string')
    throw new Error('Could not suggest a job. Add a little more detail or continue manually.')
   setDraft(data.draft)
  }catch{
   setError('Could not suggest a job. Try again or enter the details yourself.')
  }finally{
   lock.current=false
   setBusy(false)
  }
 }

 return <>
  {(['Speak','Describe'] as const).map(choice=><button key={choice} type="button"
   className="job-ai-choice" aria-expanded={mode===choice} onClick={()=>setMode(mode===choice?null:choice)}><JobAiChoiceCopy choice={choice}/></button>)}
  {mode&&<div className="job-ai-panel" ref={panel}>
   <label className="lform-field">Describe your job
    {mode==='Speak'&&<small className="muted">Use your device’s dictation shortcut or the microphone on your keyboard.</small>}
    <textarea value={text} maxLength={2000} rows={3} onChange={e=>setText(e.target.value)} disabled={busy}/>
   </label>
   <button type="button" className="lform-cancel" disabled={busy||text.trim().length<8} onClick={suggest}>
    {busy?'Reading your description…':'Suggest a job'}
   </button>
   {error&&<p role="alert">{error}</p>}
   {draft&&<div role="status">
    <strong>{draft.title}</strong>
    <p>{draft.description}</p>
    <p>{jobDraftCategory(draft.category)}</p>
    <button type="button" className="lform-cancel" onClick={()=>{if(onUse(draft))setDraft(null);else setError('Could not apply this suggestion. Your details are kept.')}}>Use suggestion in empty fields</button>
   </div>}
  </div>}
 </>
}
