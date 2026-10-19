'use client'
import { useActionState, useState } from 'react'
import Link from 'next/link'
import { CATEGORY_CAPABILITIES, ALL_CAPABILITIES } from '@shared/categories'
import { createClient } from '@/lib/supabase/client'
import { saveProfile } from '../actions'

export type OwnProfile={full_name:string|null;display_name:string|null;region:string|null;phone:string|null;address:string|null;latitude:number|null;longitude:number|null;bio:string|null;skills:string[]|null;qualifications:string[]|null;avatar_url:string|null}
export function ProfileForm({profile,userId}:{profile:OwnProfile;userId:string}){
  const [state,action,pending]=useActionState(saveProfile,{error:''})
  const [avatar,setAvatar]=useState(profile.avatar_url || ''),[uploading,setUploading]=useState(false),[error,setError]=useState('')
  const [latitude,setLatitude]=useState(profile.latitude===null?'':String(profile.latitude)),[longitude,setLongitude]=useState(profile.longitude===null?'':String(profile.longitude))
  const [locating,setLocating]=useState(false)
  const otherSkills=(profile.skills || []).filter(s=>!ALL_CAPABILITIES.includes(s))
  async function uploadPhoto(file:File|null){
    if(!file)return
    if(!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size>8*1024*1024){setError('Choose a JPG, PNG or WebP photo smaller than 8 MB.');return}
    setUploading(true);setError('')
    try{
      const bitmap=await createImageBitmap(file),scale=Math.min(1,600/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas')
      canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale))
      const context=canvas.getContext('2d');if(!context){bitmap.close();throw new Error('Photo resizing unavailable')}
      context.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close()
      const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Could not resize this photo.')),'image/jpeg',.85))
      const client=createClient(),path=userId+'/'+crypto.randomUUID()+'.jpg'
      const {error:uploadError}=await client.storage.from('avatars').upload(path,blob,{contentType:'image/jpeg',upsert:false})
      if(uploadError)throw uploadError
      setAvatar(client.storage.from('avatars').getPublicUrl(path).data.publicUrl)
    }catch{setError('Could not upload this photo. Try a different photo or check your connection. Your current profile photo has not changed.')}
    finally{setUploading(false)}
  }
  function useLocation(){
    if(!navigator.geolocation){setError('Location is not supported in this browser. You can still enter your town and address.');return}
    setLocating(true);setError('')
    navigator.geolocation.getCurrentPosition(p=>{setLatitude(String(p.coords.latitude));setLongitude(String(p.coords.longitude));setLocating(false)},()=>{setLocating(false);setError('Could not read your location. Allow location access or enter your address. GPS is optional.')},{enableHighAccuracy:true,timeout:15000,maximumAge:30000})
  }
  return <form action={action} className="lform"><fieldset className="work-fieldset" disabled={pending || uploading}>
    <section className="card account-form-section"><h2>Your public profile</h2><p className="muted">Other members can see these details. Your public name is used on jobs, listings, messages and reviews.</p>
      <div className="account-summary">{avatar?<img src={avatar} className="account-avatar" alt="Profile photo preview"/>:<span className="account-avatar account-initial">{profile.full_name?.slice(0,1) || '?'}</span>}
        <label className="lform-cancel account-upload">{uploading?'Uploading…':'Choose photo'}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>{void uploadPhoto(e.target.files?.[0] || null);e.target.value=''}}/></label>{avatar && <button type="button" className="lform-cancel" onClick={()=>setAvatar('')}>Remove photo</button>}
      </div><input type="hidden" name="avatar_url" value={avatar}/><p className="muted">Photo changes are applied when you save this form.</p>
      <label className="lform-field">Public name *<input name="full_name" defaultValue={profile.full_name || profile.display_name || ''} required maxLength={80} autoComplete="name"/></label>
      <label className="lform-field">Public town or region *<input name="region" defaultValue={profile.region || ''} required maxLength={120} placeholder="e.g. Cambridge, Waikato"/></label>
      <label className="lform-field">About you (optional)<textarea name="bio" rows={5} defaultValue={profile.bio || ''} maxLength={1500} placeholder="Tell people about your experience and the help you can offer."/></label>
    </section>
    <section className="card account-form-section"><h2>What can you help with?</h2><p className="muted">Choose the capabilities you want people to know about. These also help match relevant jobs.</p>
      {Object.entries(CATEGORY_CAPABILITIES).map(([category,skills])=><details className="account-skills" key={category} open={skills.some(s=>profile.skills?.includes(s))}><summary>{category}</summary><div className="account-checkboxes">{skills.map(s=><label key={s}><input type="checkbox" name="skills" value={s} defaultChecked={profile.skills?.includes(s)}/>{s}</label>)}</div></details>)}
      {otherSkills.length>0 && <div className="account-checkboxes"><h3>Other saved capabilities</h3>{otherSkills.map(s=><label key={s}><input type="checkbox" name="skills" value={s} defaultChecked/>{s}</label>)}</div>}
      <label className="lform-field">Qualifications and licences (optional)<textarea name="qualifications" rows={4} defaultValue={(profile.qualifications || []).join('\n')} placeholder="One qualification or licence per line"/></label>
      <p className="muted">Qualifications are shown as information you provide, rather than verification by Rural Connections.</p>
    </section>
    <section className="card account-form-section"><h2>Private contact & location</h2><p className="muted">Your phone, address and GPS coordinates are excluded from your public profile. Your public town or region above remains visible.</p>
      <label className="lform-field">Phone (optional)<input name="phone" type="tel" autoComplete="tel" defaultValue={profile.phone || ''} maxLength={30}/></label>
      <label className="lform-field">Address or property location (optional)<input name="address" defaultValue={profile.address || ''} autoComplete="street-address" maxLength={300} onChange={()=>{setLatitude('');setLongitude('')}}/></label>
      <input type="hidden" name="latitude" value={latitude}/><input type="hidden" name="longitude" value={longitude}/>
      <p className="muted">A private GPS location helps match nearby work. Changing your address clears the previous GPS location; select it again if needed.</p>
      {latitude && longitude && <p>Private GPS location: {Number(latitude).toFixed(5)}, {Number(longitude).toFixed(5)}</p>}
      <div className="lform-actions"><button type="button" className="lform-cancel" onClick={useLocation} disabled={locating}>{locating?'Finding location…':'Use my current location'}</button>{latitude && <button type="button" className="lform-cancel" onClick={()=>{setLatitude('');setLongitude('')}}>Clear GPS location</button>}</div>
    </section>
  </fieldset>
    {(error || state.error) && <p role="alert" className="form-error">{error || state.error}</p>}{state.success && <p role="status" className="home-clear">{state.success}</p>}
    <div className="lform-actions lform-wizard-actions"><Link href="/account" className="lform-cancel">Back to Account</Link><button className="lform-save" disabled={pending || uploading || locating}>{pending?'Saving…':uploading?'Uploading photo…':'Save profile'}</button></div>
  </form>
}
