'use client'

import {useCallback,useEffect,useRef,useState} from 'react'
import Link from '@/components/navigation-link'
import {createClient} from '@/lib/supabase/client'
import {loadConnections} from '@/lib/connections-data'
import {loadInviteChoices,loadSavedProviders,setProviderSaved} from '@shared/trustedLocals'
import {loadPropertyMatches,matchLocality,propertyNeed,type PropertyMatch} from '@shared/propertyMatching'
import {ProviderInviteAction} from '../connections/provider-actions'
import {Plus} from 'lucide-react'
import {PropertyAreaIcon} from './area-icon'
import {
 PROPERTY_AREA_DESCRIPTIONS,PROPERTY_NODE_HEIGHT,PROPERTY_NODE_WIDTH,PROPERTY_SERVICE_STATES,propertyAreaStatus,filterPropertyProviders,discoverPropertyProviders,linkedPropertyProviders,loadPropertyNetwork,
 propertyAreas,propertyDiagramRatio,propertyDiscoveryPath,propertyJobCategory,propertyProviderName,propertyServiceTarget,propertySpokes,
 savePropertyService,setPropertyArea,setPropertyProvider,
 type AreaId,type NetworkData,type PropertyProvider,type PropertyService,type ServiceStatus,
} from '@shared/propertyNetwork'
import type {ListingKind} from '@shared/listingPricing'
import {
} from '@shared/propertyNetwork'

type ProviderGroup={label:string;people:PropertyProvider[]}
type InviteChoices=Awaited<ReturnType<typeof loadInviteChoices>>

function AreaBadges({area}:{area:ReturnType<typeof propertyAreas>[number]}){
 return <span className="property-badges">{propertyAreaStatus(area).map(badge=>
  <span key={badge.tone} className={'property-badge '+badge.tone}>{badge.label}</span>
 )}</span>
}

