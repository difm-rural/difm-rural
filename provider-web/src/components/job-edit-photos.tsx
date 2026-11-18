'use client'

import {useEffect,useState} from 'react'

export type JobPrivatePhoto={id:string;slot:number}
export type JobEditablePhoto=JobPrivatePhoto & {file?:File}

export function JobEditPhotoImage({jobId,photo}:{jobId:string;photo:JobEditablePhoto}){
 const [preview,setPreview]=useState('')
 const [status,setStatus]=useState<'loading'|'ready'|'failed'>('loading')
 useEffect(()=>{
  if(!photo.file)return
  const url=URL.createObjectURL(photo.file)
  setPreview(url)
  return ()=>URL.revokeObjectURL(url)
 },[photo.file])
 const url=photo.file?preview:'/job-media/'+jobId+'?photo='+photo.id
 return <>
  {status==='loading'&&<small role="status">Loading photo…</small>}
  {status==='failed'&&<small role="status">Could not load this photo.</small>}
  {url&&status!=='failed'&&<img src={url} alt={photo.slot===0?'Primary photo':'Additional job photo'}
   onLoad={()=>setStatus('ready')} onError={()=>setStatus('failed')}/>}
 </>
}

export function JobEditPhotos({jobId,photos,legacyCount,onChange,onError}:{
 jobId:string;photos:JobEditablePhoto[];legacyCount:number;
 onChange:(photos:JobEditablePhoto[])=>void;onError:(message:string)=>void
}){
 const primary=photos.find(photo=>photo.slot===0)
 const total=photos.length+legacyCount
 function select(files:FileList|null,replace:boolean){
  if(!files?.length)return
  const chosen=Array.from(files)
  const available=6-total+(replace&&primary?1:0)
  if(chosen.length>available){onError('Choose up to six job photos in total.');return}
  if(chosen.some(file=>!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>8*1024*1024)){
   onError('Use JPG, PNG or WebP photos smaller than 8 MB each.');return
  }
  const next=replace?photos.filter(photo=>photo.slot!==0):[...photos]
  for(const file of chosen){
   let slot=replace?0:1
   while(next.some(photo=>photo.slot===slot))slot++
   next.push({id:crypto.randomUUID(),slot,file})
  }
  onError('')
  onChange(next)
 }
 return <>
  {primary&&<div className="lform-photos"><div className="lform-photo" key={primary.id}>
   <strong>Primary photo</strong>
   <JobEditPhotoImage jobId={jobId} photo={primary}/>
   <button type="button" className="lform-photo-remove" aria-label="Remove primary photo"
    onClick={()=>onChange(photos.filter(photo=>photo.id!==primary.id))}>×</button>
  </div></div>}
  {(primary||total<6)&&<label className="lform-field">{primary?'Replace primary photo':'Add a primary photo'}
   <input type="file" accept="image/jpeg,image/png,image/webp" onChange={event=>{select(event.target.files,true);event.target.value=''}}/>
  </label>}
  {photos.some(photo=>photo.slot!==0)&&<div className="lform-photos">
   {photos.filter(photo=>photo.slot!==0).map((photo,index)=><div className="lform-photo" key={photo.id}>
    <JobEditPhotoImage jobId={jobId} photo={photo}/>
    <button type="button" className="lform-photo-remove" aria-label={'Remove additional photo '+(index+1)}
     onClick={()=>onChange(photos.filter(item=>item.id!==photo.id))}>×</button>
   </div>)}
  </div>}
  {total<6&&<label className="lform-field">Add additional photos
   <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={event=>{select(event.target.files,false);event.target.value=''}}/>
  </label>}
 </>
}
