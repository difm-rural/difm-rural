'use client'
import { useState } from 'react'
const address='hello@ruralconnections.nz'
export function Feedback({version,build}:{version:string;build:string}){
  const [description,setDescription]=useState(''),[copied,setCopied]=useState('')
  const details=`Rural Connections web console\nVersion: ${version}\nBuild: ${build}`
  const body=`${details}\n\nWhat happened?\n${description}\n\nSteps to reproduce:\n1. \n2. \n\nWhat did you expect?\n\nBrowser and device:\n`
  async function copy(text:string,label:string){try{await navigator.clipboard.writeText(text);setCopied(label+' copied.')}catch{setCopied('Copy was unavailable. Select the text below and copy it manually.')}}
  return <section className="card account-form-section"><h2>Send feedback</h2><p>Tell us what you were doing, what happened and what you expected. Please leave passwords, sign-in codes and other private information out of your report.</p>
    <label className="lform-field">What happened?<textarea rows={4} value={description} onChange={e=>setDescription(e.target.value)} placeholder="Describe the problem or suggestion…"/></label>
    <div className="lform-actions"><a className="lform-save" href={'mailto:'+address+'?subject='+encodeURIComponent('Rural Connections web feedback — '+version)+'&body='+encodeURIComponent(body)}>Send feedback by email</a><button type="button" className="lform-cancel" onClick={()=>void copy(body,'Report template')}>Copy report template</button></div>
    <p className="muted">No mail app configured? Copy the address and report into your preferred email service.</p><div className="lform-actions"><a className="card-link" href={'mailto:'+address}>{address}</a><button type="button" className="lform-cancel" onClick={()=>void copy(address,'Email address')}>Copy email address</button></div>
    <details><summary>Version details & report template</summary><textarea className="feedback-template" aria-label="Copyable feedback report" rows={12} readOnly value={body} onFocus={e=>e.target.select()}/></details>
    {copied && <p role="status" className="home-clear">{copied}</p>}
  </section>
}
