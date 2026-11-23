import React, { createContext, useContext, useRef, useState } from 'react'
import { newJobId } from '../lib/draftId'
import { jobDraftChanged } from '../../shared/postJobCancel'

const PostJobContext = createContext({})

const INITIAL_STATE = {
  category:         '',
  title:            '',
  scheduleType:     '',
  scheduledDate:    null,
  latitude:         null,
  longitude:        null,
  jobAddress:       '',
  locationNote:     '',
  areaPolygon:      [],
  areaHectares:     null,
  description:      '',
  photos:           [],
  primaryPhoto:     null,
  primaryPhotoRequired: false,
  priceType:        'fixed',
  price:            '',
  _editJobId:       null,
  materialsType:    '',
  accessConditions: [],
  inviteProviderId:   null,
  inviteProviderName: null,
  dateFrom:           null,
  dateTo:             null,
  // Private by default (as on the web): only the town/area shows publicly, and
  // the address, map pin and access note go to the provider you accept.
  hideExactLocation:  true,
  locationArea:       '',
  repeatedFromJobId:  null,
  recurrenceFrequency: 'one_time',
  // The My Property Network service the job was started from (guidance only; not saved).
  propertyOrigin:     null,
  propertyService:    '',
  propertyServiceCategory: '',
}

// Each posting session gets its own job id, so a retried post can't create a
// duplicate (see lib/draftId).
const freshState = () => ({ ...INITIAL_STATE, draftJobId: newJobId() })

export function PostJobProvider({ children }) {
  const [jobData, setJobData] = useState(freshState)
  // What the wizard opened with, to tell whether Cancel would lose anything.
  // Null when no wizard is open, or once its job has been saved.
  const baseline = useRef(null)

  function startJobBaseline(values = {}) {
    baseline.current = { ...INITIAL_STATE, ...values }
  }

  // Values the wizard filled in by itself (e.g. the phone's location) aren't changes.
  function markAutomatic(values) {
    if (baseline.current) baseline.current = { ...baseline.current, ...values }
  }

  function updateJobData(updates) {
    setJobData(prev => ({ ...prev, ...updates }))
  }

  function resetJobData() {
    baseline.current = null
    setJobData(freshState())
  }

  return (
    <PostJobContext.Provider value={{ jobData, updateJobData, resetJobData, startJobBaseline, markAutomatic,
      jobChanged: jobDraftChanged(baseline.current, jobData) }}>
      {children}
    </PostJobContext.Provider>
  )
}

export function usePostJob() {
  return useContext(PostJobContext)
}
