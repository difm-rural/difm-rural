'use client'
import { useState, useRef, useEffect, useActionState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { CATEGORIES } from '@shared/categories'
import { SCHEDULES, MATERIALS, ACCESS, type JobSeed } from '@/lib/job-input'
import { createClient } from '@/lib/supabase/client'
import { postJob, editJob } from '../../work-actions'

type Draft={title:string;description:string;category:string;price_type:string;price:string;location:string;area:string;location_note:string;hide_exact_location:boolean;latitude:string;longitude:string;schedule_type:string;scheduled_date:string;date_from:string;date_to:string;materials_type:string;access_conditions:string[];photos:string[]}
export function JobForm({userId,seed,mode='new',offerCount=0}:{userId:string;seed?:JobSeed;mode?:'new'|'edit'|'repeat';offerCount?:number}){
 const initial:Draft={title:seed?.title || '',description:seed?.description || '',category:seed?.category || '',price_type:seed?.price_type || 'open',price:seed?.price==null?'':String(seed.price),location:seed?.location_name || '',area:seed?.location_area || '',location_note:seed?.location_note || '',hide_exact_location:seed?.hide_exact_location ?? true,latitude:seed?.latitude==null?'':String(seed.latitude),longitude:seed?.longitude==null?'':String(seed.longitude),schedule_type:seed?.schedule_type || 'flexible',scheduled_date:seed?.scheduled_date || '',date_from:seed?.date_from || '',date_to:seed?.date_to || '',materials_type:seed?.materials_type || 'none',access_conditions:seed?.access_conditions || [],photos:seed?.photos || []}
 const [draft,setDraft]=useState(initial),[step,setStep]=useState(0),[error,setError]=useState(''),[busy,setBusy]=useState(false),[jobId,setJobId]=useState(mode==='edit'?seed!.id:''),[saved,setSaved]=useState<{draft:Draft;id:string}|null>(null),[ready,setReady]=useState(false)
 const [state,action,pending]=useActionState(mode==='edit'?editJob:postJob,{error:''})
 const heading=useRef<HTMLHeadingElement>(null),router=useRouter(),key='rural-job:'+userId+':'+mode+':'+(seed?.id || 'new')
 const steps=['The job','Location','Details & photos','Budget','Review']
 useEffect(()=>{let active=true;Promise.resolve().then(()=>{if(!active)return;setJobId(id=>id || crypto.randomUUID());try{const raw=sessionStorage.getItem(key);if(raw){const value=JSON.parse(raw);if(value?.draft&&value?.id)setSaved(value)}}catch{}setReady(true)});return ()=>{active=false}},[key])
 useEffect(()=>{if(!ready||saved||!jobId)return;try{sessionStorage.setItem(key,JSON.stringify({draft,id:jobId}))}catch{}},[draft,jobId,key,ready,saved])
 useEffect(()=>{if(state.jobId){try{sessionStorage.removeItem(key)}catch{}router.push('/jobs/'+state.jobId);router.refresh()}},[state,key,router])
 useEffect(()=>{heading.current?.focus();heading.current?.scrollIntoView({block:'start'})},[step])
 const set=<K extends keyof Draft>(name:K,value:Draft[K])=>setDraft(d=>({...d,[name]:value}))
 function validStep(index:number){
  if(index===0&&(!draft.title.trim()||!draft.category||(draft.schedule_type==='specific'&&!draft.scheduled_date)||(draft.schedule_type==='range'&&(!draft.date_from||!draft.date_to||draft.date_from>draft.date_to))))return 'Add a title, category and valid schedule.'
  if(index===1&&!draft.area.trim())return 'Add the public town or area. The exact location is optional.'
  if(index===2&&!draft.description.trim())return 'Describe what needs doing.'
  if(index===3&&draft.price_type==='fixed'&&(!draft.price||!Number.isFinite(Number(draft.price))||Number(draft.price)<=0))return 'Enter a positive budget or choose Open to offers.'
  return ''
 }
 function next(){const e=validStep(step);if(e){setError(e);return}setError('');setStep(s=>s+1)}
 async function upload(files:FileList|null){
  if(!files?.length)return
  const chosen=Array.from(files);if(chosen.length+draft.photos.length>6){setError('Choose up to six photos in total.');return}
  if(chosen.some(f=>!['image/jpeg','image/png','image/webp'].includes(f.type)||f.size>8*1024*1024)){setError('Use JPG, PNG or WebP photos smaller than 8 MB each.');return}
  setBusy(true);setError('')
  try{const client=createClient();for(const file of chosen){
   const bitmap=await createImageBitmap(file),scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale)
   const ctx=canvas.getContext('2d');if(!ctx){bitmap.close();throw new Error('Photo unavailable')}ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close()
   const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Photo unavailable')),'image/jpeg',.85))
   const path=jobId+'/'+userId+'/'+crypto.randomUUID()+'.jpg',result=await client.storage.from('job-photos').upload(path,blob,{contentType:'image/jpeg',upsert:false});if(result.error)throw result.error
   const url=client.storage.from('job-photos').getPublicUrl(path).data.publicUrl;setDraft(d=>({...d,photos:[...d.photos,url]}))
  }}catch{setError('Could not upload a photo. Photos already shown are kept. Check your connection and try the remaining photos again.')}finally{setBusy(false)}
 }
 function useLocation(){
  if(!navigator.geolocation){setError('Your browser does not support GPS. Enter the location manually.');return}
  setBusy(true);setError('');navigator.geolocation.getCurrentPosition(p=>{setDraft(d=>({...d,latitude:String(p.coords.latitude),longitude:String(p.coords.longitude)}));setBusy(false)},()=>{setError('Could not read your location. Allow location access or enter the address manually.');setBusy(false)},{timeout:15000,enableHighAccuracy:true})
 }
 const scheduleLabel=draft.schedule_type==='specific'?draft.scheduled_date:draft.schedule_type==='range'?draft.date_from+' – '+draft.date_to:SCHEDULES[draft.schedule_type as keyof typeof SCHEDULES]
 return <form action={action} className="lform" onSubmit={e=>{if(step<4){e.preventDefault();next()}else{for(let i=0;i<4;i++){const issue=validStep(i);if(issue){e.preventDefault();setError(issue);setStep(i);break}}}}}>
  {saved&&<div className="card"><h2>Resume your draft?</h2><p>A draft is saved in this browser tab. It has not been published.</p><div className="lform-actions"><button type="button" className="lform-save" onClick={()=>{setDraft({...initial,...saved.draft});setJobId(mode==='edit'?seed!.id:saved.id);setSaved(null)}}>Resume draft</button><button type="button" className="lform-cancel" onClick={()=>{setSaved(null);try{sessionStorage.removeItem(key)}catch{}}}>Discard saved draft</button></div></div>}
  {mode==='repeat'&&<p className="account-current">This is a new copy. Choose fresh dates before posting. The original job, offers, messages and reviews stay unchanged.</p>}
  {mode==='edit'&&offerCount>0&&<p className="home-load-error">This job has {offerCount} offer{offerCount===1?'':'s'}. Changes may affect those offers; discuss material changes before accepting.</p>}
  <nav className="job-steps" aria-label="Job posting steps">{steps.map((label,i)=><button type="button" key={label} aria-current={step===i?'step':undefined} disabled={pending||busy||i>step} onClick={()=>{setError('');setStep(i)}}>{i+1}. {label}</button>)}</nav>
  <p className="eyebrow">Step {step+1} of 5</p><h2 tabIndex={-1} ref={heading}>{steps[step]}</h2>
  <input type="hidden" name="job_id" value={jobId}/>{mode==='repeat'&&<input type="hidden" name="repeated_from_job_id" value={seed?.id}/>}
  {Object.entries(draft).map(([name,value])=>Array.isArray(value)?value.map((v,i)=><input type="hidden" name={name} value={v} key={name+i}/>):typeof value==='boolean'?<input type="hidden" key={name} name={name} value={value?'on':'off'}/>:<input type="hidden" key={name} name={name} value={value}/>)}
  <fieldset disabled={pending||busy||!ready||!!saved} className="work-fieldset">
  {step===0&&<div className="lform-step"><label className="lform-field">Job title *<input maxLength={160} value={draft.title} onChange={e=>set('title',e.target.value)} placeholder="e.g. Repair the back paddock fence"/></label><label className="lform-field">Category *<select value={draft.category} onChange={e=>set('category',e.target.value)}><option value="">Choose a category</option>{CATEGORIES.map(c=><option key={c}>{c}</option>)}</select></label>
   <label className="lform-field">When do you need it done?<select value={draft.schedule_type} onChange={e=>set('schedule_type',e.target.value)}>{Object.entries(SCHEDULES).map(([v,label])=><option key={v} value={v}>{label}</option>)}</select></label>
   {draft.schedule_type==='specific'&&<label className="lform-field">Preferred date *<input type="date" value={draft.scheduled_date} onChange={e=>set('scheduled_date',e.target.value)}/></label>}
   {draft.schedule_type==='range'&&<div className="lform-repeat-grid"><label className="lform-field">From *<input type="date" value={draft.date_from} onChange={e=>set('date_from',e.target.value)}/></label><label className="lform-field">To *<input type="date" min={draft.date_from} value={draft.date_to} onChange={e=>set('date_to',e.target.value)}/></label></div>}
  </div>}
  {step===1&&<div className="lform-step"><label className="lform-field">Public town or area *<input value={draft.area} maxLength={150} onChange={e=>set('area',e.target.value)} placeholder="e.g. Cambridge, Waikato"/></label><label className="lform-field">Exact property location (optional)<input maxLength={300} value={draft.location} onChange={e=>setDraft(d=>({...d,location:e.target.value,latitude:'',longitude:''}))} placeholder="Street address or property location"/></label>
   <label className="account-setting"><input type="checkbox" checked={draft.hide_exact_location} onChange={e=>set('hide_exact_location',e.target.checked)}/><span><strong>Keep the exact location private</strong><small>{draft.hide_exact_location?'Only the public area is shown before you accept an offer. The accepted provider can see the property location, GPS and location note.':'The property location, GPS and location note will be visible to people viewing this job.'}</small></span></label>
   <div className="lform-actions"><button type="button" className="lform-cancel" onClick={useLocation}>Use my current GPS location</button>{draft.latitude&&<button type="button" className="lform-cancel" onClick={()=>{set('latitude','');set('longitude','')}}>Clear GPS</button>}</div><p className="muted">Use GPS only when you are at the job site. This adds coordinates without changing the address above.</p>
   {draft.latitude&&<p>GPS: {Number(draft.latitude).toFixed(5)}, {Number(draft.longitude).toFixed(5)}</p>}
   <label className="lform-field">Location note (optional)<textarea maxLength={2000} value={draft.location_note} onChange={e=>set('location_note',e.target.value)} placeholder="Gate, entrance or arrival directions"/></label>
  </div>}
  {step===2&&<div className="lform-step"><label className="lform-field">What needs doing? *<textarea rows={6} maxLength={10000} value={draft.description} onChange={e=>set('description',e.target.value)} placeholder="Describe the work, size, access and anything people should know."/></label>
   <h3>Photos (optional)</h3><p className="muted">Up to six photos. Job photos are public: leave out private details and identifying location information.</p><div className="lform-photos">{draft.photos.map((url,i)=><div className="lform-photo" key={url}><a href={url} target="_blank" rel="noopener noreferrer"><img src={url} alt={'Job photo '+(i+1)}/></a><button type="button" className="lform-photo-remove" aria-label={'Remove photo '+(i+1)} onClick={()=>set('photos',draft.photos.filter(p=>p!==url))}>×</button></div>)}</div>
   {draft.photos.length<6&&<label className="lform-field">Add photos<input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={e=>{void upload(e.target.files);e.target.value=''}}/></label>}
   <h3>Site access (optional)</h3><div className="account-checkboxes">{Object.entries({...ACCESS,...Object.fromEntries(draft.access_conditions.filter(c=>!(c in ACCESS)).map(c=>[c,c]))}).map(([value,label])=><label key={value}><input type="checkbox" checked={draft.access_conditions.includes(value)} onChange={e=>set('access_conditions',e.target.checked?[...draft.access_conditions,value]:draft.access_conditions.filter(c=>c!==value))}/>{label}</label>)}</div>
  </div>}
  {step===3&&<div className="lform-step"><label className="lform-field">Budget<select value={draft.price_type} onChange={e=>set('price_type',e.target.value)}><option value="open">Open to offers</option><option value="fixed">Set a budget</option></select></label>{draft.price_type==='fixed'&&<label className="lform-field">Budget (NZD) *<input type="number" min="0.01" max="10000000" step="0.01" value={draft.price} onChange={e=>set('price',e.target.value)}/></label>}<label className="lform-field">Materials<select value={draft.materials_type} onChange={e=>set('materials_type',e.target.value)}>{Object.entries(MATERIALS).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><p className="muted">Agree the final scope, timing and payment directly with the provider. Rural Connections does not handle payments.</p></div>}
  {step===4&&<article className="card work-detail"><h3>{draft.title}</h3><p>{draft.category} · {draft.area}</p><p className="work-description">{draft.description}</p><p>{draft.price_type==='open'?'Open to offers':'Budget: $'+draft.price+' NZD'}</p><p>{scheduleLabel}</p><p>{MATERIALS[draft.materials_type as keyof typeof MATERIALS]}</p>{draft.access_conditions.length>0&&<p>Site access: {draft.access_conditions.map(a=>ACCESS[a as keyof typeof ACCESS] || a).join(', ')}</p>}<p>{draft.hide_exact_location?'Private location (shared with accepted provider)':'Public exact location'}: {draft.location || 'To be arranged'}{draft.latitude?' · GPS included':''}</p>{draft.location_note&&<p className="work-description">Location note: {draft.location_note}</p>}<div className="lform-photos">{draft.photos.map((url,i)=><div className="lform-photo" key={url}><img src={url} alt={'Job photo '+(i+1)}/></div>)}</div><p>{mode==='edit'?'Your changes update the existing job.':'Your job will be published to the Jobs board. Review offers before choosing who does the work.'}</p>{mode==='edit'&&<p className="muted">Existing visibility and recurrence settings are preserved. Moving the job location clears its previous mapped area.</p>}</article>}
  </fieldset>
  {(error||state.error)&&<p role="alert" className="form-error">{error||state.error}</p>}{busy&&<p role="status">Working… Please wait.</p>}
  <div className="lform-actions lform-wizard-actions"><Link href={seed?'/jobs/'+seed.id:'/jobs'} className="lform-cancel">{mode==='edit'?'Cancel editing':'Back to Jobs'}</Link>{step>0&&<button type="button" className="lform-cancel" disabled={pending||busy||!!saved} onClick={()=>{setError('');setStep(s=>s-1)}}>Previous</button>}{step<4?<button type="button" className="lform-save" disabled={pending||busy||!ready||!!saved} onClick={next}>Next</button>:<button className="lform-save" disabled={pending||busy||!ready||!!saved}>{pending?'Saving…':mode==='edit'?'Save changes':mode==='repeat'?'Post repeated job':'Post job'}</button>}</div><p className="muted">Your draft is kept in this browser tab until you post or save it. Closing the tab may remove it.</p>
 </form>
}
