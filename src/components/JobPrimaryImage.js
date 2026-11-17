import React, {useEffect,useState} from 'react'
import {Image} from 'react-native'
import {supabase} from '../lib/supabase'

export const showJobPrimaryMedia = process.env.EXPO_PUBLIC_JOB_PRIMARY_MEDIA === 'true'

export default function JobPrimaryImage({jobId,style,fallback}){
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
   fetch(supabase.supabaseUrl+'/functions/v1/job-primary-media?job='+encodeURIComponent(jobId),{
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
 },[jobId])
 if(!uri&&!fallback)return null
 return <Image source={uri?{uri}:fallback} style={style} resizeMode="cover" accessibilityLabel={uri?'Primary job photo':undefined}/>
}
