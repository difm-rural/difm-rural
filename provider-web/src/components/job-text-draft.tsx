'use client'

import {useRef,useState} from 'react'
import {nzToday} from '@shared/postingDates'
import {createClient} from '@/lib/supabase/client'

type TextDraft={title:string;description:string;category:string}

export function JobTextDraft({onUse}:{onUse:(draft:TextDraft)=>void}){
 const [mode,setMode]=useState<'Speak'|'Describe'|null>(null)
 const [text,setText]=useState('')
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')
 const [draft,setDraft]=useState<TextDraft|null>(null)
 const lock=useRef(false)

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
   className="job-ai-choice" aria-expanded={mode===choice} onClick={()=>setMode(mode===choice?null:choice)}>{choice}</button>)}
  {mode&&<div className="job-ai-panel">
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
    <p>{draft.category}</p>
    <button type="button" className="lform-cancel" onClick={()=>{onUse(draft);setDraft(null)}}>Use suggestion in empty fields</button>
   </div>}
  </div>}
 </>
}
