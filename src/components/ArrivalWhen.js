import React, { useEffect, useState } from 'react'
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import DateChips, { Chip } from './DateChips'
import NativeDateTimePicker, { openDateTimePicker } from './NativeDateTimePicker'
import { toLocalIsoDate } from '../../shared/dates'
import { arrivalDayChoices, arrivalDayMatch, dayLabel } from '../../shared/requestedDate'
import { arrivalPickerDate, arrivalPickerInstant, quickPickTimes, selectedQuickPickHour, startForDay } from '../lib/quickPickDates'
import { nzToday } from '../../shared/postingDates'
import { colors } from '../theme/tokens'

export function timeLabel(date) {
  return date.toLocaleTimeString('en-NZ', { hour: 'numeric', minute: '2-digit', timeZone: 'Pacific/Auckland' })
}

// The "When" part of confirming a job / changing its time. Collapsed by default
// to one row — "Arriving: Sat 15 Nov (requested) · 9:00 am · Change". Change
// expands day chips and time chips (7 am – 4 pm, past times today hidden, plus
// "Other time…"); once both a day and a time have been chosen it collapses again.
//
//   value / onChange — the arrival Date
//   job              — the job's requested schedule (optional)
//   offerDay         — the date on the provider's own offer (optional)
//   resetKey         — changes when the sheet reopens, to start collapsed again
//   alwaysOpen       — show the day and time choices without a Change step
//                      (the confirm sheet, where choosing them is the main task)
export default function ArrivalWhen({ value, onChange, job, offerDay, resetKey, daySelected = true, onDaySelected, timeSelected = true, onTimeSelected, alwaysOpen = false }) {
  const [expanded, setExpanded] = useState(alwaysOpen)
  const [picked, setPicked] = useState({ day: false, time: false })
  const [picker, setPicker] = useState(null)

  useEffect(() => {
    setExpanded(alwaysOpen); setPicked({ day: false, time: false }); setPicker(null)
  }, [resetKey, alwaysOpen])

  const day = toLocalIsoDate(value)
  const now = arrivalPickerDate(new Date())
  const days = job ? arrivalDayChoices(job, { today: nzToday(), offerDay }) : null
  const requested = daySelected && !!job && arrivalDayMatch(job, day) === 'match'
  const times = quickPickTimes({ day: value, now })
  const selectedHour = timeSelected ? selectedQuickPickHour(value, now) : null
  const instant = timeSelected ? arrivalPickerInstant(value) : null
  const isPast = daySelected && instant && instant.getTime() <= Date.now()
  const dayText = daySelected ? dayLabel(day) : 'Choose a day'
  const timeText = instant ? timeLabel(instant) : timeSelected ? 'Choose a valid time' : 'Choose a time'

  // Choosing the second of the two (day, time) closes the section.
  function mark(part) {
    if (part === 'day') onDaySelected?.(true)
    const next = { ...picked, [part]: true }
    if (next.day && next.time) {
      setExpanded(alwaysOpen); setPicked({ day: false, time: false }); setPicker(null)
    } else {
      setPicked(next)
    }
  }

  function applyDay(date) {
    const next = startForDay(date, { keepTimeFrom: timeSelected ? value : null, now })
    const chosen = arrivalPickerInstant(next)
    if (timeSelected && (!chosen || chosen.getTime() <= Date.now() ||
        next.getHours() !== value.getHours() || next.getMinutes() !== value.getMinutes())) onTimeSelected?.(false)
    onChange(next)
  }
  function applyTime(time) {
    const next = new Date(value)
    next.setHours(time.getHours(), time.getMinutes(), 0, 0)
    onChange(next)
  }

  function chooseDay(date) { applyDay(date); mark('day') }
  function chooseTime(date) { applyTime(date); onTimeSelected?.(true); mark('time') }

  function pickerOptions(mode) {
    return {
      value,
      mode,
      minimumDate: mode === 'date' ? now : undefined,
      // Android's dialog returns one final choice. The iOS spinner reports every
      // scroll, so there the choice only counts when Done is pressed.
      onSelect: selected => {
        if (mode === 'date') applyDay(selected); else applyTime(selected)
        if (Platform.OS === 'android') {
          if (mode === 'time') onTimeSelected?.(true)
          mark(mode === 'date' ? 'day' : 'time')
        }
      },
    }
  }
  function openPicker(mode) {
    openDateTimePicker({ ...pickerOptions(mode), onShow: () => setPicker(mode) })
  }
  function closePicker() {
    const part = picker === 'date' ? 'day' : 'time'
    setPicker(null)
    if (part === 'time') onTimeSelected?.(true)
    mark(part)
  }

  if (!expanded) {
    return (
      <View>
        <TouchableOpacity style={styles.summary} onPress={() => setExpanded(true)} accessibilityRole="button"
          accessibilityLabel={`Arriving ${dayText}${requested ? ', the requested day' : ''}, ${timeText}. Change`}>
          <Text style={styles.summaryText}>
            <Text style={styles.summaryLead}>Arriving: </Text>
            {dayText}{requested ? ' (requested)' : ''} · {timeText}
          </Text>
          <Text style={styles.change}>Change</Text>
        </TouchableOpacity>
        {isPast ? <Text style={styles.error}>That time has passed. Tap Change to pick a later time.</Text> : null}
      </View>
    )
  }

  return (
    <View style={styles.expanded}>
      <View style={styles.expandedHead}>
        <Text style={styles.summaryText}>
          <Text style={styles.summaryLead}>Arriving: </Text>
          {dayText}{requested ? ' (requested)' : ''} · {timeText}
        </Text>
        {!alwaysOpen && <TouchableOpacity onPress={() => { setExpanded(false); setPicked({ day: false, time: false }); setPicker(null) }}
          accessibilityRole="button" accessibilityLabel="Done choosing the arrival time">
          <Text style={styles.change}>Done</Text>
        </TouchableOpacity>}
      </View>

      <Text style={styles.label}>Day</Text>
      <DateChips value={daySelected ? value : null} now={now} arrival wrap requestedLabel={days?.requestedLabel} chips={days?.chips} quickPicks={days?.quickPicks}
        onSelect={chooseDay} onOpen={() => openPicker('date')} />

      <Text style={styles.label}>Time (New Zealand time)</Text>
      <View style={styles.wrap}>
        {times.map(({ hour, label, date }) => (
          <Chip key={hour} label={label} selected={hour === selectedHour} onPress={() => chooseTime(date)} />
        ))}
        <Chip label={timeSelected && selectedHour === null ? `Other time · ${timeText}` : 'Other time…'}
          selected={timeSelected && selectedHour === null} onPress={() => openPicker('time')} />
      </View>
      {isPast ? <Text style={styles.error}>Pick a time later today</Text> : null}

      {picker ? <NativeDateTimePicker visible {...pickerOptions(picker)} onDone={closePicker} /> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  summary: {
    flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48,
    borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12,
  },
  summaryText: { flex: 1, color: colors.textPrimary, fontSize: 15, fontWeight: '600', lineHeight: 21 },
  summaryLead: { color: colors.textSecondary, fontWeight: '500' },
  change: { color: colors.primary, fontSize: 14, fontWeight: '700' },
  expanded: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12 },
  expandedHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  label: { color: colors.textMuted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', marginBottom: 8 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 4 },
  error: { color: colors.danger, fontSize: 13, fontWeight: '600', marginTop: 8 },
})
