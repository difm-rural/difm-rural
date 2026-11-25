'use client'
import {useEffect,useState} from 'react'
import {consumeBookingSent} from '@shared/bookingLifecycleUx'
export function BookingSentNotice({id,provider}:{id:string;provider:string}){
 const [visible,setVisible]=useState(false)
 useEffect(()=>{
  try { setVisible(consumeBookingSent(window.sessionStorage,id)) } catch { setVisible(true) }
  const url=new URL(window.location.href);url.searchParams.delete('sent')
  window.history.replaceState(window.history.state,'',url.pathname+url.search+url.hash)
 },[id])
 return visible?<section className="card" role="status"><h2>Booking request sent</h2><p>Your request has been sent to {provider}. They’ll review it and respond.</p></section>:null
}
