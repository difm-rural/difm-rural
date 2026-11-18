'use client'

import {useCallback,useEffect,useRef,useState} from 'react'
import Link from '@/components/navigation-link'
import {createClient} from '@/lib/supabase/client'
import {loadConnections} from '@/lib/connections-data'
import {loadInviteChoices,loadSavedProviders} from '@shared/trustedLocals'
import {ProviderInviteAction} from '../connections/provider-actions'
import {
 PROPERTY_SERVICE_STATES,filterPropertyProviders,discoverPropertyProviders,linkedPropertyProviders,loadPropertyNetwork,
 propertyAreas,propertyDiscoveryPath,propertyProviderName,propertyServiceCategory,propertySpokes,
 savePropertyService,setPropertyArea,setPropertyProvider,
 type AreaId,type NetworkData,type PropertyProvider,type PropertyService,type ServiceStatus,
} from '@shared/propertyNetwork'

type ProviderGroup={label:string;people:PropertyProvider[]}
type InviteChoices=Awaited<ReturnType<typeof loadInviteChoices>>

export function PropertyNetwork({owner,initialArea}:{owner:string;initialArea?:string}){
 const [client]=useState(createClient)
 const [data,setData]=useState<NetworkData|null>(null)
 const [selected,setSelected]=useState(initialArea || '')
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
 const current=active.find(area=>area.id===selected) || active[0]
 const spokes=propertySpokes(active.length)

 function selectArea(id:AreaId){
  pickerRequest.current++
  setSelected(id);setPicker(null);setServiceName('')
  window.history.replaceState(null,'','?area='+id)
  requestAnimationFrame(()=>areaHeading.current?.focus())
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

 async function openPicker(service:PropertyService,category:string){
  const request=++pickerRequest.current
  setPicker(service.service_key);setProviderGroups(null);setProviderError('');setProviderSearch('');setProviderLimit(12)
  try{
   const [saved,worked,discovered]=await Promise.all([
    loadSavedProviders(client,owner),loadConnections(client,owner,'locals'),
    discoverPropertyProviders(client,owner,category),
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
  <header className="home-heading"><div><h1>My Property Network</h1><p className="muted">See who helps with your property and where you still need support.</p></div>
   <Link href="/connections?view=locals" className="card-link">My Locals</Link></header>
  {error&&<p role="alert">{error} <button className="lform-cancel" type="button" onClick={()=>{setError('');void load()}}>Retry</button></p>}
  {feedback&&<p role="status">{feedback}</p>}
  {!data&&!error&&<p role="status">Loading My Property Network…</p>}
  {data&&<div className="property-layout">
   <section>
    <div className="lform-actions" aria-label="Network view">
     <button className="lform-cancel" type="button" aria-pressed={!list} onClick={()=>setList(false)}>Diagram</button>
     <button className="lform-cancel" type="button" aria-pressed={list} onClick={()=>setList(true)}>List</button>
    </div>
    {!active.length?<p>Add a support area to get started.</p>:list?<ul className="property-area-list">{active.map(area=>
     <li key={area.id}><button type="button" aria-pressed={current?.id===area.id} onClick={()=>selectArea(area.id)}>{area.label}</button>
      <small>{area.hasProvider?'Providers linked':'No providers linked'}{area.needsHelp?' · Needs support':''}</small></li>
    )}</ul>:<div className="property-diagram" aria-label="Property diagram">
     {active.map((area,index)=><span key={area.id} aria-hidden="true" className={'property-spoke'+(area.hasProvider?' linked':'')}
      style={{transform:'rotate('+spokes[index].angle+'deg)'}}/>)}
     <div className="property-centre">My Property</div>
     {active.map((area,index)=><button type="button" className={'property-node'+(area.needsHelp?' gap':'')}
      style={{left:spokes[index].x+'%',top:spokes[index].y+'%'}} key={area.id}
      aria-label={area.label+(area.hasProvider?', providers linked':'')+(area.needsHelp?', needs support':'')}
      aria-pressed={current?.id===area.id} onClick={()=>selectArea(area.id)}>
      <span aria-hidden="true">{area.glyph}{area.needsHelp?' · !':''}</span>{area.label}
     </button>)}
    </div>}
    {!list&&active.length>0&&<p className="muted property-legend">Solid lines show linked providers. <strong>!</strong> marks an area needing support.</p>}
    <details className="activity-action">
     <summary>Manage support areas</summary>
     <div className="property-area-list">{areas.map(area=><label className="account-setting" key={area.id}>
      <input type="checkbox" checked={area.active} disabled={busy}
       onChange={event=>void mutate(()=>setPropertyArea(client,owner,area.id,event.target.checked),area.active?'Support area hidden.':'Support area added.')}/>
      {area.label}
     </label>)}</div>
    </details>
   </section>
   {current&&<section aria-labelledby="property-area-heading">
    <h2 id="property-area-heading" tabIndex={-1} ref={areaHeading}>{current.label}</h2>
    <p className="muted">Choose what support you need for each service.</p>
    {current.services.map(service=>{
     const linked=linkedPropertyProviders(data,service)
     const category=propertyServiceCategory(current,service)
     return <article className="property-service" key={service.service_key}>
      <h3>{service.name}</h3>
      <label className="lform-field">Support status
       <select value={service.status || ''} disabled={busy} onChange={event=>{
        const status=event.target.value as ServiceStatus
        void mutate(()=>savePropertyService(client,owner,{...service,status}),'Support status saved.')
       }}>
        <option value="" disabled>Choose a status</option>
        {Object.entries(PROPERTY_SERVICE_STATES).map(([value,label])=><option value={value} key={value}>{label}</option>)}
       </select>
      </label>
      {service.status==='needs_help'&&<div className="lform-actions">
       <strong className="property-gap">Needs support</strong>
       <Link href={propertyDiscoveryPath(category)} className="card-link">Find local help</Link>
       <Link href="/jobs/new" className="card-link">Post a job</Link>
      </div>}
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
       onClick={()=>picker===service.service_key?setPicker(null):void openPicker(service,category)}>Link a provider</button>}
      {picker===service.service_key&&<section className="property-picker">
       <h4>Choose a provider</h4>
       {providerGroups&&<label className="lform-field">Find by name or region
        <input value={providerSearch} onChange={event=>{setProviderSearch(event.target.value);setProviderLimit(12)}}/>
       </label>}
       {providerError?<p role="alert">{providerError} <button type="button" onClick={()=>void openPicker(service,category)}>Retry</button></p>
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
       <Link href={propertyDiscoveryPath(category)} className="card-link">Browse more providers</Link>
      </section>}
     </article>
    })}
    <form className="lform" onSubmit={addService}>
     <label className="lform-field">Custom service<input value={serviceName} onChange={event=>setServiceName(event.target.value)} maxLength={80} required/></label>
     <button className="lform-save" disabled={busy||!serviceName.trim()}>Add service</button>
    </form>
   </section>}
  </div>}
 </section>
}
