'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient, refreshRealtimeAuth } from '@/lib/supabase/client'
import { isLiveThreadRow, liveChannel } from '@/lib/realtime'

// Last known badge counts, per signed-in account, for an instant bell on page load.
const CACHE_KEY='rc:alert-counts'

type Change = { table?: string; new?: Record<string, unknown> | null }

export function useWebAlerts(enabled=true,refreshPage=true){
  const router=useRouter()
  const [counts,setCounts]=useState<{messages:number;notifications:number}|null>(null)
  useEffect(()=>{
    if(!enabled)return
    const client=createClient();let alive=true;let stopChannel:(()=>void)|undefined
    let timer:ReturnType<typeof setTimeout>|undefined;let busy=false;let pageRefresh=false
    async function refreshCounts(){
      if(busy || document.visibilityState!=='visible')return
      busy=true
      try{
        // The local session is enough to scope the counts (RLS enforces access);
        // getUser() would call the Auth server on every poll and 403s once the
        // session has ended.
        const {data:{session},error:authError}=await client.auth.getSession()
        const user=session?.user
        if(!alive || authError || !user)return
        const [all,messages]=await Promise.all([
          client.from('notifications').select('id',{count:'exact',head:true}).eq('user_id',user.id).eq('read',false),
          client.from('notifications').select('id',{count:'exact',head:true}).eq('user_id',user.id).eq('read',false).eq('type','new_message'),
        ])
        if(alive && !all.error && !messages.error){
          const next={messages:messages.count || 0,notifications:all.count || 0}
          setCounts(next)
          try{sessionStorage.setItem(CACHE_KEY,JSON.stringify({user:user.id,...next}))}catch{/* optional */}
        }
      }finally{busy=false}
    }
    // Debounced: badge counts always; a page refresh only when something on the
    // page may have changed. A message for a conversation shown live (it adds the
    // message in place) needs no page refresh.
    function schedule(withPage:boolean){
      if(document.visibilityState!=='visible')return
      pageRefresh=pageRefresh||withPage
      clearTimeout(timer)
      timer=setTimeout(()=>{
        if(!alive)return
        const page=pageRefresh;pageRefresh=false
        void refreshCounts().catch(()=>{})
        if(page&&refreshPage)router.refresh()
      },250)
    }
    const changed=()=>schedule(true)
    const realtimeChange=(payload:Change)=>schedule(!isLiveThreadRow(payload.table || '',payload.new))
    const readChanged=()=>schedule(false)
    async function start(){
      const {data:{session}}=await client.auth.getSession();const user=session?.user;if(!alive || !user)return
      // Show the last known counts for this account at once (each page load
      // remounts the shell), then refresh them from the database.
      try{
        const cached=JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null')
        if(cached?.user===user.id&&Number.isFinite(cached.notifications)&&Number.isFinite(cached.messages))setCounts({messages:cached.messages,notifications:cached.notifications})
      }catch{/* optional */}
      await refreshCounts()
      if(!alive)return
      // Rejoins on its own if the channel errors, times out or is closed (e.g. an
      // expired token), so live updates don't silently fall back to polling.
      stopChannel=liveChannel(client,'web-alerts-'+user.id,channel=>{
        channel=channel.on('postgres_changes',{event:'*',schema:'public',table:'notifications',filter:'user_id=eq.'+user.id},realtimeChange)
        for(const table of ['messages','service_booking_messages']){
          channel=channel.on('postgres_changes',{event:'INSERT',schema:'public',table,filter:'receiver_id=eq.'+user.id},realtimeChange)
            .on('postgres_changes',{event:'INSERT',schema:'public',table,filter:'sender_id=eq.'+user.id},realtimeChange)
        }
        return channel
      },{refreshAuth:()=>refreshRealtimeAuth(client)})
      if(!alive)stopChannel()
    }
    void start().catch(()=>{})
    // Backup if realtime is unavailable.
    const fallback=setInterval(changed,15000)
    window.addEventListener('focus',changed);window.addEventListener('rural-read-change',readChanged);document.addEventListener('visibilitychange',changed)
    return ()=>{alive=false;clearTimeout(timer);clearInterval(fallback);window.removeEventListener('focus',changed);window.removeEventListener('rural-read-change',readChanged);document.removeEventListener('visibilitychange',changed);stopChannel?.()}
  },[router,enabled,refreshPage])
  return counts
}
