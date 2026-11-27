'use client'
import {DateInput} from '@/components/date-input'
import {PendingNote} from '@/components/pending-note'
import {useSubmitGuard} from '@/components/action-form'
import {LoaderCircle} from 'lucide-react'
import {useActionState,useEffect,useState} from 'react'
import {useRouter} from 'next/navigation'
import {formatWorkDateTime as nzDateTime} from '@shared/formatting'
import {paymentLine} from '@shared/offers'
import {nzToday,type JobSchedule} from '@shared/postingDates'
import {arrivalDayChoices,arrivalDayNote} from '@shared/requestedDate'
import {arrivalInputValue,parseArrivalInput} from '@shared/arrivalTime'
import {confirmJob,changeJobArrival,setJobPaymentMethod} from '../../work-actions'

const METHOD_LABELS:Record<string,string>={bank_transfer:'Bank transfer',cash:'Cash',invoice:"I'll send an invoice",agreed:'Arrange directly'}
// The RPCs post the "Payment: $150 by …" line themselves; only bank details ride along.
const bankMessage=(choice:string,acct:string,acctNo:string,reference:string)=>choice==='bank_transfer'
  ? `Please pay by bank transfer.\nAccount name: ${acct||'—'}\nAccount number: ${acctNo||'—'}\nReference: ${reference||'—'}`
  : ''

function ArrivalFields({schedule,offerDay,offerTime=null,arrival,onPick}:{schedule:JobSchedule;offerDay:string|null;offerTime?:string|null;arrival:string;onPick:(value:string)=>void}){
 const days=arrivalDayChoices(schedule,{today:nzToday(),offerDay})
 const [day,time='']=arrival.split('T')
 return <>
  <p className="muted requested-date">Requested: <strong>{days.requestedLabel}</strong></p>
  {days.chips.length>0&&<div className="payment-options">{days.chips.map(chip=>
   <button key={chip.day} type="button" aria-pressed={day===chip.day} className={'lform-kind'+(day===chip.day?' active':'')} onClick={()=>onPick(chip.day+'T'+(chip.day===offerDay&&offerTime?offerTime.slice(0,5):time))}>{chip.label}</button>)}</div>}
  <label className="lform-field">Arrival date<DateInput required value={day} onChange={e=>onPick(e.target.value+'T'+time)}/></label>
  <label className="lform-field">Arrival time (New Zealand time)<input type="time" required value={time} onChange={e=>onPick(day+'T'+e.target.value)}/></label>
 </>
}

