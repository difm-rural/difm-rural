import React, {useEffect,useState} from 'react'
import {Image,View} from 'react-native'
import {supabase} from '../lib/supabase'

export const showJobPrimaryMedia = process.env.EXPO_PUBLIC_JOB_PRIMARY_MEDIA === 'true'

export default function JobPrimaryImage({jobId,photoId,style,fallback}){
 const [uri,setUri]=useState(null)
 useEffect(()=>{
  if(!showJobPrimaryMedia||!jobId)return
  let active=true
  let request
  const update=session=>{
   request?.abort()
   request=new AbortController()
   const {signal}=request
   setUri(null)
   fetch(supabase.supabaseUrl+'/functions/v1/job-primary-media?job='+encodeURIComponent(jobId)+(photoId?'&photo='+encodeURIComponent(photoId):''),{
    headers:{apikey:supabase.supabaseKey,...(session?{Authorization:'Bearer '+session.access_token}:{})},signal,
   }).then(async response=>{
    if(!response.ok||response.headers.get('content-type')!=='image/jpeg')return
    const blob=await response.blob()
    const reader=new FileReader()
    reader.onload=()=>{if(active&&!signal.aborted)setUri(reader.result)}
    reader.readAsDataURL(blob)
   }).catch(()=>{})
  }
  const {data:{subscription}}=supabase.auth.onAuthStateChange((event,session)=>{
   if(['INITIAL_SESSION','SIGNED_IN','SIGNED_OUT','TOKEN_REFRESHED'].includes(event))update(session)
  })
  return ()=>{active=false;request?.abort();subscription.unsubscribe()}
 },[jobId,photoId])
 if(!uri&&!fallback)return null
 return <Image source={uri?{uri}:fallback} style={style} resizeMode="cover" accessibilityLabel={uri?(photoId?'Job photo':'Primary job photo'):undefined}/>
}

export function JobPrivateGallery({jobId,style,revision}){
 const [photos,setPhotos]=useState([])
 useEffect(()=>{
  let active=true
  setPhotos([])
  if(showJobPrimaryMedia&&jobId) supabase.rpc('list_job_private_photos',{p_job:jobId}).then(({data,error})=>{
   if(active&&!error)setPhotos(data || [])
  })
  return ()=>{active=false}
 },[jobId,revision])
 return photos.length>0 && <View>{photos.map(photo=><JobPrimaryImage key={photo.id} jobId={jobId} photoId={photo.id} style={style}/>)}</View>
}
