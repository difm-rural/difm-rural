'use client'

import {useEffect,useRef,useState} from 'react'
import Link from '@/components/navigation-link'
import {createClient} from '@/lib/supabase/client'
import {propertyAreas,loadPropertyNetwork,setPropertyArea} from '@shared/propertyNetwork'
import {
 EMPTY_PROPERTY,FEATURE_TYPES,FIELD_LABELS,PROPERTY_TYPES,drawPropertyPoint,drivewayMetres,loadPropertyMap,
 mapPointInput,mapSuggestions,propertyAreaHa,savePropertyMap,validMapPoint,
 type MapTool,type Point,type PropertyMap,type Vertex,
} from '@shared/propertyMap'
import {PropertyAerialMap} from './property-aerial-map'

type Match=Point&{label:string}
export function PropertyMapEditor({owner}:{owner:string}){
 const [client]=useState(createClient)
 const [profile,setProfile]=useState<PropertyMap>(EMPTY_PROPERTY)
 const [revision,setRevision]=useState(0)
 const [ready,setReady]=useState(false)
 const [error,setError]=useState('')
 const [status,setStatus]=useState('')
 const [busy,setBusy]=useState(false)
 const [tool,setTool]=useState<MapTool>('pan')
 const [vertex,setVertex]=useState<Vertex|null>(null)
 const [coordinate,setCoordinate]=useState('')
 const [query,setQuery]=useState('')
 const [matches,setMatches]=useState<Match[]>([])
 const [searching,setSearching]=useState(false)
 const [active,setActive]=useState<string[]|null>(null)
 const driveway=useRef('')
 const undo=useRef<PropertyMap[]>([])
 const lock=useRef(false), searchLock=useRef(false)

 useEffect(()=>{
  let mounted=true
  void loadPropertyMap(client,owner).then(result=>{
   if(mounted){setProfile(result.profile);setRevision(result.revision);setReady(true)}
  },()=>{if(mounted)setError('Could not load your private property. Reload to try again.')})
  void loadPropertyNetwork(client,owner).then(data=>{
   if(mounted)setActive(propertyAreas(data).filter(area=>area.active).map(area=>area.id))
  },()=>{})
  return ()=>{mounted=false}
 },[client,owner])

 function change(next:PropertyMap){
  if(next===profile)return
  undo.current=[...undo.current.slice(-29),profile]
  setProfile(next);setError('');setStatus('')
 }
 function choose(next:MapTool){
  setTool(next);setVertex(null);driveway.current=''
 }
 function place(point:Point,centre=false){
  if(busy||!ready)return
  const id=tool==='driveway'&&!vertex?(driveway.current ||= crypto.randomUUID()):crypto.randomUUID()
  const next=drawPropertyPoint(profile,tool,point,id,vertex)
  change(centre?{...next,camera:{...point,zoom:Math.max(16,profile.camera.zoom)}}:next)
  setVertex(null)
  if(tool==='pin')choose('pan')
 }
 async function search(event:React.FormEvent){
  event.preventDefault()
  if(searchLock.current)return
  searchLock.current=true;setSearching(true);setError('');setMatches([])
  try{
   const {data,error}=await client.functions.invoke('property-address-search',{body:{query:query.trim()},timeout:12000})
   if(error)throw error
   const found=(data?.matches||[]).filter((match:Match)=>validMapPoint(match)&&typeof match.label==='string')
   setMatches(found)
   if(!found.length)setStatus('No matching addresses or localities.')
  }catch{setError('Address search is unavailable. Try again or use coordinates.')}
  finally{searchLock.current=false;setSearching(false)}
 }
 async function save(){
  if(lock.current||!ready)return
  lock.current=true;setBusy(true);setError('');setStatus('')
  try{setRevision(await savePropertyMap(client,owner,profile,revision));undo.current=[];setStatus('Property saved.')}
  catch(error){setError(error instanceof Error?error.message:'Could not save your property. Your draft is kept.')}
  finally{lock.current=false;setBusy(false)}
 }
 async function addArea(area:ReturnType<typeof mapSuggestions>[number]['area']){
  if(lock.current)return
  lock.current=true;setBusy(true);setError('')
  try{await setPropertyArea(client,owner,area,true);setActive(current=>[...(current||[]),area]);setStatus('Support area added to My Property Network.')}
  catch{setError('Could not add the support area. Try again.')}
  finally{lock.current=false;setBusy(false)}
 }
 const area=propertyAreaHa(profile.boundary)
 const suggestions=mapSuggestions(profile)
 return <section className="page work-page">
  <header className="home-heading"><div><h1>My Property Map</h1><p className="muted">Private to you. Outlines and measurements are approximate.</p></div>
   <Link href="/property-network" className="card-link">Back to My Property Network</Link></header>
  {error&&<p role="alert">{error}</p>}
  {status&&<p role="status">{status}</p>}
  {!ready&&!error&&<p role="status">Loading your property…</p>}
  {ready&&<>
   <form className="work-search" onSubmit={search}>
    <label htmlFor="map-address">Find an address or locality</label>
    <div><input id="map-address" value={query} onChange={event=>setQuery(event.target.value)} maxLength={100}/>
     <button className="lform-save" disabled={searching||query.trim().length<3}>{searching?'Searching…':'Search'}</button></div>
   </form>
   {matches.length>0&&<ul>{matches.map((match,index)=><li key={index}><button type="button" className="lform-cancel" onClick={()=>{
    change({...profile,camera:{latitude:match.latitude,longitude:match.longitude,zoom:16}});setMatches([])
   }}>{match.label}</button></li>)}</ul>}
   <PropertyAerialMap profile={profile} tool={tool} onPoint={place} onCamera={camera=>{if(!busy)setProfile(current=>({...current,camera}))}}/>
   <div className="lform-actions" aria-label="Map tools">
    {([['pan','Pan'],['pin','Place pin'],['boundary','Draw boundary'],...Object.entries(FEATURE_TYPES).map(([kind,value])=>[kind,value.icon+' '+value.label])] as [MapTool,string][]).map(([id,label])=>
     <button type="button" className="lform-cancel" aria-pressed={tool===id&&!vertex} disabled={busy} key={id} onClick={()=>choose(id)}>{label}</button>)}
   </div>
   <p className="muted">{vertex?'Tap the new position for the selected point.':tool==='pan'?'Drag to pan and use + or − to zoom.':tool==='boundary'||tool==='driveway'?'Tap to add each point. Choose Pan when finished.':'Tap to place the selected feature.'}</p>
   <div className="lform-actions">
    <button type="button" className="lform-cancel" disabled={!undo.current.length||busy} onClick={()=>{const previous=undo.current.pop();if(previous)setProfile(previous);choose('pan')}}>Undo edit</button>
    {!!profile.boundary.length&&<button type="button" className="lform-cancel" disabled={busy} onClick={()=>{change({...profile,boundary:[]});choose('boundary')}}>Remove boundary</button>}
    {profile.pin&&<button type="button" className="lform-cancel" disabled={busy} onClick={()=>change({...profile,pin:null})}>Remove pin</button>}
   </div>
   <details className="activity-action"><summary>Enter or edit coordinates</summary>
    <label className="lform-field">Latitude, longitude<input value={coordinate} onChange={event=>setCoordinate(event.target.value)} placeholder="-41.2, 173.8"/></label>
    <button type="button" className="lform-cancel" disabled={busy||tool==='pan'||!mapPointInput(coordinate)} onClick={()=>{const point=mapPointInput(coordinate);if(point)place(point,true)}}>Apply coordinates</button>
    {profile.boundary.map((point,index)=><p key={index}><button type="button" className="lform-cancel" onClick={()=>{choose('boundary');setVertex({index});setCoordinate(point.latitude+', '+point.longitude)}}>Move boundary point {index+1}</button></p>)}
   </details>
   {profile.boundary.length>=3&&<p>Measured area: {area.toFixed(2)} ha <button type="button" className="lform-cancel" disabled={busy} onClick={()=>change({...profile,areaHa:area.toFixed(2)})}>Use measured area</button></p>}
   {profile.features.length>0&&<section className="card"><h2>Mapped features</h2>
    {profile.features.map(feature=><details key={feature.id} className="activity-action">
     <summary>{FEATURE_TYPES[feature.kind].icon} {feature.name||FEATURE_TYPES[feature.kind].label}{feature.kind==='driveway'?' · '+Math.round(drivewayMetres(feature.points))+' m':''}</summary>
     <label className="lform-field">Name (optional)<input maxLength={120} value={feature.name} disabled={busy}
      onChange={event=>change({...profile,features:profile.features.map(item=>item.id===feature.id?{...item,name:event.target.value}:item)})}/></label>
     {feature.points.map((point,index)=><button type="button" className="lform-cancel" key={index}
      onClick={()=>{choose(feature.kind);setVertex({index,featureId:feature.id});setCoordinate(point.latitude+', '+point.longitude)}}>Move point {index+1}</button>)}
     <button type="button" className="lform-cancel" disabled={busy} onClick={()=>{change({...profile,features:profile.features.filter(item=>item.id!==feature.id)});choose('pan')}}>Delete feature</button>
    </details>)}
   </section>}
   <section className="card"><h2>Property details</h2><div className="lform-repeat-grid">
    {Object.entries(FIELD_LABELS).map(([field,label])=>{
     const key=field as keyof typeof FIELD_LABELS
     const update=(value:string)=>change({...profile,[key]:value})
     return <label className="lform-field" key={key}>{label}{key==='propertyType'
      ?<select disabled={busy} value={profile[key]} onChange={event=>update(event.target.value)}><option value="">Choose if known</option>{PROPERTY_TYPES.map(type=><option key={type}>{type}</option>)}</select>
      :<input disabled={busy} maxLength={key==='paddocks'?6:key==='areaHa'?16:120} inputMode={key==='areaHa'?'decimal':key==='paddocks'?'numeric':'text'}
       value={profile[key]} onChange={event=>update(event.target.value)} />}</label>
    })}
   </div></section>
   {suggestions.length>0&&<section className="card"><h2>Suggested support</h2>
    {suggestions.map(suggestion=><p key={suggestion.area}>{suggestion.service}{active&&!active.includes(suggestion.area)&&
     <button type="button" className="lform-cancel" disabled={busy} onClick={()=>void addArea(suggestion.area)}>Add support area</button>}</p>)}
    <Link href="/property-network" className="card-link">Review in My Property Network</Link>
   </section>}
   <div className="lform-actions">
    <button type="button" className="lform-save" disabled={busy} onClick={()=>void save()}>{busy?'Saving…':'Save property'}</button>
    <Link href="/property-network" className="lform-cancel">Cancel</Link>
   </div>
  </>}
 </section>
}
