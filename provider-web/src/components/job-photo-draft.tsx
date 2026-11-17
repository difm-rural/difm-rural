'use client'
import {useEffect,useRef,useState} from 'react'
import {jobPhotoRequest,prepareJobPhoto} from '@/lib/job-primary-photo'

export type PhotoSuggestion={status:string;title:string;description:string;category:string|null;question:string}

export function JobPhotoDraft({file,onFile,onSuggestion,allowSuggestion=true}:{file:File|null;onFile:(file:File|null)=>void;onSuggestion:(suggestion:PhotoSuggestion)=>void;allowSuggestion?:boolean}){
 const [preview,setPreview]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const [note,setNote]=useState('')
 const [suggestion,setSuggestion]=useState<PhotoSuggestion|null>(null)
 const generation=useRef(0)
 const active=useRef(false)
 useEffect(()=>{
  if(!file){setPreview('');return}
  const url=URL.createObjectURL(file)
  setPreview(url)
  return ()=>URL.revokeObjectURL(url)
 },[file])
 useEffect(()=>()=>{generation.current++},[])
 async function suggest(){
  if(!file||active.current)return
  active.current=true
  const version=++generation.current
  setBusy(true);setError('');setSuggestion(null)
  try{
   const result=await jobPhotoRequest<PhotoSuggestion>('draft-job-from-photo',await prepareJobPhoto(file),undefined,note)
   if(version===generation.current)setSuggestion(result)
  }catch(cause){if(version===generation.current)setError(cause instanceof Error?cause.message:'Could not suggest a job.')}
  finally{if(version===generation.current){active.current=false;setBusy(false)}}
 }
 function change(next:File|null){
  generation.current++;active.current=false;setBusy(false);setSuggestion(null);setError('');onFile(next)
 }
 return <div className="lform-step">
  <label className="lform-field">{file?'Replace primary photo':'Choose a photo for this job'}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>{const next=e.target.files?.[0];if(next)change(next);e.target.value=''}}/></label>
  {preview&&<img src={preview} alt="Selected primary job photo" width={240}/>}
  {file&&allowSuggestion&&<label className="lform-field">Add a short description (optional)
   <textarea maxLength={400} rows={2} value={note} disabled={busy} onChange={e=>setNote(e.target.value)} placeholder="e.g. Replace the broken hinge"/>
  </label>}
  {file&&<div className="lform-actions">
   {allowSuggestion&&<button type="button" className="lform-cancel" disabled={busy} onClick={suggest}>{busy?'Analysing photo…':'Suggest a job'}</button>}
   <button type="button" className="lform-cancel" onClick={()=>change(null)}>Remove photo</button>
  </div>}
  {file&&allowSuggestion&&<p className="muted">Suggest a job sends the photo and description for AI analysis. The photo will be visible to people who can view the posted job.</p>}
  {error&&<p role="alert">{error}</p>}
  {suggestion&&<div role="status">
   {suggestion.status==='unusable'?<p>Could not identify the work in this photo. You can write the job details yourself.</p>:<>
    {suggestion.question&&<p>{suggestion.question} Add your answer to the job description.</p>}
    <p>{suggestion.title}</p><p>{suggestion.description}</p><p>{suggestion.category}</p>
    <button type="button" className="lform-cancel" onClick={()=>{onSuggestion(suggestion);setSuggestion(null)}}>Use suggestion in empty fields</button>
   </>}
  </div>}
 </div>
}
