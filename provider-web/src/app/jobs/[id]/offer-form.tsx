'use client'
import {useState} from 'react'
import {ActionForm} from '@/components/action-form'
import {OFFER_PRICING_TYPES,OFFER_MATERIALS_OPTIONS,formatOfferAmount} from '@shared/offers'
import {sendOffer,changeOffer} from '../../work-actions'
type Offer={id:string;amount:number;message:string|null;line_items:{label:string;amount:number}[]|null;pricing_type:string|null;materials:string|null;available_from:string|null;estimated_duration:string|null}
export function OfferForm({jobId,offer,providerMaterials}:{jobId:string;offer?:Offer;providerMaterials:boolean}){
 const [items,setItems]=useState((offer?.line_items?.length?offer.line_items:[{label:'Labour',amount:offer?.amount || ''}]).map(i=>({...i,amount:String(i.amount)}))),[pricing,setPricing]=useState(offer?.pricing_type || 'fixed')
 const total=items.reduce((sum,i)=>sum+(Number(i.amount)||0),0)
 return <ActionForm action={offer?changeOffer:sendOffer} label={offer?'Save offer changes':'Send offer'}>
  <input name="job_id" type="hidden" value={jobId}/>{offer&&<><input name="offer_id" type="hidden" value={offer.id}/><input name="intent" type="hidden" value="edit"/></>}
  <p className="muted">Your offer is private to you and the requester.</p><label className="lform-field">Pricing basis<select name="pricing_type" value={pricing} onChange={e=>setPricing(e.target.value)}>{OFFER_PRICING_TYPES.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
  {items.map((item,i)=><div className="lform-repeat" key={i}><div className="lform-repeat-grid"><label className="lform-field">Price line {i+1}<input name="item_label" maxLength={120} value={item.label} required onChange={e=>setItems(items.map((v,n)=>n===i?{...v,label:e.target.value}:v))}/></label><label className="lform-field">Amount ($)<input name="item_amount" type="number" min="0" max="10000000" step="0.01" required value={item.amount} onChange={e=>setItems(items.map((v,n)=>n===i?{...v,amount:e.target.value}:v))}/></label></div>{items.length>1&&<button type="button" className="lform-repeat-remove" onClick={()=>setItems(items.filter((_,n)=>n!==i))}>Remove line {i+1}</button>}</div>)}
  {items.length<12&&<button type="button" className="lform-add" onClick={()=>setItems([...items,{label:'',amount:''}])}>Add price line</button>}
  <strong>Offer: {formatOfferAmount(total,pricing)}</strong><p className="muted">For hourly or per-unit pricing, these lines add up to the rate for one hour or unit. Agree the quantity and final amount directly.</p>
  {providerMaterials&&<label className="lform-field">Materials pricing<select name="materials" defaultValue={offer?.materials || 'included'}>{OFFER_MATERIALS_OPTIONS.map(m=><option value={m.id} key={m.id}>{m.label}</option>)}</select></label>}
  <label className="lform-field">Message (optional)<textarea name="message" maxLength={5000} rows={4} defaultValue={offer?.message || ''} placeholder="Explain how you can help and what your price includes."/></label>
  <label className="lform-field">Available from (optional)<input type="date" name="available_from" defaultValue={offer?.available_from || ''}/></label><label className="lform-field">Estimated duration (optional)<input name="estimated_duration" maxLength={150} defaultValue={offer?.estimated_duration || ''} placeholder="e.g. Half a day"/></label>
  <p className="muted">The requester will review your offer. Work is agreed when they accept.</p>
 </ActionForm>
}