export function PropertyNetwork({owner,initialArea,preferredArea}:{owner:string;initialArea?:string;preferredArea?:string|null}){
 const [client]=useState(createClient)
 const [data,setData]=useState<NetworkData|null>(null)
 const [selected,setSelected]=useState(initialArea || '')
 const [highlight,setHighlight]=useState(initialArea || '')
 const [statusFor,setStatusFor]=useState('')
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
 const [list,setList]=useState(false)
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
 const overview=useRef<HTMLElement>(null)
 const areaHeading=useRef<HTMLHeadingElement>(null)
 const lock=useRef(false)
 const pickerRequest=useRef(0)
 const addingService=useRef<{area:string;name:string;key:string}|null>(null)
 const load=useCallback(async()=>{
  try{setData(await loadPropertyNetwork(client,owner))}
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
  setSelected(id);if(id)setHighlight(id);setPicker(null);setStatusFor('');setServiceName('')
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
    {label:'Saved',people:saved},
    {label:'Worked together',people:worked.flatMap(row=>row.person?[{...row.person,display_name:null}]:[])},
    {label:'Provider discovery',people:discovered},
   ])
  }catch{if(request===pickerRequest.current)setProviderError('Could not load providers. Try again.')}
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
   setServiceName('')
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

 function providerLink(person:PropertyProvider){
  return <Link href={'/people/'+person.id} className="card-link">{propertyProviderName(person)}</Link>
 }

 return <section className="page work-page property-network">
  <header className="home-heading"><div><h1>My Property Network</h1><p className="muted">See who helps with your property and where you still need support.</p></div></header>
  <nav className="activity-segments" aria-label="My Property"><Link href="/property-network" aria-current="page">My Network</Link>
   <Link href="/connections?view=locals">My People</Link></nav>
  {error&&<p role="alert">{error} <button className="lform-cancel" type="button" onClick={()=>{setError('');void load()}}>Retry</button></p>}
  {feedback&&<p role="status">{feedback}</p>}
  {!data&&!error&&<p role="status">Loading My Property Network…</p>}
  {data&&<div className="property-layout">
   <section hidden={!!current} ref={overview}>
    <div className="lform-actions" aria-label="Network view">
     <button className="lform-cancel" type="button" data-view-toggle aria-pressed={!list} onClick={()=>setList(false)}>Diagram</button>
     <button className="lform-cancel" type="button" aria-pressed={list} onClick={()=>setList(true)}>List</button>
    </div>
    {list?<ul className="property-area-list">
     <li><Link href="/property-network/map">My Property</Link></li>
     {active.map(area=>
     <li key={area.id}><button type="button" data-area={area.id} aria-pressed={highlight===area.id} onClick={()=>selectArea(area.id)}>
      <PropertyAreaIcon area={area.id} size={20}/> {area.label} <AreaBadges area={area}/>
     </button></li>
    )}</ul>:<div className="property-diagram" aria-label="Property diagram" style={{aspectRatio:1/propertyDiagramRatio(active.length)}}>
     {active.map((area,index)=><span key={area.id} aria-hidden="true" className={'property-spoke'+(area.hasProvider?' linked':'')}
      style={{width:spokes[index].length+'%',transform:'rotate('+spokes[index].angle+'deg)'}}/>)}
     <Link className="property-centre" href="/property-network/map">My Property</Link>
     {active.map((area,index)=><button type="button" className="property-node" data-area={area.id}
      style={{left:spokes[index].x+'%',top:spokes[index].y+'%',width:PROPERTY_NODE_WIDTH+'%',minHeight:PROPERTY_NODE_HEIGHT}} key={area.id}
      aria-pressed={highlight===area.id} onClick={()=>selectArea(area.id)}>
      <PropertyAreaIcon area={area.id}/>{area.label}<AreaBadges area={area}/>
     </button>)}
    </div>}
    {!active.length&&<p>Add a support area to get started.</p>}
    <section className="property-library" aria-labelledby="property-library-heading">
     <h2 id="property-library-heading">Grow your network</h2>
     <p className="muted">Add other areas where you may need help.</p>
     <div className="property-library-tiles">{areas.filter(area=>!area.active).map(area=>
      <button className="property-library-tile" type="button" key={area.id} aria-label={'Add '+area.label}
       disabled={busy} onClick={()=>void mutate(()=>setPropertyArea(client,owner,area.id,true),area.label+' added.')}>
       <PropertyAreaIcon area={area.id}/>
       <span><strong>{area.label}</strong><small>{PROPERTY_AREA_DESCRIPTIONS[area.id]}</small></span>
       <Plus size={22} strokeWidth={2} aria-hidden="true" className="property-area-icon"/>
      </button>
     )}</div>
     {areas.every(area=>area.active)&&<p className="muted">All support areas are in your network.</p>}
    </section>
   </section>
   {current&&<section className="property-area-panel" aria-labelledby="property-area-heading">
    <button type="button" className="lform-cancel" onClick={()=>selectArea('')}>Back to My Property Network</button>
    <h2 id="property-area-heading" tabIndex={-1} ref={areaHeading}><PropertyAreaIcon area={current.id} size={26}/> {current.label}</h2>
    <p className="muted">{PROPERTY_AREA_DESCRIPTIONS[current.id]}</p>
    {current.services.map(service=>{
     const linked=linkedPropertyProviders(data,service)
     const target=propertyServiceTarget(current,service),category=target.category
     const postPath='/jobs/new?'+new URLSearchParams({category:propertyJobCategory(current,service)})
     return <article className="property-service" key={service.service_key}>
      <h3>{service.name}</h3>
      <p className={service.status==='needs_help'?'property-gap':'muted'}>{service.status==='needs_help'?'Find help':
       service.status==='has_provider'&&linked.length?'Provider linked':service.status?PROPERTY_SERVICE_STATES[service.status]:'Not set up'}</p>
      {!!linked.length&&<p className="muted">{linked.map(propertyProviderName).join(', ')}</p>}
      <div className="lform-actions">
       {(service.status==='needs_help'||matchKey===service.service_key)&&<button type="button" className="lform-cancel" aria-expanded={matchKey===service.service_key}
        onClick={()=>matchKey===service.service_key?closeMatches():void findMatches(service,category)}>Find local help</button>}
       <button type="button" className="lform-cancel" aria-expanded={statusFor===service.service_key}
        onClick={()=>{setPicker(null);setStatusFor(statusFor===service.service_key?'':service.service_key)}}>
        {statusFor===service.service_key?'Done':linked.length?'View or change provider':service.status?'Change support':'Set up'}
       </button>
      </div>
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
      {statusFor===service.service_key&&<>
      <fieldset className="property-status-options" disabled={busy}>
       <legend>Support status for {service.name}</legend>
       {Object.entries(PROPERTY_SERVICE_STATES).map(([value,label])=><label key={value} className="property-status-option">
        <input type="radio" name={'support-'+service.service_key} checked={service.status===value} onChange={async()=>{
         if(!await mutate(()=>savePropertyService(client,owner,{...service,status:value as ServiceStatus}),'Support status saved.'))return
         if(value==='has_provider')void openPicker(service,target)
         else{pickerRequest.current++;setPicker(null)}
        }}/>
        {label}
       </label>)}
      </fieldset>
      {service.status==='needs_help'&&<Link href={postPath} className="card-link">Post a job</Link>}
      {linked.length>0&&<ul className="property-linked">{linked.map(person=><li key={person.id}>
       {providerLink(person)}
       <button className="lform-cancel" type="button" disabled={busy} onClick={()=>void mutate(()=>setPropertyProvider(client,owner,service,person.id,false),'Provider link removed.')}>Remove link</button>
       {choices?<ProviderInviteAction provider={person.id} choices={choices} initiallyOpen={inviteTarget===person.id}/>
        :<button type="button" className="lform-cancel" disabled={loadingInvites} onClick={()=>void refreshInviteChoices(person.id)}>
          {loadingInvites?'Loading open jobs…':'Invite to job'}
         </button>}
      </li>)}</ul>}
      {service.status==='has_provider'&&!linked.length&&<p className="muted">No provider linked yet.</p>}
      {service.status==='has_provider'&&<button className="lform-cancel" type="button" disabled={busy}
       aria-expanded={picker===service.service_key}
       onClick={()=>picker===service.service_key?setPicker(null):void openPicker(service,target)}>Link a provider</button>}
      {picker===service.service_key&&<section className="property-picker">
       <h4>Choose a provider</h4>
       {providerGroups&&<label className="lform-field">Find by name or region
        <input value={providerSearch} onChange={event=>{setProviderSearch(event.target.value);setProviderLimit(12)}}/>
       </label>}
       {providerError?<p role="alert">{providerError} <button type="button" onClick={()=>void openPicker(service,target)}>Retry</button></p>
        :!providerGroups?<p role="status">Loading providers…</p>:providerGroups.map(group=>{
         const available=filterPropertyProviders(group.people,linked,providerSearch)
         return <section key={group.label}><h5>{group.label}</h5>{available.length===0?<p className="muted">No providers to link here.</p>
          :<ul className="property-linked">{available.slice(0,providerLimit).map(person=><li key={person.id}>
           {providerLink(person)} {person.region&&<span className="muted">{person.region}</span>}
           <button type="button" className="lform-cancel" disabled={busy}
            onClick={()=>void mutate(()=>setPropertyProvider(client,owner,service,person.id,true),'Provider linked.')}>Link to service</button>
          </li>)}</ul>}
          {available.length>providerLimit&&<button className="lform-cancel" type="button" onClick={()=>setProviderLimit(value=>value+12)}>Show more providers</button>}
         </section>
        })}
       <Link href={propertyDiscoveryPath(category,target.kind)} className="card-link">Browse more providers</Link>
      </section>}
      </>}
     </article>
    })}
    <form className="lform" onSubmit={addService}>
     <label className="lform-field">Custom service<input value={serviceName} onChange={event=>setServiceName(event.target.value)} maxLength={80} required/></label>
     <button className="lform-save" disabled={busy||!serviceName.trim()}>Add service</button>
    </form>
    <button type="button" className="lform-cancel" disabled={busy}
     onClick={async()=>{if(await mutate(()=>setPropertyArea(client,owner,current.id,false),current.label+' removed.'))selectArea('')}}>Remove support area</button>
   </section>}
  </div>}
 </section>
}
