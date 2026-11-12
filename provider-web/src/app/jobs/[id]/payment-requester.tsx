'use client'
import {useActionState,useEffect,useRef} from 'react'
import {useRouter} from 'next/navigation'
import {formatDate as nzDate} from '@shared/formatting'
import {paymentLine} from '@shared/offers'
import {markJobPaymentSorted} from '../../work-actions'

// The one payment control both sides see once the job is confirmed: a single
// "Payment all taken care of" button, then who marked it and when, with Undo.
export function PaymentSorted({bidId,jobId,sortedAt,sortedByName,otherFirst}:{
 bidId:string;jobId:string;sortedAt:string|null;sortedByName:string;otherFirst:string}){
 const router=useRouter()
 const [state,submit,pending]=useActionState(markJobPaymentSorted,{error:''})
 const statusRef=useRef<HTMLParagraphElement>(null)
 useEffect(()=>{if(state.success){statusRef.current?.focus();router.refresh()}},[state.success,router])

 if(sortedAt)return <div className="payment-sorted">
  <p className="home-clear" role="status" tabIndex={-1} ref={statusRef}>Payment all taken care of · {sortedByName}, {nzDate(sortedAt)}</p>
  <form action={submit} onSubmit={e=>{if(!window.confirm(`Mark payment as not sorted? ${otherFirst} will be told.`))e.preventDefault()}}>
   <input type="hidden" name="bid_id" value={bidId}/><input type="hidden" name="job_id" value={jobId}/><input type="hidden" name="undo" value="true"/>
   <button className="text-link" disabled={pending}>{pending?'Saving…':'Undo'}</button></form>
  {state.error&&<p className="form-error" role="alert">{state.error}</p>}
 </div>

 return <div className="payment-sorted">
  <form action={submit}><input type="hidden" name="bid_id" value={bidId}/><input type="hidden" name="job_id" value={jobId}/>
   <button className="lform-save" disabled={pending}>{pending?'Saving…':'Payment all taken care of'}</button></form>
  {state.error&&<p className="form-error" role="alert">{state.error}</p>}
 </div>
}

// Requester-side payment card: what was agreed and how to pay, then the shared
// "Payment all taken care of" control.
export function PaymentRequester({bidId,jobId,method,amount,pricingType,providerFirst,bankDetails,sortedAt,sortedByName}:{
 bidId:string;jobId:string;method:string;amount:number|null;pricingType:string|null;providerFirst:string;bankDetails:string|null;sortedAt:string|null;sortedByName:string}){
 return <section className="card payment-card">
  {!sortedAt&&<>
   <h3>{paymentLine(amount,pricingType,method)}</h3>
   {method==='bank_transfer'&&bankDetails&&<div className="account-current"><p className="work-description">{bankDetails}</p></div>}
   {method==='bank_transfer'&&<p className="muted">Only pay the account {providerFirst} sent in this conversation. Rural Connections never asks for payment.</p>}
  </>}
  <PaymentSorted bidId={bidId} jobId={jobId} sortedAt={sortedAt} sortedByName={sortedByName} otherFirst={providerFirst}/>
 </section>
}
