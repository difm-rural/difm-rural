import React, { createContext, useContext, useState } from 'react'

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
  hideExactLocation:  false,
  locationArea:       '',
}

export function PostJobProvider({ children }) {
  const [jobData, setJobData] = useState(INITIAL_STATE)

  function updateJobData(updates) {
    setJobData(prev => ({ ...prev, ...updates }))
  }

  function resetJobData() {
    setJobData(INITIAL_STATE)
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
