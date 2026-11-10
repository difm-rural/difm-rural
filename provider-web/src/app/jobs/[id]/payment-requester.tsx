'use client'
import {useActionState,useEffect,useRef} from 'react'
import {useRouter} from 'next/navigation'
import {markJobPaymentSent} from '../../work-actions'

const METHOD_LABELS:Record<string,string>={bank_transfer:'Bank transfer',cash:'Cash on the day',invoice:'Invoice',agreed:'Already agreed'}

// Requester-side payment card: shows how to pay and a one-tap "I've paid".
export function PaymentRequester({bidId,jobId,method,providerFirst,bankDetails,markedSent}:{
 bidId:string;jobId:string;method:string;providerFirst:string;bankDetails:string|null;markedSent:boolean}){
 const router=useRouter()
 const [state,submit,pending]=useActionState(markJobPaymentSent,{error:''})
 const statusRef=useRef<HTMLParagraphElement>(null)
 useEffect(()=>{if(state.success){statusRef.current?.focus();router.refresh()}},[state.success,router])

 if(markedSent)return <section className="card payment-card">
  <p className="home-clear" role="status" tabIndex={-1} ref={statusRef}>Payment marked sent</p>
  <form action={submit}><input type="hidden" name="bid_id" value={bidId}/><input type="hidden" name="job_id" value={jobId}/><input type="hidden" name="undo" value="true"/>
   <button className="text-link" disabled={pending}>{pending?'Saving…':'Undo'}</button></form>
  {state.error&&<p className="form-error" role="alert">{state.error}</p>}
 </section>

 return <section className="card payment-card">
  <h3>Pay {providerFirst}</h3>
  <p><strong>How:</strong> {METHOD_LABELS[method]||method}</p>
  {method==='bank_transfer'&&bankDetails&&<div className="account-current"><p className="work-description">{bankDetails}</p></div>}
  {method==='bank_transfer'&&<p className="muted">Only pay the account {providerFirst} sent in this conversation. Rural Connections never asks for payment.</p>}
  <form action={submit}><input type="hidden" name="bid_id" value={bidId}/><input type="hidden" name="job_id" value={jobId}/>
   <button className="lform-save" disabled={pending}>{pending?'Saving…':method==='cash'?'Paid on the day':`I've paid — let ${providerFirst} know`}</button></form>
  {state.error&&<p className="form-error" role="alert">{state.error}</p>}
 </section>
}
