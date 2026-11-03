'use client'
import {useState,type ComponentProps} from 'react'
import {formatDate} from '@shared/formatting'
// Native picker order follows browser/OS settings. Always echo the selection
// in the same unambiguous NZ format used by summaries and detail screens.
export function DateInput({onChange,value,defaultValue,...props}:ComponentProps<'input'>){
 const [selected,setSelected]=useState(defaultValue)
 const date=value??selected
 return <span className="date-control"><input {...props} type="date" lang="en-NZ" value={value} defaultValue={defaultValue} onChange={event=>{setSelected(event.target.value);onChange?.(event)}}/><small className="muted" aria-live="polite">{date?formatDate(String(date)):'Choose a date — e.g. 1 Dec 2026'}</small></span>
}
