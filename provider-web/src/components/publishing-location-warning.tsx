'use client'
import {useRef,useState,useEffect} from 'react'
import {publishingLocationWarning,type PublishingLocation} from '@shared/publishingLocation'
import {createPublicAreaCache,lookupPublicArea} from '@shared/publicJobArea'
import {createClient} from '@/lib/supabase/client'
const resolve=createPublicAreaCache(area=>lookupPublicArea(process.env.NEXT_PUBLIC_SUPABASE_URL+'/functions/v1/maps-proxy',area))
export function usePublishingLocationWarning(userId:string){
  const [message,setMessage]=useState(''),answer=useRef<((value:boolean)=>void)|null>(null),dialog=useRef<HTMLDialogElement>(null)
  useEffect(()=>{
    if(message)dialog.current?.showModal()
    else dialog.current?.close()
  },[message])
  useEffect(()=>()=>{answer.current?.(false)},[])
  function respond(value:boolean){answer.current?.(value);answer.current=null;setMessage('')}
  async function check(location:PublishingLocation){
    let warning
    try{
      const {data,error}=await createClient().from('profiles').select('latitude,longitude,region').eq('id',userId).maybeSingle()
      if(error)return true
      warning=await publishingLocationWarning(location,data,resolve)
    }catch{return true}
    if(!warning)return true
    return new Promise<boolean>(done=>{answer.current=done;setMessage(warning.message)})
  }
  const prompt=<dialog className="publishing-location-dialog" ref={dialog} aria-labelledby="publishing-location-title" onCancel={e=>{e.preventDefault();respond(false)}}><h2 id="publishing-location-title">Check the location</h2><p>{message}</p><div className="lform-actions"><button type="button" className="lform-cancel" onClick={()=>respond(false)} autoFocus>Change location</button><button type="button" className="lform-save" onClick={()=>respond(true)}>Use this location</button></div></dialog>
  return {check,prompt}
}