// Provider card for an accepted job: one step to confirm arrival + payment, then
// a summary with "Change time" / "Change payment".
export function ConfirmJob({bidId,jobId,jobTitle,requesterFirst,schedule,availableFrom,availableTime=null,arrivalStart,amount,pricingType}:{
 bidId:string;jobId:string;jobTitle:string;requesterFirst:string;schedule:JobSchedule;availableFrom:string|null;availableTime?:string|null;arrivalStart:string|null;amount:number|null;pricingType:string|null}){
 // ── Confirm form (not yet confirmed) ──
 const [state,submit,pending]=useActionState(confirmJob,{error:''})
 const guardSubmit=useSubmitGuard(state,pending)
 const confirmedArrival=arrivalStart || state.arrivalStart
 // The accepted offer's day (and start time, when it gave one) is what was
 // agreed, so start there; otherwise the requested day, if there is one.
 const [arrival,setArrival]=useState(()=>{
  const today=nzToday()
  const offerDay=availableFrom&&availableFrom>=today?availableFrom:null
  const day=offerDay || arrivalDayChoices(schedule,{today,offerDay:availableFrom}).preselect || ''
  return day+'T'+(day&&day===availableFrom&&availableTime?availableTime.slice(0,5):'')
 })
 const [choice,setChoice]=useState('agreed')
 const [acct,setAcct]=useState(''),[acctNo,setAcctNo]=useState(''),[reference,setReference]=useState('Payment for '+jobTitle)
 const [note,setNote]=useState('')
 if(confirmedArrival){
  return <section className="card payment-card">
   {state.success&&<p className="status-banner" role="status">{state.success}</p>}
   <details className="activity-action"><summary>Change time</summary><ChangeTime jobId={jobId} schedule={schedule} availableFrom={availableFrom} arrivalStart={confirmedArrival}/></details>
  </section>
 }

 const arrivalDate=parseArrivalInput(arrival)
 const isPast=!!arrivalDate&&arrivalDate.getTime()<=Date.now()
 const invalidTime=!!arrival.split('T')[0]&&!!arrival.split('T')[1]&&!arrivalDate
 const message=acct.trim()&&acctNo.trim()?bankMessage(choice,acct,acctNo,reference):''
 const noteText=note.trim()
 // Mirrors the message confirm_job posts, including how the day relates to the one asked for.
 const dayNote=arrivalDayNote(schedule,arrivalDate?arrival.slice(0,10):null)
 const preview=(!arrivalDate?'Choose an arrival date and time to complete this preview.':`Confirmed: I'll be there around ${nzDateTime(arrivalDate)}${dayNote.suffix}.`)+(dayNote.line?`\n${dayNote.line}`:'')+`\n${paymentLine(amount,pricingType,choice)}`+(noteText?`\nNote: ${noteText}`:'')+(message?`\n\n${message}`:'')
 const blocked=isPast||!arrivalDate

 return <form action={submit} onSubmit={guardSubmit} aria-busy={pending} className="card payment-card lform">
  <h3>Confirm the job</h3>
  <input type="hidden" name="bid_id" value={bidId}/><input type="hidden" name="job_id" value={jobId}/>
  <input type="hidden" name="arrival" value={arrivalDate?.toISOString() || ''}/>
  <input type="hidden" name="method" value={choice}/><input type="hidden" name="message" value={message}/>
  <fieldset disabled={pending} className="work-fieldset">
   <p className="payment-substep">When will you arrive?</p>
   <ArrivalFields schedule={schedule} offerDay={availableFrom} offerTime={availableTime} arrival={arrival} onPick={setArrival}/>
   {isPast&&<p className="form-error" role="alert">That time has already passed. Pick a time later today or another day.</p>}
   {invalidTime&&<p className="form-error" role="alert">Choose a valid New Zealand arrival time.</p>}
   <p className="payment-substep">Payment method (optional)</p>
   <div className="payment-options">{Object.entries(METHOD_LABELS).map(([id,label])=>
    <button key={id} type="button" className={'lform-kind'+(choice===id?' active':'')} onClick={()=>setChoice(id)}>{label}</button>)}</div>
   {choice==='bank_transfer'&&<div className="payment-sub">
    <label className="lform-field">Account name<input value={acct} maxLength={120} onChange={e=>setAcct(e.target.value)}/></label>
    <label className="lform-field">Account number<input value={acctNo} inputMode="numeric" placeholder="00-0000-0000000-00" onChange={e=>setAcctNo(e.target.value)}/><small className="muted">NZ format, e.g. 00-0000-0000000-00(0)</small></label>
    <label className="lform-field">Reference<input value={reference} maxLength={120} onChange={e=>setReference(e.target.value)}/></label>
   </div>}
   <label className="lform-field">Note (optional)<textarea name="note" rows={2} maxLength={500} value={note} onChange={e=>setNote(e.target.value)} placeholder="e.g. about 3 hours, bring the gate key"/></label>
   {choice&&<div className="account-current"><strong>Message to {requesterFirst}</strong><p className="work-description">{preview}</p></div>}
  </fieldset>
  {state.error&&<p className="form-error" role="alert">{state.error}</p>}
  <p className="muted" role="status">{pending?'Confirming the job and sending your arrival message…':null}</p>
  <button className="lform-save" disabled={blocked||pending}>{pending&&<LoaderCircle size={16} className="spin" aria-hidden="true"/>}{pending?'Confirming…':'Confirm job'}</button>
  <PendingNote pending={pending}/>
 </form>
}

