import React, { createContext, useContext, useState } from 'react'
import { newJobId } from '../lib/draftId'

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
}

// Each posting session gets its own job id, so a retried post can't create a
// duplicate (see lib/draftId).
const freshState = () => ({ ...INITIAL_STATE, draftJobId: newJobId() })

export function PostJobProvider({ children }) {
  const [jobData, setJobData] = useState(freshState)

  function updateJobData(updates) {
    setJobData(prev => ({ ...prev, ...updates }))
  }

  function resetJobData() {
    setJobData(freshState())
  }

  return (
    <PostJobContext.Provider value={{ jobData, updateJobData, resetJobData }}>
      {children}
    </PostJobContext.Provider>
  )
}

export function usePostJob() {
  return useContext(PostJobContext)
}
