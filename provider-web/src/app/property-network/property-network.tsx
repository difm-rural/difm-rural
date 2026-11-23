'use client'

import {useCallback,useEffect,useRef,useState} from 'react'
import Link from '@/components/navigation-link'
import {createClient} from '@/lib/supabase/client'
import {loadConnections} from '@/lib/connections-data'
import {loadInviteChoices,loadSavedProviders,setProviderSaved} from '@shared/trustedLocals'
import {loadPropertyMatches,matchLocality,propertyNeed,type PropertyMatch} from '@shared/propertyMatching'
import {ProviderInviteAction} from '../connections/provider-actions'
import {Check} from 'lucide-react'
import {PropertyAreaIcon} from './area-icon'
import {PropertyAreaJobs} from './property-area-jobs'
import {propertyNetworkCounts,propertyPostPath,replacePropertyProvider} from '@shared/propertyNetworkJobs'
import {
 PROPERTY_AREA_DESCRIPTIONS,PROPERTY_NODE_HEIGHT,PROPERTY_NODE_WIDTH,SUPPORT_AREAS,propertyAreaStatus,filterPropertyProviders,discoverPropertyProviders,linkedPropertyProviders,loadPropertyNetwork,
 propertyAreas,propertyDiagramRatio,propertyDiscoveryPath,propertyJobCategory,propertyProviderName,propertyServiceTarget,propertySpokes,
 savePropertyService,setPropertyArea,setPropertyProvider,
 type AreaId,type NetworkData,type PropertyProvider,type PropertyService,
 PROPERTY_CONTACT_LIMITS,createPropertyContact,deletePropertyContact,linkedPropertyContacts,propertyContactEmailHref,propertyContactFields,
 propertyContactInviteText,propertyContactPhoneHref,propertyContactServices,replacePropertyContact,setPropertyContact,updatePropertyContact,
 type PropertyContact,type PropertyContactInput,
 propertyAreaProgress,propertyAreaWho,propertyBulkLabel,propertyBulkMessage,propertyBulkServices,propertyChoiceStatus,propertyGaps,propertyServiceChoice,propertySetupStarted,
 propertyStatusAfterUnlink,propertyWhoMeStatus,savePropertyAreas,savePropertyServices,type PropertyChoice,
} from '@shared/propertyNetwork'
import type {ListingKind} from '@shared/listingPricing'

type AreaView=ReturnType<typeof propertyAreas>[number]
const PROPERTY_CHOICES:[PropertyChoice,string][]=[['sorted','Sorted'],['help','Needs help'],['na','N/A']]

type ProviderGroup={label:string;people:PropertyProvider[]}
type InviteChoices=Awaited<ReturnType<typeof loadInviteChoices>>

function AreaBadges({area}:{area:ReturnType<typeof propertyAreas>[number]}){
 return <span className="property-badges">{propertyAreaStatus(area).map(badge=>
  <span key={badge.tone} className={'property-badge '+badge.tone}>{badge.label}</span>
 )}</span>
}

type ContactValue=ReturnType<typeof propertyContactFields>['value']

// Add or edit a private contact: someone who is not on Rural Connections.
function ContactForm({initial,busy,onSave,onCancel,onDelete}:{initial?:PropertyContact;busy:boolean;
 onSave:(value:ContactValue)=>void;onCancel:()=>void;onDelete?:()=>void}){
 const [fields,setFields]=useState<Required<PropertyContactInput>>({name:initial?.name??'',phone:initial?.phone??'',email:initial?.email??'',note:initial?.note??''})
 const [errors,setErrors]=useState<Partial<Record<keyof PropertyContactInput,string>>>({})
 const prefix='contact-'+(initial?.id??'new')
 const field=(key:keyof PropertyContactInput,label:string,props:React.InputHTMLAttributes<HTMLInputElement>)=>
  <label className="lform-field" key={key}>{label}
   <input {...props} value={fields[key]??''} maxLength={PROPERTY_CONTACT_LIMITS[key]} aria-invalid={!!errors[key]}
    aria-describedby={errors[key]?prefix+'-'+key:undefined} onChange={event=>setFields(current=>({...current,[key]:event.target.value}))}/>
   {errors[key]&&<span className="property-gap" id={prefix+'-'+key}>{errors[key]}</span>}
  </label>
 return <form className="property-picker property-contact-form" noValidate onSubmit={event=>{
  event.preventDefault()
  const result=propertyContactFields(fields)
  setErrors(result.errors)
  if(result.valid)onSave(result.value)
 }}>
  <h4>{initial?'Edit '+initial.name:'Add someone not on Rural Connections'}</h4>
  <p className="muted">Only you can see these details.</p>
  {field('name','Name',{type:'text',autoComplete:'name',required:true})}
  {field('phone','Phone (optional)',{type:'tel',autoComplete:'tel',inputMode:'tel'})}
  {field('email','Email (optional)',{type:'email',autoComplete:'email',autoCapitalize:'none',spellCheck:false})}
  {field('note','Note (optional)',{type:'text'})}
  <div className="lform-actions">
   <button className="lform-save" disabled={busy}>{initial?'Save contact':'Save and link'}</button>
   <button className="lform-cancel" type="button" onClick={onCancel}>Cancel</button>
   {onDelete&&<button className="lform-cancel" type="button" disabled={busy} onClick={onDelete}>Delete contact</button>}
  </div>
 </form>
}