function ChangeTime({jobId,schedule,availableFrom,arrivalStart}:{jobId:string;schedule:JobSchedule;availableFrom:string|null;arrivalStart:string}){
 const router=useRouter()
 const [state,submit,pending]=useActionState(changeJobArrival,{error:''})
 const guardSubmit=useSubmitGuard(state,pending)
 const [arrival,setArrival]=useState(()=>arrivalInputValue(new Date(arrivalStart)))
 useEffect(()=>{if(state.success)router.refresh()},[state.success,router])
 const d=parseArrivalInput(arrival,arrivalStart),isPast=!!d&&d.getTime()<=Date.now()
 return <form action={submit} onSubmit={guardSubmit} aria-busy={pending} className="lform">
  <input type="hidden" name="job_id" value={jobId}/><input type="hidden" name="arrival" value={d?.toISOString() || ''}/>
  <fieldset disabled={pending} className="work-fieldset"><ArrivalFields schedule={schedule} offerDay={availableFrom} arrival={arrival} onPick={setArrival}/></fieldset>
  {state.success&&<p className="home-clear" role="status">{state.success}</p>}
  {isPast&&<p className="form-error" role="alert">That time has already passed. Pick a time later today or another day.</p>}
  {!d&&arrival.split('T').every(Boolean)&&<p className="form-error" role="alert">Choose a valid New Zealand arrival time.</p>}
  {state.error&&<p className="form-error" role="alert">{state.error}</p>}
  <button className="lform-save" disabled={isPast||pending||!d}>{pending?'Saving…':'Update time'}</button>
 </form>
}

function ChangePayment({bidId,jobId,jobTitle,requesterFirst,amount,pricingType}:{bidId:string;jobId:string;jobTitle:string;requesterFirst:string;amount:number|null;pricingType:string|null}){
 const router=useRouter()
 const [state,submit,pending]=useActionState(setJobPaymentMethod,{error:''})
 const [choice,setChoice]=useState('')
 const [acct,setAcct]=useState(''),[acctNo,setAcctNo]=useState(''),[reference,setReference]=useState('Payment for '+jobTitle)
 useEffect(()=>{if(state.success)router.refresh()},[state.success,router])
 const message=acct.trim()&&acctNo.trim()?bankMessage(choice,acct,acctNo,reference):''
 return <form action={submit} className="lform">
  <input type="hidden" name="bid_id" value={bidId}/><input type="hidden" name="job_id" value={jobId}/><input type="hidden" name="method" value={choice}/><input type="hidden" name="message" value={message}/>
  <div className="payment-options">{Object.entries(METHOD_LABELS).map(([id,label])=>
   <button key={id} type="button" className={'lform-kind'+(choice===id?' active':'')} onClick={()=>setChoice(id)}>{label}</button>)}</div>
  {choice==='bank_transfer'&&<div className="payment-sub">
   <label className="lform-field">Account name<input value={acct} maxLength={120} onChange={e=>setAcct(e.target.value)}/></label>
   <label className="lform-field">Account number<input value={acctNo} inputMode="numeric" placeholder="00-0000-0000000-00" onChange={e=>setAcctNo(e.target.value)}/></label>
   <label className="lform-field">Reference<input value={reference} maxLength={120} onChange={e=>setReference(e.target.value)}/></label>
  </div>}
  {choice&&<div className="account-current"><strong>Message to {requesterFirst}</strong><p className="work-description">{paymentLine(amount,pricingType,choice)}{message?`\n\n${message}`:''}</p></div>}
  {state.error&&<p className="form-error" role="alert">{state.error}</p>}
  <button className="lform-save" disabled={!choice||pending}>{pending?'Sending…':'Update payment'}</button>
 </form>
}
