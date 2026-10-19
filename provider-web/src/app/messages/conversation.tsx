'use client'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { ImagePlus, MapPin, Send, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { attachment, canReadConversation, type ChatMessage, type ConversationRef } from '@/lib/messaging'
import type { ConversationContext } from '@/lib/messaging-data'
import { readConversation, sendChatMessage } from './actions'

export function Conversation({context}:{context:ConversationContext}){
  const router=useRouter(),[text,setText]=useState(''),[sending,setSending]=useState(false),[error,setError]=useState(''),[readError,setReadError]=useState('')
  const [local,setLocal]=useState<ChatMessage[]>([]),[file,setFile]=useState<File|null>(null)
  const [location,setLocation]=useState<{latitude:number;longitude:number}|null>(null),[locating,setLocating]=useState(false)
  const [photoPreview,setPhotoPreview]=useState('')
  const ref=useMemo<ConversationRef>(()=>({kind:context.kind,id:context.id,person:context.person}),[context.kind,context.id,context.person])
  const attempt=useRef<{id:string;content:string}|null>(null),uploaded=useRef<{file:File;url:string}|null>(null),busyRef=useRef(false)
  const endRef=useRef<HTMLDivElement>(null),scrollRef=useRef<HTMLDivElement>(null),nearBottom=useRef(true)
  const messages=useMemo(()=>{
    const map=new Map(context.messages.map(m=>[m.id,m]));for(const m of local)map.set(m.id,m)
    return [...map.values()].sort((a,b)=>a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id))
  },[context.messages,local])
  const latestIncoming=[...messages].reverse().find(m=>m.sender_id===context.person)
  const latestIncomingId=latestIncoming?.id
  const markRead=useCallback(()=>{
    if(!canReadConversation(document.visibilityState,document.hasFocus(),latestIncomingId))return
    void readConversation(ref,latestIncomingId!).then(result=>{
      setReadError(result.error || '')
      if(!result.error)window.dispatchEvent(new Event('rural-read-change'))
    }).catch(()=>setReadError('Could not update the read status. Return to Messages and reopen this conversation to retry.'))
  },[ref,latestIncomingId])
  useEffect(()=>{
    markRead();window.addEventListener('focus',markRead);document.addEventListener('visibilitychange',markRead)
    return ()=>{window.removeEventListener('focus',markRead);document.removeEventListener('visibilitychange',markRead)}
  },[markRead])
  useEffect(()=>{if(nearBottom.current)endRef.current?.scrollIntoView({block:'nearest'})},[messages.length])
  useEffect(()=>{
    if(!file)return
    const url=URL.createObjectURL(file)
    const timer=setTimeout(()=>setPhotoPreview(url),0)
    return ()=>{clearTimeout(timer);URL.revokeObjectURL(url)}
  },[file])
  async function send(event:FormEvent){
    event.preventDefault();if(busyRef.current || (!text.trim() && !file && !location))return
    busyRef.current=true;setSending(true);setError('')
    try{
      let content=text.trim()
      if(file){
        let url=uploaded.current?.file===file?uploaded.current.url:''
        if(!url){
          const client=createClient(),ext=file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg'
          const path=context.id+'/'+context.userId+'/'+crypto.randomUUID()+'.'+ext
          const {error:uploadError}=await client.storage.from('job-photos').upload(path,file,{contentType:file.type,upsert:false})
          if(uploadError)throw new Error('The photo could not be uploaded. Check your connection and try again.')
          url=client.storage.from('job-photos').getPublicUrl(path).data.publicUrl;uploaded.current={file,url}
        }
        content=JSON.stringify({type:'photo',url:uploaded.current!.url,caption:text.trim() || 'Photo'})
      }else if(location)content=JSON.stringify({type:'location',...location,text:(text.trim()?text.trim()+'\n':'')+'📍 '+location.latitude.toFixed(6)+', '+location.longitude.toFixed(6)})
      if(attempt.current?.content!==content)attempt.current={id:crypto.randomUUID(),content}
      const result=await sendChatMessage(ref,content,attempt.current!.id)
      if(result.error || !result.message)throw new Error(result.error || 'Your message could not be sent.')
      nearBottom.current=true;setLocal(rows=>rows.some(m=>m.id===result.message!.id)?rows:[...rows,result.message!])
      setText('');setFile(null);setLocation(null);uploaded.current=null;attempt.current=null;router.refresh()
    }catch(e){setError(e instanceof Error?e.message:'Could not send. Your draft has been kept. Please try again.')}
    finally{busyRef.current=false;setSending(false)}
  }
  function choosePhoto(selected:File|null){
    if(!selected)return
    if(!['image/jpeg','image/png','image/webp'].includes(selected.type) || selected.size>8*1024*1024){setError('Choose a JPG, PNG or WebP photo smaller than 8 MB.');return}
    setFile(selected);setLocation(null);uploaded.current=null;setError('')
  }
  function chooseLocation(){
    if(!navigator.geolocation){setError('Your browser does not support location sharing. You can type the location in a message.');return}
    setLocating(true);setError('')
    navigator.geolocation.getCurrentPosition(p=>{setLocation({latitude:p.coords.latitude,longitude:p.coords.longitude});setFile(null);setLocating(false)},e=>{setLocating(false);setError(e.code===1?'Location permission was denied. Allow it in your browser settings or type the location in a message.':'Could not get your location. Try again or type the location in a message.')},{enableHighAccuracy:true,timeout:15000,maximumAge:30000})
  }
  return <section className="message-conversation" aria-label={'Conversation with '+context.name}>
    <header className="enq-thread-head"><Link href="/messages" className="card-link">← All messages</Link><h2>{context.name}</h2><span>{context.title} · {context.kind==='listing'?'Listing enquiry':context.kind==='job'?'Job':'Booking'}</span>
      {context.kind!=='listing' && <Link className="card-link" href={'/activity/'+context.kind+'/'+context.id+'/manage'}>Arrangement details & reviews →</Link>}
    </header>
    {readError && <p className="form-error" role="alert">{readError}</p>}
    <div className="enq-messages message-scroll" ref={scrollRef} onScroll={()=>{const el=scrollRef.current;if(el)nearBottom.current=el.scrollHeight-el.scrollTop-el.clientHeight<120}}>
      {!messages.length && <p className="empty">No messages yet. Send a message to get started.</p>}
      {messages.map(m=>{const body=attachment(m.content);return <article key={m.id} className={m.sender_id===context.userId?'bubble mine':'bubble theirs'}>
        <span className="sr-only">{m.sender_id===context.userId?'You':context.name}:</span>
        {body.type==='photo'?<><a href={body.url} target="_blank" rel="noopener noreferrer"><img className="message-photo" src={body.url} alt={body.caption || 'Shared photo'} loading="lazy"/></a>{body.caption && <p>{body.caption}</p>}</>
        :body.type==='location'?<><p>{body.text}</p>{body.latitude!==null && body.longitude!==null && <a className="message-map" target="_blank" rel="noopener noreferrer" href={'https://www.google.com/maps/search/?api=1&query='+body.latitude+','+body.longitude}>Open shared location in Maps ↗</a>}</>
        :<p>{body.text}</p>}
        <time className="bubble-time" dateTime={m.created_at}>{new Date(m.created_at).toLocaleString('en-NZ',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'})}</time>
      </article>})}<div ref={endRef}/>
    </div>
    {context.closed?<p className="message-closed">This arrangement has ended. You can still read its messages.</p>:<form className="reply message-compose" onSubmit={send}>
      {(file || location) && <div className="message-preview">{file?<>{photoPreview && <img src={photoPreview} alt="Photo ready to send"/>}<span>{file.name}</span></>:<span>Share current location: {location?.latitude.toFixed(6)}, {location?.longitude.toFixed(6)}</span>}<button type="button" onClick={()=>{setFile(null);setLocation(null);uploaded.current=null}} disabled={sending} aria-label="Remove attachment"><X size={16}/></button></div>}
      <textarea value={text} onChange={e=>setText(e.target.value)} maxLength={1000} disabled={sending} placeholder={file?'Add a photo caption (optional)…':'Write a message…'} rows={3} aria-label="Message"/>
      <div className="message-tools"><label className="message-attach"><ImagePlus size={18}/> Photo<input type="file" accept="image/jpeg,image/png,image/webp" disabled={sending} onChange={e=>{choosePhoto(e.target.files?.[0] || null);e.target.value=''}}/></label>
        <button type="button" className="message-attach" onClick={chooseLocation} disabled={sending || locating}><MapPin size={18}/>{locating?'Finding location…':'Share location'}</button>
        <button type="submit" disabled={sending || (!text.trim() && !file && !location)}><Send size={16}/>{sending?'Sending…':'Send'}</button>
      </div>{error && <p className="form-error" role="alert">{error}</p>}
    </form>}
  </section>
}
