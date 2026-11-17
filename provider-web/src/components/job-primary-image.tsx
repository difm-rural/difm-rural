'use client'
import {useState} from 'react'

export function JobPrimaryImage({jobId,fallback}:{jobId:string;fallback?:string}){
 const [failed,setFailed]=useState(false)
 return failed
  ? fallback?<img src={fallback} alt="" loading="lazy"/>:null
  : <img src={'/job-media/'+jobId} alt="Primary job photo" loading="lazy" onError={()=>setFailed(true)}/>
}
