'use client'
import {useActionState,useEffect,useState} from 'react'
import {useRouter} from 'next/navigation'
import {formatDateTime as nzDateTime} from '@shared/formatting'
import {confirmJob,changeJobArrival,setJobPaymentMethod} from '../../work-actions'

const METHOD_LABELS:Record<string,string>={bank_transfer:'Bank transfer',cash:'Cash on the day',invoice:"I'll send an invoice",agreed:'Already agreed'}
const METHOD_MESSAGES:Record<string,string>={cash:"I'll take cash on the day.",invoice:"I'll send you an invoice.",agreed:"Let's settle up the way we agreed."}
const SUMMARY_LABELS:Record<string,string>={bank_transfer:'Bank transfer',cash:'Cash on the day',invoice:'Invoice',agreed:'Already agreed'}

function roundUpHalfHour(d:Date){const r=new Date(d);r.setSeconds(0,0);const m=r.getMinutes();if(m===0||m===30)return r;if(m<30)r.setMinutes(30);else{r.setMinutes(0);r.setHours(r.getHours()+1)}return r}
function toLocal(d:Date){const p=(n:number)=>String(n).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`}
function defaultArrival(availableFrom?:string|null){
  const now=new Date()
  let base=now
  if(availableFrom){const d=new Date(availableFrom+'T09:00:00');if(!Number.isNaN(d.getTime())&&d.toDateString()!==now.toDateString()&&d>now)base=d}
  if(base.toDateString()===now.toDateString()){let r=roundUpHalfHour(now);if(r.getTime()-now.getTime()<=15*60*1000)r=new Date(r.getTime()+30*60*1000);return r}
  const nine=new Date(base);nine.setHours(9,0,0,0);return nine
}

// Provider card for an accepted job: one step to confirm arrival + payment, then
// a summary with "Change time" / "Change payment".
export function ConfirmJob({bidId,jobId,jobTitle,requesterFirst,availableFrom,arrivalStart,method}:{
 bidId:string;jobId:string;jobTitle:string;requesterFirst:string;availableFrom:string|null;arrivalStart:string|null;method:string|null}){
 const router=useRouter()
 const confirmed=!!arrivalStart&&!!method

 // ── Confirm form (not yet confirmed) ──
 const [state,submit,pending]=useActionState(confirmJob,{error:''})
 const [arrival,setArrival]=useState(()=>toLocal(defaultArrival(availableFrom)))
 const [choice,setChoice]=useState('')
 const [acct,setAcct]=useState(''),[acctNo,setAcctNo]=useState(''),[reference,setReference]=useState('Payment for '+jobTitle)
 useEffect(()=>{if(state.success)router.refresh()},[state.success,router])

 if(confirmed){
  return <section className="card payment-card">
   <p><strong>Arriving around {nzDateTime(new Date(arrivalStart!))}</strong> · Paid by {SUMMARY_LABELS[method!]||method}</p>
   <details className="activity-action"><summary>Change time</summary><ChangeTime jobId={jobId} availableFrom={availableFrom}/></details>
   <details className="activity-action"><summary>Change payment</summary><ChangePayment bidId={bidId} jobId={jobId} jobTitle={jobTitle} requesterFirst={requesterFirst}/></details>
  </section>
 }

 const arrivalDate=new Date(arrival)
 const isPast=!Number.isNaN(arrivalDate.getTime())&&arrivalDate.getTime()<=Date.now()
 const bankIncomplete=choice==='bank_transfer'&&(!acct.trim()||!acctNo.trim())
 const message=choice==='bank_transfer'
   ? `Please pay by bank transfer.\nAccount name: ${acct||'—'}\nAccount number: ${acctNo||'—'}\nReference: ${reference||'—'}`
   : (METHOD_MESSAGES[choice]||'')
 const blocked=isPast||!choice||bankIncomplete||Number.isNaN(arrivalDate.getTime())

 return <form action={submit} className="card payment-card lform">
  <h3>Confirm the job</h3>
  <input type="hidden" name="bid_id" value={bidId}/><input type="hidden" name="job_id" value={jobId}/>
  <input type="hidden" name="arrival" value={Number.isNaN(arrivalDate.getTime())?'':arrivalDate.toISOString()}/>
  <input type="hidden" name="method" value={choice}/><input type="hidden" name="message" value={message}/>
  <fieldset disabled={pending} className="work-fieldset">
   <p className="payment-substep">When will you arrive?</p>
   <label className="lform-field">Expected arrival<input type="datetime-local" value={arrival} onChange={e=>setArrival(e.target.value)} required/></label>
   {isPast&&<p className="form-error" role="alert">That time has already passed. Pick a time later today or another day.</p>}
   <p className="payment-substep">How would you like to be paid?</p>
   <div className="payment-options">{Object.entries(METHOD_LABELS).map(([id,label])=>
    <button key={id} type="button" className={'lform-kind'+(choice===id?' active':'')} onClick={()=>setChoice(id)}>{label}</button>)}</div>
   {choice==='bank_transfer'&&<div className="payment-sub">
    <label className="lform-field">Account name<input value={acct} maxLength={120} onChange={e=>setAcct(e.target.value)}/></label>
    <label className="lform-field">Account number<input value={acctNo} inputMode="numeric" placeholder="00-0000-0000000-00" onChange={e=>setAcctNo(e.target.value)}/><small className="muted">NZ format, e.g. 00-0000-0000000-00(0)</small></label>
    <label className="lform-field">Reference<input value={reference} maxLength={120} onChange={e=>setReference(e.target.value)}/></label>
   </div>}
   {choice&&<div className="account-current"><strong>Message to {requesterFirst}</strong><p className="work-description">{`Confirmed: I'll be there around ${nzDateTime(arrivalDate)}.`}{message?`\n\n${message}`:''}</p></div>}
  </fieldset>
  {state.error&&<p className="form-error" role="alert">{state.error}</p>}
  <button className="lform-save" disabled={blocked||pending}>{pending?'Confirming…':'Confirm job'}</button>
 </form>
}

