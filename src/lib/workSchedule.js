import { Alert, Platform } from 'react-native'
import { supabase } from './supabase'

let calendarModule

function getCalendarModule() {
  if (calendarModule) return calendarModule
  try {
    calendarModule = require('expo-calendar')
    return calendarModule
  } catch (error) {
    console.log('Calendar native module is not available in this app build:', error)
    return null
  }
}

export async function fetchWorkSchedule({ jobId, bookingId }) {
  let query = supabase.from('work_schedules').select('*')
  query = jobId ? query.eq('job_id', jobId) : query.eq('booking_id', bookingId)
  const { data, error } = await query.maybeSingle()
  if (error) {
    console.log('Could not load work schedule:', error)
    return null
  }
  return data || null
}

export async function saveArrivalWindow({ jobId, bookingId, start, end, expectedComplete }) {
  const { data, error } = await supabase.rpc('set_work_arrival_window', {
    p_job_id: jobId || null,
    p_booking_id: bookingId || null,
    p_start: start.toISOString(),
    p_end: end.toISOString(),
    p_expected_complete: expectedComplete.toISOString(),
  })
  return { data, error }
}

export async function sendRunningLate({ jobId, bookingId, minutes }) {
  return supabase.rpc('send_running_late_notice', {
    p_job_id: jobId || null,
    p_booking_id: bookingId || null,
    p_minutes: minutes,
  })
}

export function formatArrivalWindow(schedule) {
  if (!schedule?.arrival_start_at || !schedule?.arrival_end_at) return ''
  const start = new Date(schedule.arrival_start_at)
  const end = new Date(schedule.arrival_end_at)
  const date = start.toLocaleDateString('en-NZ', {
    weekday: 'short', day: 'numeric', month: 'short',
  })
  const time = value => value.toLocaleTimeString('en-NZ', {
    hour: 'numeric', minute: '2-digit',
  })
  return `${date}, ${time(start)}–${time(end)}`
}

function reminderOffsets(start, Calendar) {
  const eveningBefore = new Date(start)
  eveningBefore.setDate(eveningBefore.getDate() - 1)
  eveningBefore.setHours(18, 0, 0, 0)
  const eveningMinutes = Math.round((eveningBefore.getTime() - start.getTime()) / 60000)
  return [
    { relativeOffset: eveningMinutes, method: Calendar.AlarmMethod?.ALERT },
    { relativeOffset: -120, method: Calendar.AlarmMethod?.ALERT },
  ]
}

export async function addWorkToPhoneCalendar({
  title,
  schedule,
  location,
  otherPartyName,
}) {
  if (!schedule) return false
  const Calendar = getCalendarModule()
  if (!Calendar) {
    Alert.alert(
      'App update needed',
      'Calendar support has been added to Rural Connections. Install the latest app build to add confirmed work to your phone calendar.',
    )
    return false
  }
  try {
    const permission = await Calendar.requestCalendarPermissionsAsync()
    if (permission.status !== 'granted') {
      Alert.alert(
        'Calendar access needed',
        'Allow calendar access in your phone settings to add this work and its reminders.',
      )
      return false
    }

    const start = new Date(schedule.arrival_start_at)
    const end = new Date(schedule.expected_complete_at || schedule.arrival_end_at)
    await Calendar.createEventInCalendarAsync({
      title: `Rural Connections: ${title}`,
      startDate: start,
      endDate: end,
      location: location || undefined,
      notes: `Confirmed through Rural Connections${otherPartyName ? ` with ${otherPartyName}` : ''}.`,
      alarms: reminderOffsets(start, Calendar),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }, Platform.OS === 'android' ? { startNewActivityTask: false } : undefined)
    return true
  } catch (error) {
    Alert.alert('Calendar not opened', error?.message || 'Please try again on your phone.')
    return false
  }
}
