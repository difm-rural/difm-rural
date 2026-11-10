'use client'
import {useActionState,useEffect,useState} from 'react'
import {useRouter} from 'next/navigation'
import {formatDate as nzDate} from '@shared/formatting'
import {setJobPaymentMethod} from '../../work-actions'
import {sendChatMessage} from '@/components/conversation/actions'

const METHOD_LABELS:Record<string,string>={bank_transfer:'Bank transfer',cash:'Cash on the day',invoice:"I'll send an invoice",agreed:'Already agreed'}
const METHOD_MESSAGES:Record<string,string>={cash:"I'll take cash on the day.",invoice:"I'll send you an invoice.",agreed:"Let's settle up the way we agreed."}

// Provider-side "Next steps" card for an accepted job: confirm timing, then say
// how you'd like to be paid. Bank details only ever travel in the thread.
export function PaymentProvider({bidId,jobId,jobTitle,requesterId,requesterFirst,availableFrom,method}:{
 bidId:string;jobId:string;jobTitle:string;requesterId:string;requesterFirst:string;availableFrom:string|null;method:string|null}){
 const router=useRouter()
 const [state,submit,pending]=useActionState(setJobPaymentMethod,{error:''})
 const [open,setOpen]=useState(!method)
 const [choice,setChoice]=useState('')
 const [acct,setAcct]=useState(''),[acctNo,setAcctNo]=useState(''),[reference,setReference]=useState('Payment for '+jobTitle)
 const [timingOpen,setTimingOpen]=useState(false)
 const [timing,setTiming]=useState(`Hi ${requesterFirst}, I can do ${availableFrom?nzDate(availableFrom):'this'} — does that suit?`)
 const [timingState,setTimingState]=useState<'idle'|'busy'|'sent'>('idle')
 useEffect(()=>{if(state.success)router.refresh()},[state.success,router])

 async function sendTiming(){
  if(timingState==='busy'||!timing.trim())return
  setTimingState('busy')
  const res=await sendChatMessage({kind:'job',id:jobId,person:requesterId},timing.trim(),crypto.randomUUID())
  if(res.error){setTimingState('idle')}else{setTimingState('sent');router.refresh()}
 }

 if(method&&!open)return <section className="card payment-card">
  <p><strong>Paid by:</strong> {METHOD_LABELS[method]||method} · <button type="button" className="text-link" onClick={()=>{setOpen(true);setChoice('')}}>Change</button></p>
 </section>

 const bankMessage=`Please pay by bank transfer.\nAccount name: ${acct||'—'}\nAccount number: ${acctNo||'—'}\nReference: ${reference||'—'}`
 const message=choice==='bank_transfer'?bankMessage:(METHOD_MESSAGES[choice]||'')

 return <section className="card payment-card">
  <h3>Next steps</h3>
  <ol className="payment-steps">
   <li>
    <button type="button" className="payment-substep" aria-expanded={timingOpen} onClick={()=>setTimingOpen(v=>!v)}>Confirm timing</button>
    {timingOpen&&<div className="payment-sub">
     <textarea className="payment-textarea" value={timing} maxLength={1000} rows={2} onChange={e=>setTiming(e.target.value)} aria-label="Timing message"/>
     <button type="button" className="lform-save" disabled={timingState!=='idle'} onClick={sendTiming}>{timingState==='sent'?'Sent':timingState==='busy'?'Sending…':'Send message'}</button>
    </div>}
   </li>
   <li>
    <p className="payment-substep">How would you like to be paid?</p>
    <div className="payment-options">{Object.entries(METHOD_LABELS).map(([id,label])=>
     <button key={id} type="button" className={'lform-kind'+(choice===id?' active':'')} onClick={()=>setChoice(id)}>{label}</button>)}</div>
    {choice==='bank_transfer'&&<div className="payment-sub">
     <label className="lform-field">Account name<input value={acct} maxLength={120} onChange={e=>setAcct(e.target.value)}/></label>
     <label className="lform-field">Account number<input value={acctNo} inputMode="numeric" placeholder="00-0000-0000000-00" onChange={e=>setAcctNo(e.target.value)}/><small className="muted">NZ format, e.g. 00-0000-0000000-00(0)</small></label>
     <label className="lform-field">Reference<input value={reference} maxLength={120} onChange={e=>setReference(e.target.value)}/></label>
    </div>}
    {choice&&<form action={submit} className="payment-send">
     <input type="hidden" name="bid_id" value={bidId}/><input type="hidden" name="job_id" value={jobId}/>
     <input type="hidden" name="method" value={choice}/><input type="hidden" name="message" value={message}/>
     <div className="account-current"><strong>Message to {requesterFirst}</strong><p className="work-description">{message}</p></div>
     <button className="lform-save" disabled={pending||(choice==='bank_transfer'&&(!acct.trim()||!acctNo.trim()))}>{pending?'Sending…':'Send'}</button>
    </form>}
    {state.error&&<p className="form-error" role="alert">{state.error}</p>}
   </li>
  </ol>
  <p className="muted">Rural Connections never handles the money — only share account details here, in the conversation.</p>
 </section>
}
