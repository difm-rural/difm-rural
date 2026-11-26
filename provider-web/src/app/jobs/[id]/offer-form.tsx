'use client'
import {useSubmitGuard} from '@/components/action-form'
import {useState,useEffect,useRef,useActionState} from 'react'
import {useRouter} from 'next/navigation'
import Link from '@/components/navigation-link'
import {OFFER_PRICING_TYPES,OFFER_MATERIALS_OPTIONS,HOURLY_OFFER_GUIDANCE,initialOfferLines,updateOfferPricingDescription,editOfferPriceDescription,formatOfferAmount} from '@shared/offers'
import {nzToday,type JobSchedule} from '@shared/postingDates'
import {offerDefaultDay,requestedLabel} from '@shared/requestedDate'
import {sendOffer,changeOffer} from '../../work-actions'
import {DateInput} from '@/components/date-input'
import {PendingNote} from '@/components/pending-note'
type Offer={id:string;amount:number;message:string|null;line_items:{label:string;amount:number}[]|null;pricing_type:string|null;materials:string|null;available_from:string|null;available_time?:string|null;estimated_duration:string|null}
export function OfferForm({jobId,offer,providerMaterials,schedule}:{jobId:string;offer?:Offer;providerMaterials:boolean;schedule:JobSchedule}){
 const router=useRouter()
 // A new offer starts "Available from" on the requested (first) date when it is today or later.
 // NZ's date, not the machine's: this first renders on the server (UTC), and
 // before 1pm NZ the UTC date is still yesterday, which let the picker allow it.
 const [today]=useState(()=>nzToday())
 const availableDefault=offer?(offer.available_from || ''):(offerDefaultDay(schedule,today) || '')
 const [state,submit,pending]=useActionState(offer?changeOffer:sendOffer,{error:''})
 const [items,setItems]=useState(()=>initialOfferLines(offer)),[pricing,setPricing]=useState(offer?.pricing_type || 'fixed')
 const [message,setMessage]=useState(offer?.message || '')
 const [materials,setMaterials]=useState(offer?.materials || 'included')
 const [available,setAvailable]=useState(availableDefault)
 const [availableTime,setAvailableTime]=useState(()=>offer?.available_time?.slice(0,5) || '')
 const [duration,setDuration]=useState(offer?.estimated_duration || '')
 function changePricing(value:string){
  setPricing(value)
  setItems(current=>updateOfferPricingDescription(current,value))
 }
 // A typed date can get past the picker's minimum; say so before sending (an
 // unchanged saved date is allowed, as on the server).
 const pastDate=!!available&&available<today&&available!==(offer?.available_from||'')
 const guardSubmit=useSubmitGuard(state,pending||pastDate)
 const total=items.reduce((sum,i)=>sum+(Number(i.amount)||0),0)
 // On success the server has revalidated the job page; a refresh re-renders it
 // with the saved "Your offer" card in place of this form. Focus the status
 // line first so screen readers announce the confirmation.
 const statusRef=useRef<HTMLParagraphElement>(null)
 useEffect(()=>{if(state.success){statusRef.current?.focus();router.refresh()}},[state.success,router])
 if(state.success)return <div className="lform"><p className="home-clear" role="status" tabIndex={-1} ref={statusRef}>{state.success}</p><Link href="/activity" className="card-link">Track in Activity →</Link></div>
 return <form action={submit} className="lform" aria-busy={pending} onSubmit={guardSubmit}><fieldset disabled={pending} className="work-fieldset">
  <input name="job_id" type="hidden" value={jobId}/>{offer&&<><input name="offer_id" type="hidden" value={offer.id}/><input name="intent" type="hidden" value="edit"/></>}
  <p className="muted">Your offer is private to you and the requester.</p><label className="lform-field">Pricing basis<select name="pricing_type" value={pricing} onChange={e=>changePricing(e.target.value)}>{OFFER_PRICING_TYPES.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
  {items.map((item,i)=><div className="lform-repeat" key={i}><div className="lform-repeat-grid"><label className="lform-field">Price line {i+1}<input name="item_label" maxLength={120} placeholder="e.g. Labour" value={item.label} required onChange={e=>setItems(items.map((v,n)=>n===i?editOfferPriceDescription(v,e.target.value):v))}/></label><label className="lform-field">Amount ($)<input name="item_amount" type="number" min="0" max="10000000" step="0.01" required value={item.amount} onChange={e=>setItems(items.map((v,n)=>n===i?{...v,amount:e.target.value}:v))}/></label></div>{items.length>1&&<button type="button" className="lform-repeat-remove" onClick={()=>setItems(items.filter((_,n)=>n!==i))}>Remove line {i+1}</button>}</div>)}
  {items.length<12&&<button type="button" className="lform-add" onClick={()=>setItems([...items,{label:'',amount:''}])}>Add price line</button>}
  <strong>Offer: {formatOfferAmount(total,pricing)}</strong>{pricing==='hourly'&&<p className="muted">{HOURLY_OFFER_GUIDANCE}</p>}
  {providerMaterials&&<label className="lform-field">Materials pricing<select name="materials" value={materials} onChange={e=>setMaterials(e.target.value)}>{OFFER_MATERIALS_OPTIONS.map(m=><option value={m.id} key={m.id}>{m.label}</option>)}</select></label>}
  <label className="lform-field">Message (optional)<textarea name="message" maxLength={5000} rows={4} value={message} onChange={e=>setMessage(e.target.value)} placeholder="Explain how you can help and what your price includes."/></label>
  <p className="muted requested-date">Requested: <strong>{requestedLabel(schedule,today)}</strong></p>
  <div className="lform-repeat-grid"><label className="lform-field">Available from (optional)<DateInput name="available_from" min={today} value={available} onChange={e=>setAvailable(e.target.value)}/>{pastDate&&<span className="form-error" role="alert">Available from can&apos;t be in the past. Choose today or later.</span>}</label><label className="lform-field">Start time (optional)<input name="available_time" type="time" step={900} value={availableTime} disabled={!available} onChange={e=>setAvailableTime(e.target.value)}/><small className="muted">{available?'You’ll confirm the exact arrival after acceptance.':'Choose an Available from date first.'}</small></label></div><label className="lform-field">Estimated duration (optional)<input name="estimated_duration" maxLength={150} value={duration} onChange={e=>setDuration(e.target.value)} placeholder="e.g. Half a day"/></label>
  <p className="muted">The requester will review your offer. Work is agreed when they accept.</p>
 </fieldset>
 {state.error&&<p className="form-error" role="alert">{state.error}</p>}
 <button className="lform-save" disabled={pending||pastDate}>{pending?'Saving…':(offer?'Save offer changes':'Send offer')}</button>
 <PendingNote pending={pending}/>
 </form>
}
