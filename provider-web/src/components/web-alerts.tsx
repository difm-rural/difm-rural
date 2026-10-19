'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export function useWebAlerts(){
  const router=useRouter()
  const [counts,setCounts]=useState<{messages:number;notifications:number}|null>(null)
  useEffect(()=>{
    const client=createClient();let alive=true;let channel:ReturnType<typeof client.channel>|undefined
    let timer:ReturnType<typeof setTimeout>|undefined;let busy=false
    async function refreshCounts(){
      if(busy || document.visibilityState!=='visible')return
      busy=true
      try{
        const {data:{user},error:authError}=await client.auth.getUser()
        if(!alive || authError || !user)return
        const [all,messages]=await Promise.all([
          client.from('notifications').select('id',{count:'exact',head:true}).eq('user_id',user.id).eq('read',false),
          client.from('notifications').select('id',{count:'exact',head:true}).eq('user_id',user.id).eq('read',false).eq('type','new_message'),
        ])
        if(alive && !all.error && !messages.error)setCounts({messages:messages.count || 0,notifications:all.count || 0})
      }finally{busy=false}
    }
    const changed=()=>{
      if(document.visibilityState!=='visible')return
      clearTimeout(timer)
      timer=setTimeout(()=>{if(alive){void refreshCounts().catch(()=>{});router.refresh()}},250)
    }
    async function start(){
      const {data:{user}}=await client.auth.getUser();if(!alive || !user)return
      await refreshCounts()
      if(!alive)return
      channel=client.channel('web-alerts-'+user.id+'-'+crypto.randomUUID())
        .on('postgres_changes',{event:'*',schema:'public',table:'notifications',filter:'user_id=eq.'+user.id},changed)
      for(const table of ['messages','service_booking_messages']){
        channel=channel.on('postgres_changes',{event:'INSERT',schema:'public',table,filter:'receiver_id=eq.'+user.id},changed)
          .on('postgres_changes',{event:'INSERT',schema:'public',table,filter:'sender_id=eq.'+user.id},changed)
      }
      channel.subscribe()
    }
    void start().catch(()=>{})
    const fallback=setInterval(changed,15000)
    window.addEventListener('focus',changed);window.addEventListener('rural-read-change',changed);document.addEventListener('visibilitychange',changed)
    return ()=>{alive=false;clearTimeout(timer);clearInterval(fallback);window.removeEventListener('focus',changed);window.removeEventListener('rural-read-change',changed);document.removeEventListener('visibilitychange',changed);if(channel)void client.removeChannel(channel)}
  },[router])
  return counts
}