function ChangeTime({jobId,availableFrom}:{jobId:string;availableFrom:string|null}){
 const router=useRouter()
 const [state,submit,pending]=useActionState(changeJobArrival,{error:''})
 const [arrival,setArrival]=useState(()=>toLocal(defaultArrival(availableFrom)))
 useEffect(()=>{if(state.success)router.refresh()},[state.success,router])
 const d=new Date(arrival),isPast=!Number.isNaN(d.getTime())&&d.getTime()<=Date.now()
 return <form action={submit} className="lform">
  <input type="hidden" name="job_id" value={jobId}/><input type="hidden" name="arrival" value={Number.isNaN(d.getTime())?'':d.toISOString()}/>
  <label className="lform-field">Expected arrival<input type="datetime-local" value={arrival} onChange={e=>setArrival(e.target.value)} required/></label>
  {isPast&&<p className="form-error" role="alert">That time has already passed. Pick a time later today or another day.</p>}
  {state.error&&<p className="form-error" role="alert">{state.error}</p>}
  <button className="lform-save" disabled={isPast||pending||Number.isNaN(d.getTime())}>{pending?'Saving…':'Update time'}</button>
 </form>
}

function ChangePayment({bidId,jobId,jobTitle,requesterFirst}:{bidId:string;jobId:string;jobTitle:string;requesterFirst:string}){
 const router=useRouter()
 const [state,submit,pending]=useActionState(setJobPaymentMethod,{error:''})
 const [choice,setChoice]=useState('')
 const [acct,setAcct]=useState(''),[acctNo,setAcctNo]=useState(''),[reference,setReference]=useState('Payment for '+jobTitle)
 useEffect(()=>{if(state.success)router.refresh()},[state.success,router])
 const message=choice==='bank_transfer'
   ? `Please pay by bank transfer.\nAccount name: ${acct||'—'}\nAccount number: ${acctNo||'—'}\nReference: ${reference||'—'}`
   : (METHOD_MESSAGES[choice]||'')
 const bankIncomplete=choice==='bank_transfer'&&(!acct.trim()||!acctNo.trim())
 return <form action={submit} className="lform">
  <input type="hidden" name="bid_id" value={bidId}/><input type="hidden" name="job_id" value={jobId}/><input type="hidden" name="method" value={choice}/><input type="hidden" name="message" value={message}/>
  <div className="payment-options">{Object.entries(METHOD_LABELS).map(([id,label])=>
   <button key={id} type="button" className={'lform-kind'+(choice===id?' active':'')} onClick={()=>setChoice(id)}>{label}</button>)}</div>
  {choice==='bank_transfer'&&<div className="payment-sub">
   <label className="lform-field">Account name<input value={acct} maxLength={120} onChange={e=>setAcct(e.target.value)}/></label>
   <label className="lform-field">Account number<input value={acctNo} inputMode="numeric" placeholder="00-0000-0000000-00" onChange={e=>setAcctNo(e.target.value)}/></label>
   <label className="lform-field">Reference<input value={reference} maxLength={120} onChange={e=>setReference(e.target.value)}/></label>
  </div>}
  {choice&&<div className="account-current"><strong>Message to {requesterFirst}</strong><p className="work-description">{message}</p></div>}
  {state.error&&<p className="form-error" role="alert">{state.error}</p>}
  <button className="lform-save" disabled={!choice||bankIncomplete||pending}>{pending?'Sending…':'Update payment'}</button>
 </form>
}