export function PropertyNetwork({owner,initialArea,preferredArea}:{owner:string;initialArea?:string;preferredArea?:string|null}){
 const [client]=useState(createClient)
 const [changing,setChanging]=useState<{service:string;provider:string}|null>(null)
 const [relationships,setRelationships]=useState<Record<string,string>>({})
 const [data,setData]=useState<NetworkData|null>(null)
 const [selected,setSelected]=useState(initialArea || '')
 const [highlight,setHighlight]=useState(initialArea || '')
 const [setupOpen,setSetupOpen]=useState(false)
 const [skipped,setSkipped]=useState(false)
 const [picks,setPicks]=useState<string[]>([])
 const [pickerMode,setPickerMode]=useState<'provider'|'contact'>('provider')
 const [addingOpen,setAddingOpen]=useState(false)
 const [matchKey,setMatchKey]=useState('')
 const [locality,setLocality]=useState(matchLocality(preferredArea)||'')
 const [region,setRegion]=useState('')
 const [widen,setWiden]=useState(false)
 const [matches,setMatches]=useState<PropertyMatch[]|null>(null)
 const [matchBusy,setMatchBusy]=useState(false)
 const [matchError,setMatchError]=useState('')
 const matchRequest=useRef(0)
 const [providerSearch,setProviderSearch]=useState('')
 const [providerLimit,setProviderLimit]=useState(12)
 const [list,setList]=useState(true)
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')
 const [feedback,setFeedback]=useState('')
 const [serviceName,setServiceName]=useState('')
 const [picker,setPicker]=useState<string|null>(null)
 const [providerGroups,setProviderGroups]=useState<ProviderGroup[]|null>(null)
 const [providerError,setProviderError]=useState('')
 const [choices,setChoices]=useState<InviteChoices|null>(null)
 const [inviteTarget,setInviteTarget]=useState('')
 const [loadingInvites,setLoadingInvites]=useState(false)
 const inviteLock=useRef(false)
 const [contactForm,setContactForm]=useState<{serviceKey:string;contact?:PropertyContact}|null>(null)
 const [replacing,setReplacing]=useState<PropertyContact|null>(null)
 const addingContact=useRef<{id:string;name:string}|null>(null)
 const overview=useRef<HTMLElement>(null)
 const areaHeading=useRef<HTMLHeadingElement>(null)
 const lock=useRef(false)
 const pickerRequest=useRef(0)
 const addingService=useRef<{area:string;name:string;key:string}|null>(null)
 const load=useCallback(async()=>{
  try{setData(await loadPropertyNetwork(client,owner))
   try{const [saved,worked]=await Promise.all([loadSavedProviders(client,owner),loadConnections(client,owner,'locals')]);setRelationships(Object.fromEntries([...saved.map(person=>[person.id,'Saved in My People']),...worked.map(row=>[row.personId,`Worked together ${row.times} time${row.times===1?'':'s'}`])]))}catch{setRelationships({})}
  }
  catch{setError('Could not load My Property Network. Try again.')}
 },[client,owner])
 useEffect(()=>{void load()},[load])
 const areas=data?propertyAreas(data):[]
 const active=areas.filter(area=>area.active)
 const current=active.find(area=>area.id===selected)
 const spokes=propertySpokes(active.length)

 function selectArea(id:AreaId|''){
  closeMatches()
  pickerRequest.current++
  setChanging(null);setSelected(id);if(id)setHighlight(id);setPicker(null);setServiceName('');setAddingOpen(false);setContactForm(null);setReplacing(null);setSetupOpen(false)
  window.history.replaceState(null,'',id?'?area='+id:window.location.pathname)
  requestAnimationFrame(()=>{
   if(id)areaHeading.current?.focus()
   else (overview.current?.querySelector<HTMLButtonElement>('[data-area="'+highlight+'"]')
    ||overview.current?.querySelector<HTMLButtonElement>('[data-view-toggle]'))?.focus()
  })
 }

 function closeMatches(){
  matchRequest.current++;setMatchKey('');setMatchBusy(false);setMatches(null)
 }

 async function findMatches(service:PropertyService,category:string){
  const request=++matchRequest.current
  setMatchKey(service.service_key);setMatches(null);setMatchError('')
  if(!matchLocality(locality)&&!(widen&&matchLocality(region))){setMatchBusy(false);return}
  setMatchBusy(true)
  try{
   const [saved,worked]=await Promise.all([loadSavedProviders(client,owner),loadConnections(client,owner,'locals')])
   const result=await loadPropertyMatches(client,owner,propertyNeed(service,category),locality,widen?region:'',
    saved.map(person=>person.id),worked.flatMap(row=>row.person?[row.person.id]:[]))
   if(request===matchRequest.current)setMatches(result)
  }catch{if(request===matchRequest.current)setMatchError('Could not find providers. Try again.')}
  finally{if(request===matchRequest.current)setMatchBusy(false)}
 }

 async function mutate(action:()=>Promise<void>,message:string){
  if(lock.current)return false
  lock.current=true;setBusy(true);setError('');setFeedback('')
  try{
   await action()
   setFeedback(message)
   await load()
   return true
  }catch{setError('Could not save this change. Try again.');return false}
  finally{lock.current=false;setBusy(false)}
 }

 async function openPicker(service:PropertyService,{category,kind}:{category:string;kind:ListingKind}){
  const request=++pickerRequest.current
  setPicker(service.service_key);setProviderGroups(null);setProviderError('');setProviderSearch('');setProviderLimit(12)
  try{
   const [saved,worked,discovered]=await Promise.all([
    loadSavedProviders(client,owner),loadConnections(client,owner,'locals'),
    discoverPropertyProviders(client,owner,category,kind),
   ])
   if(request!==pickerRequest.current)return
   setProviderGroups([
    {label:'My People · Saved',people:saved},
    {label:'My People · Worked together',people:worked.flatMap(row=>row.person?[{...row.person,display_name:null}]:[])},
    {label:'Provider discovery',people:discovered},
   ])
  }catch{if(request===pickerRequest.current)setProviderError('Could not load providers. Try again.')}
 }

 async function chooseProvider(service:PropertyService,person:PropertyProvider){
  if(changing?.service===service.service_key){
   if(await mutate(()=>replacePropertyProvider(client,service,changing.provider,person.id),'Provider assignment changed.')){setChanging(null);setPicker(null)}
  }else await mutate(()=>setPropertyProvider(client,owner,service,person.id,true),'Provider linked.')
 }
 async function addService(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault()
  const name=serviceName.trim()
  if(!name||!current)return
  const previous=addingService.current
  const key=previous?.area===current.id&&previous.name===name?previous.key:'custom-'+crypto.randomUUID()
  addingService.current={area:current.id,name,key}
  if(await mutate(()=>savePropertyService(client,owner,{area:current.id,service_key:key,name,status:null},true),'Service added.')){
   addingService.current=null
   setServiceName('');setAddingOpen(false)
  }
 }

 async function refreshInviteChoices(provider:string){
  if(inviteLock.current)return
  inviteLock.current=true
  setInviteTarget(provider)
  setLoadingInvites(true)
  try{setChoices(await loadInviteChoices(client,owner))}
  catch{setChoices(null);setError('Could not load open jobs. Try inviting again.')}
  finally{inviteLock.current=false;setLoadingInvites(false)}
 }

 async function saveContact(service:PropertyService,value:ContactValue){
  const editing=contactForm?.contact
  if(editing){
   if(await mutate(()=>updatePropertyContact(client,owner,editing.id,value),'Contact saved.'))setContactForm(null)
   return
  }
  const previous=addingContact.current
  const id=previous?.name===value.name?previous.id:crypto.randomUUID()
  addingContact.current={id,name:value.name}
  if(await mutate(async()=>{
   await createPropertyContact(client,owner,id,value)
   await setPropertyContact(client,owner,service,id,true)
  },value.name+' added.')){addingContact.current=null;setContactForm(null);setPicker(null)}
 }

 async function deleteContact(contact:PropertyContact){
  const count=data?propertyContactServices(data,contact.id).length:0
  if(!window.confirm('Delete '+contact.name+'? '+(count>1?'They will be removed from '+count+' services.':'They will be removed from My Property Network.')))return
  if(await mutate(()=>deletePropertyContact(client,owner,contact.id),'Contact deleted.'))setContactForm(null)
 }

 // Share where the browser can; otherwise copy the invitation to paste anywhere.
 async function inviteContact(contact:PropertyContact){
  const text=propertyContactInviteText(contact)
  try{
   if(navigator.share){await navigator.share({text});return}
   await navigator.clipboard.writeText(text)
   setFeedback('Invitation copied. Paste it into a text or email to '+contact.name+'.')
  }catch(error){
   if((error as Error)?.name!=='AbortError')setFeedback('Copy this invitation: '+text)
  }
 }

 function startReplace(service:PropertyService,contact:PropertyContact,target:{category:string;kind:ListingKind}){
  setContactForm(null);setReplacing(contact);setPickerMode('provider');void openPicker(service,target)
 }

 async function replaceContact(person:PropertyProvider){
  if(!replacing||!data)return
  const contact=replacing,count=propertyContactServices(data,contact.id).length
  if(await mutate(()=>replacePropertyContact(client,contact.id,person.id),
   propertyProviderName(person)+' now covers '+(count===1?'this service':count+' services')+' instead of '+contact.name+'.')){
   setReplacing(null);setPicker(null)
  }
 }

 function providerLink(person:PropertyProvider){
  return <Link href={'/people/'+person.id} className="card-link">{propertyProviderName(person)}</Link>
 }

 // ---- Simpler setup -------------------------------------------------------
 const started=data?propertySetupStarted(data):false
 const showSetup=!!data&&!current&&(setupOpen||(!started&&!skipped))
 const gaps=propertyGaps(areas)

 function openSetup(){
  setPicks(active.map(area=>area.id));setSetupOpen(true);setFeedback('')
  requestAnimationFrame(()=>document.getElementById('property-setup-heading')?.focus())
 }

 async function saveSetup(){
  if(await mutate(()=>savePropertyAreas(client,owner,picks),started?'Property areas saved.':'Your network is set up.')){setSetupOpen(false);setSkipped(false);setList(true)}
 }

 // From the gaps list: open the area and start the local search for that service.
 function findHelp(area:AreaView,service:PropertyService){
  selectArea(area.id)
  void findMatches(service,propertyServiceTarget(area,service).category)
 }

 async function tapChoice(service:PropertyService,choice:PropertyChoice,assigned=0){
  const status=propertyChoiceStatus(service.status,choice,assigned)
  if(status===service.status)return // Sorted with someone assigned: nothing to change
  closeMatches();pickerRequest.current++;setPicker(null);setContactForm(null);setReplacing(null)
  await mutate(()=>savePropertyService(client,owner,{...service,status}),
   status?service.name+': '+PROPERTY_CHOICES.find(([value])=>value===choice)?.[1]+'.':service.name+' cleared.')
 }

 function togglePicker(service:PropertyService,target:{category:string;kind:ListingKind},mode:'provider'|'contact'){
  setChanging(null)
  setReplacing(null);setContactForm(null)
  if(picker===service.service_key&&pickerMode===mode){pickerRequest.current++;setPicker(null);return}
  setPickerMode(mode)
  if(mode==='provider')void openPicker(service,target)
  else{pickerRequest.current++;setPicker(service.service_key)}
 }

 // Removing the last provider or contact puts the service back to plain Sorted.
 async function unlink(service:PropertyService,remaining:number,action:()=>Promise<void>,message:string,name?:string){
  if(!window.confirm('Remove '+(name||'this link')+' from '+service.name+'?'+(remaining?'':' '+service.name+' goes back to plain Sorted.')+' They stay in My People.'))return
  await mutate(async()=>{
   await action()
   const status=propertyStatusAfterUnlink(service.status,remaining)
   if(status!==service.status)await savePropertyService(client,owner,{...service,status:status??null})
  },message)
 }

 async function bulk(area:AreaView,status:'sorted'|'irrelevant'){
  const {updates,kept}=propertyBulkServices(area.services,status)
  if(!updates.length)return
  // Only unanswered services change: answers and helpers are never overwritten.
  await mutate(()=>savePropertyServices(client,owner,updates),propertyBulkMessage(updates.length,kept,status))
 }

 async function removeArea(area:AreaView){
  if(!window.confirm('Remove '+area.label+' from your property? Your answers are kept if you add it back.'))return
  if(await mutate(()=>setPropertyArea(client,owner,area.id,false),area.label+' removed from your property.'))selectArea('')
 }

 return <section className="page work-page property-network">
  <header className="home-heading"><div><h1>My Property Network</h1><p className="muted">Who helps with your property, and what still needs someone.</p></div></header>
  <nav className="activity-segments" aria-label="My Property"><Link href="/property-network" aria-current="page">My Network</Link>
   <Link href="/connections?view=locals">My People</Link></nav>
  {error&&<p role="alert">{error} <button className="lform-cancel" type="button" onClick={()=>{setError('');void load()}}>Retry</button></p>}
  {feedback&&<p role="status">{feedback}</p>}
  {!data&&!error&&<p role="status">Loading My Property Network…</p>}
  {data&&<div className="property-layout">
   {showSetup&&<section className="property-setup" aria-labelledby="property-setup-heading">
    <h2 id="property-setup-heading" tabIndex={-1}>What&apos;s on your property?</h2>
    <p className="muted">{started?'Tick the parts of your property to show. Unticking one hides it; its answers and providers are kept if you add it back.':<>Tap everything that applies. We&apos;ll set up your network to match. You can change it any time.</>}</p>
    <div className="property-setup-tiles" role="group" aria-label="What's on your property">
     {SUPPORT_AREAS.map(area=>{
      const on=picks.includes(area.id)
      return <button type="button" key={area.id} className="property-setup-tile" aria-pressed={on}
       onClick={()=>setPicks(current=>on?current.filter(id=>id!==area.id):[...current,area.id])}>
       <span className="property-setup-top"><strong>{area.label}</strong>
        <span aria-hidden="true" className="property-check">{on&&<Check size={13} strokeWidth={3}/>}</span></span>
       <small>{PROPERTY_AREA_DESCRIPTIONS[area.id]}</small>
      </button>
     })}
    </div>
    <div className="property-setup-actions">
     <button type="button" className="lform-save" disabled={busy||!picks.length} onClick={()=>void saveSetup()}>
      {!picks.length?'Choose at least one':started?'Save property areas':'Set up my network ('+picks.length+' area'+(picks.length===1?'':'s')+')'}</button>
     <button type="button" className="lform-cancel" onClick={()=>{if(started)setSetupOpen(false);else setSkipped(true)}}>{started?'Cancel':'Skip for now'}</button>
    </div>
   </section>}
   {!showSetup&&<section hidden={!!current} ref={overview} className="property-overview">
    {gaps.length>0?<section className="property-gaps" aria-labelledby="property-gaps-heading">
     <h2 id="property-gaps-heading">Services needing help ({gaps.length})</h2>
     <ul>{gaps.map(({area,service})=><li key={area.id+service.service_key} className="property-gap-row">
      <span><strong>{service.name}</strong><small>{area.label}</small></span>
      <button type="button" className="lform-save" onClick={()=>findHelp(area,service)}>Find help</button>
      <Link href={propertyPostPath(area,service)} className="property-post-job">Post a job</Link>
     </li>)}</ul>
    </section>:active.length>0&&<p className="muted property-quiet">{propertyNetworkCounts(areas).review?'No services marked Needs help yet. Finish reviewing your areas.':'No services currently marked Needs help.'}</p>}
    <section aria-labelledby="property-parts-heading">
     <div className="property-parts-head">
      <h2 id="property-parts-heading">Your property</h2>
      {active.length>0&&<span role="group" aria-label="Network view" className="property-view-switch">
       <button type="button" data-view-toggle aria-pressed={list} onClick={()=>setList(true)}>List</button>
       <button type="button" aria-pressed={!list} onClick={()=>setList(false)}>Diagram</button>
      </span>}
     </div>
     {!active.length?<div className="property-empty">
      <p>Tell us what&apos;s on your property and we&apos;ll set up your network to match.</p>
      <button type="button" className="lform-save" onClick={openSetup}>Choose what&apos;s on your property</button>
     </div>:list?<ul className="property-area-cards">
      {active.map(area=>{
       const progress=propertyAreaProgress(area,propertyAreaWho(data,area))
       return <li key={area.id}><button type="button" className="property-area-card" data-area={area.id} onClick={()=>selectArea(area.id)}>
        <span className="property-card-top"><span className="property-card-title"><PropertyAreaIcon area={area.id} size={20}/>{area.label}</span>
         <span className={'property-status-tag '+progress.tone}>{progress.tag}</span></span>
        <span aria-hidden="true" className="property-bar">
         {progress.sorted>0&&<span className="sorted" style={{flexGrow:progress.sorted}}/>}
         {progress.help>0&&<span className="help" style={{flexGrow:progress.help}}/>}
         {progress.left>0&&<span className="left" style={{flexGrow:progress.left}}/>}
        </span>
        <small className="muted">{progress.summary}</small>
       </button></li>
      })}
      <li><Link href="/property-network/map" className="property-map-link">My Property map</Link></li>
     </ul>:<div className="property-diagram" aria-label="Property diagram" style={{aspectRatio:1/propertyDiagramRatio(active.length)}}>
      {active.map((area,index)=><span key={area.id} aria-hidden="true" className={'property-spoke'+(area.hasProvider?' linked':'')}
       style={{width:spokes[index].length+'%',transform:'rotate('+spokes[index].angle+'deg)'}}/>)}
      <Link className="property-centre" href="/property-network/map">My Property</Link>
      {active.map((area,index)=><button type="button" className="property-node" data-area={area.id}
       style={{left:spokes[index].x+'%',top:spokes[index].y+'%',width:PROPERTY_NODE_WIDTH+'%',minHeight:PROPERTY_NODE_HEIGHT}} key={area.id}
       aria-pressed={highlight===area.id} onClick={()=>selectArea(area.id)}>
       <PropertyAreaIcon area={area.id}/>{area.label}<AreaBadges area={area}/>
      </button>)}
     </div>}
     {active.length>0&&<>
      <button type="button" className="property-add-area" onClick={openSetup}>+ Add another part of your property</button>
      <button type="button" className="lform-cancel property-update-link" onClick={openSetup}>Update what&apos;s on your property</button>
     </>}
    </section>
   </section>}
   {data&&<p className="muted">{propertyNetworkCounts(areas).help} areas marked Needs help · {propertyNetworkCounts(areas).review} areas to review</p>}
   {current&&<section className="property-area-panel" aria-labelledby="property-area-heading">
    <button type="button" className="lform-cancel" onClick={()=>selectArea('')}>Back to My Property Network</button>
    <h2 id="property-area-heading" tabIndex={-1} ref={areaHeading}><PropertyAreaIcon area={current.id} size={26}/> {current.label}</h2>
    <p className="muted">Choose who helps from My People, or leave an area unassigned. Assignments are private and do not notify providers.</p>
    <div className="property-bulk">
     {current.services.some(service=>!service.status)&&<>
      <button type="button" className="property-pill" disabled={busy} onClick={()=>void bulk(current,'sorted')}>{propertyBulkLabel('sorted',current.services.filter(service=>service.status).length)}</button>
      <button type="button" className="property-pill quiet" disabled={busy} onClick={()=>void bulk(current,'irrelevant')}>{propertyBulkLabel('irrelevant',current.services.filter(service=>service.status).length)}</button>
     </>}
    </div>
    <PropertyAreaJobs key={owner+current.id} owner={owner} area={current.id}/>
    {current.services.map(service=>{
     const linked=linkedPropertyProviders(data,service)
     const contacts=linkedPropertyContacts(data,service)
     const covered=linked.length+contacts.length
     const choice=propertyServiceChoice(service.status)
     const replacingHere=replacing&&picker===service.service_key?replacing:null
     const target=propertyServiceTarget(current,service),category=target.category
     const postPath=propertyPostPath(current,service)
     const providerOpen=picker===service.service_key&&(pickerMode==='provider'||!!replacingHere)
     const contactOpen=picker===service.service_key&&pickerMode==='contact'&&!replacingHere
     return <article className="property-service" key={service.service_key}>
      <h3>{service.name}</h3>
      <div role="group" aria-label={service.name+' status'} className="property-choices">
       {PROPERTY_CHOICES.map(([value,label])=><button type="button" key={value} className={'property-choice '+value}
        aria-pressed={choice===value} disabled={busy} onClick={()=>void tapChoice(service,value,covered)}>{label}</button>)}
      </div>
      {(choice==='sorted'||choice==='help'||covered>0)&&<div className="property-who">
       <span className="muted">Who does it? (optional)</span>
       <div className="property-who-chips">
        <button type="button" className="property-chip" aria-pressed={service.status==='self'} disabled={busy}
         onClick={()=>void mutate(()=>savePropertyService(client,owner,{...service,status:propertyWhoMeStatus(service.status)}),'Saved.')}>Me</button>
        <button type="button" className="property-chip" aria-pressed={linked.length>0} aria-expanded={providerOpen}
         onClick={()=>togglePicker(service,target,'provider')}>{linked.length?linked.map(propertyProviderName).join(', ')+' ✓':'Choose from My People'}</button>
        <button type="button" className="property-chip" aria-pressed={contacts.length>0} aria-expanded={contactOpen}
         onClick={()=>togglePicker(service,target,'contact')}>{contacts.length?contacts.map(contact=>contact.name).join(', ')+' ✓':'Someone not on RC'}</button>
       </div>
       {linked.length>0&&<ul className="property-linked">{linked.map(person=><li key={person.id}>
        {providerLink(person)}<span className="muted">{relationships[person.id]||'Linked privately to this service'}</span>
        <button type="button" className="lform-cancel" onClick={()=>{setChanging({service:service.service_key,provider:person.id});setPickerMode('provider');void openPicker(service,target)}}>Change provider</button>
        <Link href={propertyPostPath(current,service,person.id)}>Post a job for this provider</Link>
        <button className="lform-cancel" type="button" disabled={busy} onClick={()=>void unlink(service,covered-1,
         ()=>setPropertyProvider(client,owner,service,person.id,false),'Provider link removed.',propertyProviderName(person))}>Remove link</button>
        {choices?<ProviderInviteAction provider={person.id} choices={choices} initiallyOpen={inviteTarget===person.id}/>
         :<button type="button" className="lform-cancel" disabled={loadingInvites} onClick={()=>void refreshInviteChoices(person.id)}>
           {loadingInvites?'Loading open jobs…':'Invite to job'}
          </button>}
       </li>)}</ul>}
       {contacts.length>0&&<ul className="property-linked">{contacts.map(contact=><li key={contact.id} className="property-contact">
        <span><strong>{contact.name}</strong> <span className="property-tag">Not on Rural Connections</span></span>
        {(contact.phone||contact.email||contact.note)&&<span className="muted property-contact-details">
         {[contact.phone,contact.email,contact.note].filter(Boolean).join(' · ')}</span>}
        <span className="lform-actions">
         {contact.phone&&<a className="card-link" href={propertyContactPhoneHref(contact.phone)}>Call</a>}
         {contact.email&&<a className="card-link" href={propertyContactEmailHref(contact.email)}>Email</a>}
         <button className="lform-cancel" type="button" disabled={busy} aria-expanded={contactForm?.contact?.id===contact.id}
          onClick={()=>setContactForm({serviceKey:service.service_key,contact})}>Edit</button>
         <button className="lform-cancel" type="button" onClick={()=>void inviteContact(contact)}>Invite to Rural Connections</button>
         <button className="lform-cancel" type="button" disabled={busy} onClick={()=>startReplace(service,contact,target)}>Replace with member</button>
         <button className="lform-cancel" type="button" disabled={busy}
          onClick={()=>void unlink(service,covered-1,()=>setPropertyContact(client,owner,service,contact.id,false),'Contact link removed.',contact.name)}>Remove link</button>
        </span>
        {contactForm?.contact?.id===contact.id&&contactForm.serviceKey===service.service_key&&<ContactForm key={contact.id} initial={contact} busy={busy}
         onSave={value=>void saveContact(service,value)} onCancel={()=>setContactForm(null)} onDelete={()=>void deleteContact(contact)}/>}
       </li>)}</ul>}
      </div>}
      {choice==='help'&&<div className="lform-actions">
       <button type="button" className="lform-save" aria-expanded={matchKey===service.service_key}
        onClick={()=>matchKey===service.service_key?closeMatches():void findMatches(service,category)}>Find local help</button>
       <Link href={postPath} className="property-post-job">Post a job</Link>
      </div>}
      {matchKey===service.service_key&&<section className="property-picker" aria-label={'Providers for '+service.name}>
       <h4>Find providers for {service.name}</h4>
       <form onSubmit={event=>{event.preventDefault();void findMatches(service,category)}}>
        <label className="lform-field">Town or locality<input value={locality} maxLength={70} onChange={event=>setLocality(event.target.value)}/></label>
        <label className="account-setting"><input type="checkbox" checked={widen} onChange={event=>setWiden(event.target.checked)}/>Include a wider region</label>
        {widen&&<label className="lform-field">Region<input value={region} maxLength={70} onChange={event=>setRegion(event.target.value)}/></label>}
        <button type="submit" className="lform-cancel" disabled={matchBusy||!(matchLocality(locality)||(widen&&matchLocality(region)))}>Search providers</button>
       </form>
       {matchBusy&&<p role="status">Finding providers…</p>}
       {matchError&&<p role="alert">{matchError}</p>}
       {matches?.length===0&&<p role="status">No matching providers advertise services in the selected area. Try including a wider region.</p>}
       {matches?.map(person=><article className="property-service" key={person.id}>
        <h5>{person.avatar_url&&<img className="account-avatar" alt="" src={person.avatar_url}/>} {propertyProviderName(person)}</h5>
        <p>{person.services.join(' · ')}</p><p className="muted">{person.reason}</p>
        {person.rating&&<p>{person.rating} out of 5 · {person.reviewCount} provider reviews</p>}
        {(person.saved||person.worked)&&<p>{[person.saved?'Saved':'',person.worked?'Worked together':''].filter(Boolean).join(' · ')}</p>}
        <div className="lform-actions">{providerLink(person)}
         {!person.saved&&<button type="button" className="lform-cancel" disabled={busy} onClick={async()=>{
          if(await mutate(()=>setProviderSaved(client,owner,person.id,true),'Saved to My People.'))
           setMatches(rows=>rows?.map(row=>row.id===person.id?{...row,saved:true}:row)??null)
         }}>Save to My People</button>}
         <button type="button" className="lform-cancel" disabled={busy||linked.some(row=>row.id===person.id)} onClick={()=>void mutate(
          ()=>setPropertyProvider(client,owner,service,person.id,true),'Provider linked.')}>
          {linked.some(row=>row.id===person.id)?'Added to Property Network':'Add to Property Network'}</button>
         {choices?<ProviderInviteAction provider={person.id} choices={choices} initiallyOpen={inviteTarget===person.id}/>
          :<button type="button" className="lform-cancel" disabled={loadingInvites} onClick={()=>void refreshInviteChoices(person.id)}>Invite to job</button>}
        </div>
       </article>)}
       <Link href={postPath} className="card-link">Post a job</Link>
      </section>}
      {providerOpen&&<section className="property-picker">
       {changing?.service===service.service_key&&<button type="button" onClick={()=>{setChanging(null);setPicker(null)}}>Cancel changing provider</button>}
       <h4>{replacingHere?'Choose the member who replaces '+replacingHere.name:changing?.service===service.service_key?'Choose replacement provider':'Choose a provider'}</h4>
       {replacingHere&&<p className="muted">They will be linked to every service {replacingHere.name} covers, and {replacingHere.name}&apos;s private contact details will be deleted.</p>}
       {providerGroups&&<label className="lform-field">Find by name or region
        <input value={providerSearch} onChange={event=>{setProviderSearch(event.target.value);setProviderLimit(12)}}/>
       </label>}
       {providerError?<p role="alert">{providerError} <button type="button" onClick={()=>void openPicker(service,target)}>Retry</button></p>
        :!providerGroups?<p role="status">Loading providers…</p>:providerGroups.map(group=>{
         const available=filterPropertyProviders(group.people,linked,providerSearch)
         return <section key={group.label}><h5>{group.label}</h5>{available.length===0?<p className="muted">No unassigned people match in this group.</p>
          :<ul className="property-linked">{available.slice(0,providerLimit).map(person=><li key={person.id}>
           {providerLink(person)} {relationships[person.id]&&<span className="muted">{relationships[person.id]}</span>} {person.region&&<span className="muted">{person.region}</span>}
           {replacingHere?<button type="button" className="lform-cancel" disabled={busy}
            onClick={()=>void replaceContact(person)}>Replace {replacingHere.name}</button>
           :<button type="button" className="lform-cancel" disabled={busy}
            onClick={()=>void chooseProvider(service,person)}>{changing?.service===service.service_key?'Replace provider':'Link to service'}</button>}
          </li>)}</ul>}
          {available.length>providerLimit&&<button className="lform-cancel" type="button" onClick={()=>setProviderLimit(value=>value+12)}>Show more providers</button>}
         </section>
        })}
       {replacingHere?<button type="button" className="lform-cancel" onClick={()=>{setReplacing(null);setPicker(null)}}>Cancel replacing</button>
        :<Link href={propertyDiscoveryPath(category,target.kind)} className="card-link">Browse more providers</Link>}
      </section>}
      {contactOpen&&<section className="property-picker" aria-labelledby={'contacts-'+service.service_key}>
       <h4 id={'contacts-'+service.service_key}>Not on Rural Connections</h4>
       {data.contacts.some(contact=>!contacts.some(row=>row.id===contact.id))&&<ul className="property-linked">
        {data.contacts.filter(contact=>!contacts.some(row=>row.id===contact.id)).map(contact=><li key={contact.id}>
         {contact.name}
         <button type="button" className="lform-cancel" disabled={busy}
          onClick={()=>void mutate(()=>setPropertyContact(client,owner,service,contact.id,true),contact.name+' linked.')}>Link to service</button>
        </li>)}
       </ul>}
       {contactForm?.serviceKey===service.service_key&&!contactForm.contact
        ?<ContactForm busy={busy} onSave={value=>void saveContact(service,value)} onCancel={()=>setContactForm(null)}/>
        :<button type="button" className="lform-cancel" onClick={()=>setContactForm({serviceKey:service.service_key})}>Add someone not on Rural Connections</button>}
      </section>}
     </article>
    })}
    {addingOpen?<form className="lform" onSubmit={addService}>
     <label className="lform-field">Another service for {current.label}<input value={serviceName} onChange={event=>setServiceName(event.target.value)} maxLength={80} required autoFocus/></label>
     <div className="lform-actions"><button className="lform-save" disabled={busy||!serviceName.trim()}>Add</button>
      <button type="button" className="lform-cancel" onClick={()=>{setAddingOpen(false);setServiceName('')}}>Cancel</button></div>
    </form>:<button type="button" className="property-add-area" onClick={()=>setAddingOpen(true)}>+ Add another service</button>}
    <button type="button" className="property-remove" disabled={busy} onClick={()=>void removeArea(current)}>Remove {current.label} from my property</button>
   </section>}
  </div>}
 </section>
}
