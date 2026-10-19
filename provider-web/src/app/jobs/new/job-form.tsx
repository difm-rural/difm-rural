'use client'
import { useState, useRef, useEffect, useActionState } from 'react'
import { CATEGORIES } from '@shared/categories'
import { postJob } from '../../work-actions'

export function JobForm() {
  const [step,setStep]=useState(0), [title,setTitle]=useState(''), [description,setDescription]=useState(''), [category,setCategory]=useState('')
  const [priceType,setPriceType]=useState('open'), [price,setPrice]=useState(''), [location,setLocation]=useState(''), [area,setArea]=useState(''), [date,setDate]=useState(''), [error,setError]=useState('')
  const [state,action,pending]=useActionState(postJob,{error:''})
  const heading=useRef<HTMLHeadingElement>(null)
  useEffect(()=>{heading.current?.focus();heading.current?.scrollIntoView({block:'start'})},[step])
  const steps=['The job','Budget & location','Review']
  function next(){
    if(step===0 && (!title.trim() || !description.trim() || !category)){setError('Add a title, description and category.');return}
    if(step===1 && (!area.trim() || !location.trim() || (priceType==='fixed' && (!price || Number(price)<=0)))){setError('Add the location, public area and a valid budget.');return}
    setError('');setStep(step+1)
  }
  return <form action={action} className="lform" onSubmit={event=>{if(step<2){event.preventDefault();next()}}}>
    <p className="eyebrow">Step {step+1} of 3</p><h2 tabIndex={-1} ref={heading}>{steps[step]}</h2>
    <input type="hidden" name="title" value={title}/><input type="hidden" name="description" value={description}/><input type="hidden" name="category" value={category}/>
    <input type="hidden" name="price_type" value={priceType}/><input type="hidden" name="price" value={price}/><input type="hidden" name="location" value={location}/><input type="hidden" name="area" value={area}/><input type="hidden" name="scheduled_date" value={date}/>
    {step===0 && <div className="lform-step">
      <label className="lform-field">Job title *<input value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. Repair the back paddock fence"/></label>
      <label className="lform-field">Category *<select value={category} onChange={e=>setCategory(e.target.value)}><option value="">Choose a category</option>{CATEGORIES.map(c=><option key={c}>{c}</option>)}</select></label>
      <label className="lform-field">What needs doing? *<textarea rows={5} value={description} onChange={e=>setDescription(e.target.value)} placeholder="Describe the work, access, materials and anything people should know."/></label>
    </div>}
    {step===1 && <div className="lform-step">
      <label className="lform-field">Budget<select value={priceType} onChange={e=>setPriceType(e.target.value)}><option value="open">Open to offers</option><option value="fixed">Set a budget</option></select></label>
      {priceType==='fixed' && <label className="lform-field">Budget (NZD) *<input type="number" min="0.01" step="0.01" value={price} onChange={e=>setPrice(e.target.value)}/></label>}
      <label className="lform-field">Property location *<input value={location} onChange={e=>setLocation(e.target.value)} placeholder="Street address or property location"/></label>
      <label className="lform-field">Public area *<input value={area} onChange={e=>setArea(e.target.value)} placeholder="e.g. Cambridge, Waikato"/></label>
      <p className="muted">Only the public area is shown before you accept an offer. Your property location is shared with the person you accept.</p>
      <label className="lform-field">Preferred date (optional)<input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label>
    </div>}
    {step===2 && <div className="card work-detail"><h3>{title}</h3><p>{category} · {area}</p><p className="work-description">{description}</p><p>{priceType==='open'?'Open to offers':'Budget: $'+price+' NZD'}</p><p>{date || 'Flexible timing'}</p><p className="muted">Private location: {location}</p><p>Your job will be published to the Jobs board. Review offers before choosing who does the work.</p></div>}
    {(error || state.error) && <p role="alert" className="form-error">{error || state.error}</p>}
    <div className="lform-actions lform-wizard-actions"><button type="button" className="lform-cancel" disabled={pending || step===0} onClick={()=>{setError('');setStep(step-1)}}>Back</button>
      {step<2 ? <button type="button" className="lform-save" onClick={next}>Next</button> : <button className="lform-save" disabled={pending}>{pending?'Publishing…':'Post job'}</button>}</div>
  </form>
}
