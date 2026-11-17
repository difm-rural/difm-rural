'use client'
import {JobPhotoDraft,type PhotoSuggestion} from '@/components/job-photo-draft'
import {JobAiChoiceCopy,JobTextDraft,revealJobAiContent} from '@/components/job-text-draft'
import {jobPhotoRequest,prepareJobPhoto} from '@/lib/job-primary-photo'
import {JobAddressInput} from '@/components/job-address-input'
import {JobLocationMap} from '@/components/job-location-map'
import {CATEGORIES,jobDraftCategory} from '@shared/categories'
import {DateInput} from '@/components/date-input'
import {formatMoney as nzMoney,formatDate as nzDate} from '@shared/formatting'
import {publicAreaError} from '@shared/publicArea'
import {POSTING_TITLE_MAX,POSTING_DESCRIPTION_MAX,postingTextError} from '@shared/postingText'
import {hasJobDraftChanges,readJobDraft} from '@shared/jobDraft'
import {FieldFeedback,invalidField} from '@/components/field-feedback'
import {runSubmission} from '@shared/submission'
import {PHOTO_MAX,resizePhoto} from '@/lib/resize-photo'
import {uploadThumbnail} from '@/lib/photo-thumbs'
import {LoaderCircle} from 'lucide-react'
import {moneyInputError,MAX_POSTING_AMOUNT} from '@shared/postingMoney'
import {editorScheduleType,jobScheduleError,nzCalendarDay,nzToday} from '@shared/postingDates'
import {usePublishingLocationWarning} from '@/components/publishing-location-warning'
import type {FormEvent} from 'react'
import { startTransition, useState, useRef, useEffect, useActionState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from '@/components/navigation-link'
import { SCHEDULES, MATERIALS, ACCESS, type JobSeed } from '@/lib/job-input'
import { createClient } from '@/lib/supabase/client'
import { postJob, editJob } from '../../work-actions'

type Draft={primary_photo_required:boolean;also_public:boolean;category:string;title:string;description:string;price_type:string;price:string;location:string;area:string;location_note:string;hide_exact_location:boolean;latitude:string;longitude:string;schedule_type:string;scheduled_date:string;date_from:string;date_to:string;materials_type:string;access_conditions:string[];photos:string[]}
export function JobForm({userId,seed,mode='new',offerCount=0,inviteProvider,privatePrimaryPhoto=false}:{userId:string;seed?:JobSeed;mode?:'new'|'edit'|'repeat';offerCount?:number;inviteProvider?:{id:string;name:string};privatePrimaryPhoto?:boolean}){
 const [primaryPhoto,setPrimaryPhoto]=useState<File|null>(null)
 const [submitting,setSubmitting]=useState(false)
 const [attempted,setAttempted]=useState(false),[furthest,setFurthest]=useState(0)
 const initial:Draft={primary_photo_required:false,also_public:false,category:seed?.category || '',title:seed?.title || '',description:seed?.description || '',price_type:seed?.price_type || 'open',price:seed?.price==null?'':String(seed.price),location:seed?.location_name || '',area:seed?.location_area || '',location_note:seed?.location_note || '',hide_exact_location:seed?.hide_exact_location ?? true,latitude:seed?.latitude==null?'':String(seed.latitude),longitude:seed?.longitude==null?'':String(seed.longitude),schedule_type:editorScheduleType(seed||{}),scheduled_date:nzCalendarDay(seed?.scheduled_date) || '',date_from:seed?.date_from || '',date_to:seed?.date_to || '',materials_type:seed?.materials_type || 'none',access_conditions:seed?.access_conditions || [],photos:seed?.photos || []}
 const [baseline]=useState(initial)
 const [draft,setDraft]=useState(initial),[step,setStep]=useState(0),[error,setError]=useState(''),[busy,setBusy]=useState(false),[jobId,setJobId]=useState(mode==='edit'?seed!.id:''),[saved,setSaved]=useState<{draft:Draft;id:string}|null>(null),[ready,setReady]=useState(false),[postedDraft,setPostedDraft]=useState('')
 const [suggestion,setSuggestion]=useState<{title:string;description:string;category:string;fromDescription:boolean}|null>(null)
 const {title,description,category}=draft
 const suggestedCategory=suggestion?.title===title&&suggestion.description===description?suggestion.category:''
 const selectedCategory=category||suggestedCategory
 useEffect(()=>{
  if(step!==4||category||suggestedCategory)return
  let active=true
  const apply=(category:string,fromDescription=false)=>{if(active)setSuggestion({title,description,category,fromDescription})}
  const controller=new AbortController()
  const fallback='General Rural Help'
  if(/house.?sit/i.test(title))apply('Property & House Sitting')
  else void createClient().functions.invoke('categorize-job',{body:{title,description},signal:controller.signal,timeout:8000})
    .then(({data,error})=>{
      if(!error&&CATEGORIES.includes(data?.category))apply(data.category,true)
      else apply(fallback)
    },()=>apply(fallback))
  return ()=>{active=false;controller.abort()}
 },[step,category,suggestedCategory,title,description])
 const [state,action,pending]=useActionState(async (previous:{error:string;jobId?:string},data:FormData)=>{
  // A successful save redirects from the server, which can resolve without a
  // result — keep the previous state so the form stays locked until it unmounts.
  try{return await (mode==='edit'?editJob:postJob)(previous,data) ?? previous}
  catch{return {error:'Could not confirm that the job was saved. Your changes are kept. Please try again.'}}
 },{error:''})
 const heading=useRef<HTMLHeadingElement>(null),router=useRouter(),key='rural-job:'+userId+':'+mode+':'+(seed?.id || 'new')+':'+(inviteProvider?.id || 'public')
 const locationWarning=usePublishingLocationWarning(userId),submissionLock=useRef(false)
 const steps=['The job','Location','Details & photos','Budget','Review']
 useEffect(()=>{
  let active=true
  Promise.resolve().then(()=>{
   if(!active)return
   setJobId(id=>id || crypto.randomUUID())
   try{
    const value=readJobDraft(sessionStorage.getItem(key),baseline)
    if(value){
     setSaved(value)
     // The draft id becomes the job id, so an existing job means this draft
     // already published (e.g. the tab reloaded mid-post) — don't offer to
     // post it again.
     if(mode!=='edit')try{
      void createClient().from('jobs').select('id').eq('id',value.id).maybeSingle().then(({data,error})=>{
       if(!active||error||!data)return
       try{sessionStorage.removeItem(key)}catch{}
       setSaved(null);setPostedDraft(value.id)
      },()=>{})
     }catch{}
    }
    else sessionStorage.removeItem(key)
   }catch{} // Storage may be unavailable; the form still works.
   setReady(true)
  })
  return ()=>{active=false}
 },[key,baseline])
 useEffect(()=>{
  if(!ready||saved||!jobId||state.jobId)return
  try{
   if(hasJobDraftChanges(draft,baseline))sessionStorage.setItem(key,JSON.stringify({draft,id:jobId}))
   else sessionStorage.removeItem(key)
  }catch{}
 },[draft,jobId,key,ready,saved,baseline,state.jobId])
 useEffect(()=>{if(state.error){submissionLock.current=false;setSubmitting(false);try{if(hasJobDraftChanges(draft,baseline))sessionStorage.setItem(key,JSON.stringify({draft,id:jobId}))}catch{}}if(state.jobId){try{sessionStorage.removeItem(key)}catch{}router.push('/jobs/'+state.jobId+(mode==='edit'?'?edited=1':'?posted=1'))}},[state,key,router,mode])  // eslint-disable-line react-hooks/exhaustive-deps -- draft/jobId are re-saved only at the moment a failure arrives
 useEffect(()=>{heading.current?.focus();heading.current?.scrollIntoView({block:'start'})},[step])
 function applyPhotoSuggestion(value:Pick<PhotoSuggestion,'title'|'description'|'category'>){
  setDraft(current=>({...current,title:current.title.trim()?current.title:value.title.slice(0,POSTING_TITLE_MAX),description:current.description||value.description.slice(0,POSTING_DESCRIPTION_MAX),
    category:current.category||jobDraftCategory(value.category)}))
 }
 const canUsePhoto=mode==='new'&&!draft.photos.length&&(draft.primary_photo_required||process.env.NEXT_PUBLIC_PHOTO_TO_JOB==='true')
 const photoEditor=(allowSuggestion:boolean)=>canUsePhoto
  ? <><JobPhotoDraft allowSuggestion={allowSuggestion} file={primaryPhoto} onFile={file=>{setPrimaryPhoto(file);setDraft(current=>({...current,primary_photo_required:true}))}} onSuggestion={applyPhotoSuggestion}/>
    {draft.primary_photo_required&&<button type="button" className="lform-cancel" onClick={()=>{setPrimaryPhoto(null);setDraft(current=>({...current,primary_photo_required:false}))}}>Continue without a photo</button>}</>:null
 const set=<K extends keyof Draft>(name:K,value:Draft[K])=>setDraft(d=>({...d,[name]:value}))
 function stepIssues(index:number):Record<string,string>{
  const issues:Record<string,string>={}
  if(index===0){
   if(!draft.title.trim())issues.title='Enter a job title.'
   else if(postingTextError(draft.title,'title'))issues.title=postingTextError(draft.title,'title')
   const schedule=jobScheduleError(draft,mode==='edit'?seed:null)
   if(schedule){
    if(draft.schedule_type==='specific')issues.scheduled_date='Preferred date: '+schedule
    else if(draft.schedule_type==='range'){
     if(!draft.date_from)issues.date_from='Choose the start date.'
     if(!draft.date_to)issues.date_to='Choose the end date.'
     if(draft.date_from&&draft.date_to){issues.date_from='Date range: '+schedule;issues.date_to='Date range: '+schedule}
    }else issues.schedule_type=schedule
   }
  }
  if(index===1&&publicAreaError(draft.area,false))issues.area=publicAreaError(draft.area,false)
  if(index===2){if(!draft.description.trim())issues.description='Enter a description of the work.';else if(postingTextError(draft.description,'description'))issues.description=postingTextError(draft.description,'description')}
  if(index===3&&draft.price_type==='fixed'){const message=moneyInputError(draft.price,'Budget');if(message)issues.price=message}
  return issues
 }
 function validStep(index:number){return Object.values(stepIssues(index))[0]||''}
 const issues=attempted?stepIssues(step):{}
 const field=(name:string)=>invalidField('job-'+name,issues[name])
 const issue=(name:string)=><FieldFeedback name={'job-'+name} message={issues[name]}/>
 useEffect(()=>{if(error)document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()},[error,step])
 function next(){setAttempted(true);const e=validStep(step);if(e){setError(e);return}setError('');setAttempted(false);setFurthest(value=>Math.max(value,step+1));setStep(s=>s+1)}
 async function upload(files:FileList|null){
  if(!files?.length)return
  const chosen=Array.from(files);if(chosen.length+draft.photos.length>6){setError('Choose up to six photos in total.');return}
  if(chosen.some(f=>!['image/jpeg','image/png','image/webp'].includes(f.type)||f.size>8*1024*1024)){setError('Use JPG, PNG or WebP photos smaller than 8 MB each.');return}
  setBusy(true);setError('')
  try{const client=createClient();for(const file of chosen){
   // Longest side at most 1600px, as a JPEG.
   const blob=await resizePhoto(file,PHOTO_MAX)
   // Under the uploader's own folder (<user id>/<job id>/) — storage only allows uploads there.
   const path=userId+'/'+jobId+'/'+crypto.randomUUID()+'.jpg',result=await client.storage.from('job-photos').upload(path,blob,{contentType:blob.type||'image/jpeg',upsert:false});if(result.error)throw result.error
   // 400px card thumbnail next to it; a failure never blocks the photo.
   await uploadThumbnail(client,'job-photos',path,blob)
   const url=client.storage.from('job-photos').getPublicUrl(path).data.publicUrl;setDraft(d=>({...d,photos:[...d.photos,url]}))
  }}catch{setError('Could not upload a photo. Photos already shown are kept. Check your connection and try the remaining photos again.')}finally{setBusy(false)}
 }
 function useLocation(){
  if(!navigator.geolocation){setError('Your browser does not support GPS. Enter the location manually.');return}
  setBusy(true);setError('');navigator.geolocation.getCurrentPosition(p=>{setDraft(d=>({...d,latitude:String(p.coords.latitude),longitude:String(p.coords.longitude)}));setBusy(false)},()=>{setError('Could not read your location. Allow location access or enter the address manually.');setBusy(false)},{timeout:15000,enableHighAccuracy:true})
 }
 const changeJobAddress = useCallback((location: string, latitude?: number, longitude?: number) => {
  setDraft(current => ({...current, location, latitude: latitude?.toString() ?? '', longitude: longitude?.toString() ?? ''}))
 }, [])
 const pickJobLocation = useCallback(({lat,lng}:{lat:number;lng:number}) => {
  setDraft(current => ({...current,latitude:String(lat),longitude:String(lng)}))
 }, [])
 const scheduleLabel=draft.schedule_type==='specific'?nzDate(draft.scheduled_date):draft.schedule_type==='range'?nzDate(draft.date_from)+' – '+nzDate(draft.date_to):SCHEDULES[draft.schedule_type as keyof typeof SCHEDULES]
 const postingStatus=state.jobId?'Saved. Opening your job…':mode==='edit'?'Saving changes…':'Posting job…'
 async function reviewSubmit(e:FormEvent<HTMLFormElement>){
  e.preventDefault()
  if(step<4){next();return}
  const submitter = (e.nativeEvent as SubmitEvent).submitter
  if (submitter?.id !== 'job-review-submit') return
  if(submissionLock.current||pending||busy||submitting||!ready||saved||!selectedCategory)return
  for(let i=0;i<4;i++){const issue=validStep(i);if(issue){setAttempted(true);setError(issue);setStep(i);return}}
  if(draft.primary_photo_required&&!primaryPhoto){setError('Choose a primary photo or continue without a photo.');return}
  const data=new FormData(e.currentTarget)
  await runSubmission(submissionLock,async()=>{
   if(!await locationWarning.check({latitude:draft.latitude,longitude:draft.longitude,area:draft.area,kind:'job'})){setStep(1);return false}
   // The form data is snapshotted, so drop the stored draft now: success
   // navigates away server-side, and a failure re-saves it (state.error effect).
   try{sessionStorage.removeItem(key)}catch{}
   if(primaryPhoto){
    const photo=await prepareJobPhoto(primaryPhoto)
    const {checksum}=await jobPhotoRequest<{checksum:string}>('job-primary-media',photo,jobId)
    data.set('primary_photo_checksum',checksum)
   }
   startTransition(()=>action(data))
   return true
  },()=>{setSubmitting(true);setError('')},()=>setSubmitting(false),()=>setError('Could not save the job. Your changes are kept. Check your connection and try again.'))
 }
 return <form noValidate className="lform" onSubmit={reviewSubmit}>
  {locationWarning.prompt}
  {postedDraft&&<div className="card"><h2>Draft already posted</h2><p>The draft saved in this tab was already published as a job — you don&apos;t need to post it again.</p><div className="lform-actions"><Link className="lform-save" href={'/jobs/'+postedDraft}>Open the job</Link><button type="button" className="lform-cancel" onClick={()=>setPostedDraft('')}>Start a new job</button></div></div>}
  {saved&&<div className="card"><h2>Resume your draft?</h2><p>A draft is saved in this browser tab. It has not been published.</p><div className="lform-actions"><button type="button" className="lform-save" onClick={()=>{setDraft({...initial,...saved.draft});setJobId(mode==='edit'?seed!.id:saved.id);setSaved(null)}}>Resume draft</button><button type="button" className="lform-cancel" onClick={()=>{setSaved(null);try{sessionStorage.removeItem(key)}catch{}}}>Discard saved draft</button></div></div>}
  {inviteProvider&&<section className="card work-detail"><h2>Invite {inviteProvider.name}</h2><p>This job will be visible only to you and this provider unless you choose the public board.</p><label className="account-setting"><input type="checkbox" disabled={pending||busy||submitting} checked={draft.also_public} onChange={e=>set('also_public',e.target.checked)}/>Also put this job on the public Jobs board</label></section>}
  {mode==='repeat'&&<p className="account-current">This is a new copy. Choose fresh dates before posting. The original job, offers, messages and reviews stay unchanged.</p>}
  {mode==='edit'&&offerCount>0&&<p className="home-load-error">This job has {offerCount} offer{offerCount===1?'':'s'}. Changes may affect those offers; discuss material changes before accepting.</p>}
  {furthest>0&&<nav className="job-steps" aria-label="Job posting steps">{steps.map((label,i)=><button type="button" key={label} aria-current={step===i?'step':undefined} disabled={pending||busy||submitting||i>furthest} onClick={()=>{setError('');setAttempted(false);setStep(i)}}>{i+1}. {label}</button>)}</nav>}
  <div className="job-progress"><p className="eyebrow">Step {step+1} of {steps.length}{step===0&&" · Basics"}</p><progress aria-label="Job posting progress" value={step+1} max={steps.length}/></div><h2 tabIndex={-1} ref={heading}>{step===0?"What do you need done?":steps[step]}</h2>
  <input type="hidden" name="job_id" value={jobId}/>{inviteProvider&&<input type="hidden" name="invite_provider_id" value={inviteProvider.id}/>}{mode==='repeat'&&<input type="hidden" name="repeated_from_job_id" value={seed?.id}/>}
  {Object.entries(draft).map(([name,value])=>(name==='category'||name==='schedule_type'&&step===0)?null:Array.isArray(value)?value.map((v,i)=><input type="hidden" name={name} value={v} key={name+i}/>):typeof value==='boolean'?<input type="hidden" key={name} name={name} value={value?'on':'off'}/>:<input type="hidden" key={name} name={name} value={value}/>)}
  <fieldset disabled={pending||busy||submitting||!ready||!!saved} aria-busy={submitting||pending} className="work-fieldset">
  {step===0&&<div className="lform-step job-basics"><label className="lform-field">Job title *<input maxLength={POSTING_TITLE_MAX} {...field('title')} value={draft.title} onChange={e=>set('title',e.target.value)} placeholder="e.g. Repair the back paddock fence"/>{issue('title')}<small className="muted">{draft.title.length} / {POSTING_TITLE_MAX} characters</small></label>
   {mode==='new'&&<details className="job-ai-helper">
    <summary><span><strong>Use AI to help create my job</strong><small>{canUsePhoto?'Use a photo, speak or describe what you need.':'Speak or describe what you need.'}</small></span></summary>
    <div className="job-ai-options">
     {canUsePhoto&&<details className="job-ai-photo" onToggle={event=>{
      if(event.currentTarget.open)revealJobAiContent(event.currentTarget.querySelector('.job-ai-panel'))
     }}>
      <summary className="job-ai-choice" aria-label={primaryPhoto?'Use a photo. Photo selected.':undefined}><JobAiChoiceCopy choice="Photo"/></summary>
      <div className="job-ai-panel">{photoEditor(true)}</div>
     </details>}
     <JobTextDraft onUse={applyPhotoSuggestion}/>
    </div>
   </details>}
   <fieldset className="job-timing">
    <legend>When do you need it done?</legend>
    {!Object.hasOwn(SCHEDULES,draft.schedule_type)&&draft.schedule_type&&<p className="muted">Saved timing needs review.</p>}
    {Object.entries(SCHEDULES).map(([value,label],index)=><label key={value}>
     <input {...(index===0?field('schedule_type'):{'aria-describedby':attempted&&stepIssues(0).schedule_type?'job-schedule_type-error':undefined})} type="radio" name="schedule_type" value={value}
      checked={draft.schedule_type===value} onChange={e=>set('schedule_type',e.target.value)}/>
     <span>{label}</span>
    </label>)}
    {issue('schedule_type')}
   </fieldset>
   {draft.schedule_type==='specific'&&<label className="lform-field">Preferred date *<DateInput type="date" min={mode==='edit'&&draft.scheduled_date===seed?.scheduled_date?undefined:nzToday()} {...field('scheduled_date')} value={draft.scheduled_date} onChange={e=>set('scheduled_date',e.target.value)}/>{issue('scheduled_date')}</label>}
   {draft.schedule_type==='range'&&<div className="lform-repeat-grid"><label className="lform-field">From *<DateInput type="date" min={mode==='edit'&&draft.date_from===seed?.date_from?undefined:nzToday()} {...field('date_from')} value={draft.date_from} onChange={e=>set('date_from',e.target.value)}/>{issue('date_from')}</label><label className="lform-field">To *<DateInput type="date" min={mode==='edit'&&draft.date_to===seed?.date_to?undefined:draft.date_from>nzToday()?draft.date_from:nzToday()} value={draft.date_to} {...field('date_to')} onChange={e=>set('date_to',e.target.value)}/>{issue('date_to')}</label></div>}
  </div>}
  {step===1&&<div className="lform-step"><JobAddressInput value={draft.location} onChange={changeJobAddress}/><label className="lform-field">Public town or area (optional)<input {...field('area')} value={draft.area} maxLength={150} onChange={e=>set('area',e.target.value)} placeholder="e.g. Cambridge, Waikato"/>{issue('area')}<small className="muted">Town or area only, e.g. Waitoki or Te Kūiti.</small></label>
   <label className="account-setting"><input type="checkbox" checked={draft.hide_exact_location} onChange={e=>set('hide_exact_location',e.target.checked)}/><span><strong>Hide exact address until I accept</strong><small>{draft.hide_exact_location?'Only the public area is shown before you accept an offer. The accepted provider can see the property location, GPS and location note.':'The property location, GPS and location note will be visible to people viewing this job.'}</small></span></label>
   <JobLocationMap latitude={draft.latitude} longitude={draft.longitude} onPick={pickJobLocation}/>
   <div className="lform-actions"><button type="button" className="lform-cancel" onClick={useLocation}>Use my location</button>{draft.latitude&&<button type="button" className="lform-cancel" onClick={()=>{set('latitude','');set('longitude','')}}>Clear GPS</button>}</div><p className="muted">Use GPS only when you are at the job site. This adds coordinates without changing the address above.</p>
   {draft.latitude&&<p>GPS: {Number(draft.latitude).toFixed(5)}, {Number(draft.longitude).toFixed(5)}</p>}
   <p className="muted">You can continue without a location. Adding a town or area helps people nearby find your job.</p>
   <label className="lform-field">Location note (optional)<textarea maxLength={2000} value={draft.location_note} onChange={e=>set('location_note',e.target.value)} placeholder="Gate, entrance or arrival directions"/></label>
  </div>}
  {step===2&&<div className="lform-step"><label className="lform-field">What needs doing? *<textarea rows={6} maxLength={POSTING_DESCRIPTION_MAX} {...field('description')} value={draft.description} onChange={e=>set('description',e.target.value)} placeholder="Describe the work, size, access and anything people should know."/>{issue('description')}<small className="muted">{draft.description.length} / {POSTING_DESCRIPTION_MAX} characters</small></label>
   <h3>Photos (optional)</h3><p className="muted">Up to six photos. Job photos are public: leave out private details and identifying location information.</p><div className="lform-photos">{draft.photos.map((url,i)=><div className="lform-photo" key={url}><a href={url} target="_blank" rel="noopener noreferrer"><img src={url} alt={'Job photo '+(i+1)}/></a><button type="button" className="lform-photo-remove" aria-label={'Remove photo '+(i+1)} onClick={()=>set('photos',draft.photos.filter(p=>p!==url))}>×</button></div>)}</div>
   {privatePrimaryPhoto&&<p className="muted">This job already has a primary photo. It will stay with the job.</p>}
   {!privatePrimaryPhoto&&!draft.primary_photo_required&&draft.photos.length<6&&<label className="lform-field">Add photos<input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={e=>{void upload(e.target.files);e.target.value=''}}/></label>}
   <h3>Site access (optional)</h3><div className="account-checkboxes">{Object.entries({...ACCESS,...Object.fromEntries(draft.access_conditions.filter(c=>!(c in ACCESS)).map(c=>[c,c]))}).map(([value,label])=><label key={value}><input type="checkbox" checked={draft.access_conditions.includes(value)} onChange={e=>set('access_conditions',e.target.checked?[...draft.access_conditions,value]:draft.access_conditions.filter(c=>c!==value))}/>{label}</label>)}</div>
  </div>}
  {step===3&&<div className="lform-step"><label className="lform-field">Budget<select value={draft.price_type} onChange={e=>set('price_type',e.target.value)}><option value="open">Open to offers</option><option value="fixed">Set a budget</option></select></label>{draft.price_type==='fixed'&&<label className="lform-field">Budget ($) *<input type="number" inputMode="decimal" min="0.01" max={MAX_POSTING_AMOUNT} step="0.01" {...field('price')} value={draft.price} onChange={e=>set('price',e.target.value)}/>{issue('price')}</label>}<label className="lform-field">Materials<select value={draft.materials_type} onChange={e=>set('materials_type',e.target.value)}>{Object.entries(MATERIALS).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><p className="muted">Agree the final scope, timing and payment directly with the provider. Rural Connections does not handle payments.</p></div>}
  <input type="hidden" name="category" value={CATEGORIES.includes(selectedCategory)?selectedCategory:''}/>
  {step===4&&<article className="card work-detail"><h3>{draft.title}</h3>{draft.primary_photo_required&&photoEditor(false)}<label className="lform-field">Category<select value={selectedCategory} onChange={e=>set('category',e.target.value)}>
    {!selectedCategory&&<option value="" disabled>Choosing a category…</option>}
    {selectedCategory&&!CATEGORIES.includes(selectedCategory)&&<option value={selectedCategory}>{selectedCategory}</option>}
    {CATEGORIES.map(value=><option key={value} value={value}>{value}</option>)}
   </select></label>{!category&&suggestion?.fromDescription&&suggestedCategory&&<p className="muted">Suggested from your description. Change if needed.</p>}<p>{draft.area || 'No public area added'}</p><p className="work-description">{draft.description}</p><p>{draft.price_type==='open'?'Open to offers':"Budget: "+nzMoney(draft.price)+''}</p><p>{scheduleLabel}</p><p>{MATERIALS[draft.materials_type as keyof typeof MATERIALS]}</p>{draft.access_conditions.length>0&&<p>Site access: {draft.access_conditions.map(a=>ACCESS[a as keyof typeof ACCESS] || a).join(', ')}</p>}<p>{draft.hide_exact_location?'Private location (shared with accepted provider)':'Public exact location'}: {draft.location || 'To be arranged'}{draft.latitude?' · GPS included':''}</p>{draft.location_note&&<p className="work-description">Location note: {draft.location_note}</p>}<div className="lform-photos">{draft.photos.map((url,i)=><div className="lform-photo" key={url}><img src={url} alt={'Job photo '+(i+1)}/></div>)}</div><p>{mode==='edit'?'Your changes update the existing job.':inviteProvider?'This invites '+inviteProvider.name+(draft.also_public?' and publishes the job on the public board.':' to a private job. Only you and this provider can view it.'):'Your job will be published to the Jobs board. Review offers before choosing who does the work.'}</p>{mode==='edit'&&<p className="muted">Existing visibility and recurrence settings are preserved. Moving the job location clears its previous mapped area.</p>}</article>}
  </fieldset>
  {(error||(!submitting&&state.error))&&<p role="alert" className="form-error">{error||state.error}</p>}{busy&&<p role="status">Working… Please wait.</p>}
  <p className="muted" role="status">{submitting||pending?postingStatus:null}</p>
  <div className="lform-actions lform-wizard-actions"><Link href={seed?'/jobs/'+seed.id:'/jobs'} className="lform-cancel" aria-disabled={submitting||pending} onClick={e=>{if(submitting||pending)e.preventDefault()}}>{mode==='edit'?'Cancel editing':'Cancel'}</Link>{step>0&&<button type="button" className="lform-cancel" disabled={pending||busy||submitting||!!saved} onClick={()=>{setError('');setStep(s=>s-1)}}>Back</button>}{step<4?<button type="button" className="lform-save" disabled={pending||busy||submitting||!ready||!!saved} key="next" onClick={next}>{step===0?'Next — Location':'Next'}</button>:<button key="review-submit" id="job-review-submit" type="submit" className="lform-save" disabled={pending||busy||submitting||!ready||!!saved||!selectedCategory}>{(pending||submitting)&&<LoaderCircle size={16} className="spin" aria-hidden="true"/>}{pending||submitting?(mode==='edit'?'Saving changes…':'Posting job…'):mode==='edit'?'Save changes':inviteProvider?'Post job & send invitation':mode==='repeat'?'Post repeated job':'Post job'}</button>}</div><p className="muted">Drafts are stored in this tab when browser storage is available. Closing the tab may remove them.</p>
 </form>
}
