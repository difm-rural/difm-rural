'use client'

import { useState } from 'react'
import { needsSentenceCase, SENTENCE_CASE_HINT } from '@/lib/case-style'

type Props = {
  name: string
  label: string
  defaultValue?: string
  placeholder?: string
  maxLength?: number
  required?: boolean
  textarea?: boolean
  rows?: number
}

// Title/message field with a live sentence-case hint. The input stays
// uncontrolled (defaultValue) so the server action reads it normally; we only
// track the value to decide whether to show the warning.
export function CampaignTextField({ name, label, defaultValue = '', placeholder, maxLength, required, textarea, rows }: Props) {
  const [value, setValue] = useState(defaultValue)
  const warn = needsSentenceCase(value)
  return (
    <label className="full-field">
      <span>{label}</span>
      {textarea
        ? <textarea name={name} defaultValue={defaultValue} placeholder={placeholder} maxLength={maxLength} required={required} rows={rows} onChange={e => setValue(e.target.value)} />
        : <input name={name} defaultValue={defaultValue} placeholder={placeholder} maxLength={maxLength} required={required} onChange={e => setValue(e.target.value)} />}
      {warn && <p className="case-hint" role="status">{SENTENCE_CASE_HINT}</p>}
    </label>
  )
}
