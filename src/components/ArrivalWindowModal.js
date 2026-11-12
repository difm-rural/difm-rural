import {formatDate as nzDate} from '../../shared/formatting.js'
import React, { useEffect, useState } from 'react'
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import DateChips from './DateChips'
import NativeDateTimePicker, { openDateTimePicker } from './NativeDateTimePicker'
import { defaultStartForDate } from '../lib/quickPickDates'
import Button from './Button'
import Icon from './Icon'
import { colors } from '../theme/tokens'

// The schema still stores an arrival_end_at, and the running-late + completion
// logic (and the DB check) need an end, so we save arrival + a short grace.
const ARRIVAL_GRACE_MIN = 30

function initialStart(schedule, suggestedDate) {
  if (schedule?.arrival_start_at) return new Date(schedule.arrival_start_at)
  return defaultStartForDate(suggestedDate)
}

export function timeLabel(date) {
  return date.toLocaleTimeString('en-NZ', { hour: 'numeric', minute: '2-digit', timeZone: 'Pacific/Auckland' })
}

export default function ArrivalWindowModal({
  visible,
  schedule,
  suggestedDate,
  saving,
  onClose,
  onSave,
}) {
  const [start, setStart] = useState(() => initialStart(schedule, suggestedDate))
  const [picker, setPicker] = useState(null)

  useEffect(() => {
    if (!visible) return
    setStart(initialStart(schedule, suggestedDate))
    setPicker(null)
  }, [visible, schedule?.arrival_start_at, suggestedDate])

  function changeDate(nextDate) {
    setStart(defaultStartForDate(nextDate))
  }

  function changeTime(nextTime) {
    const next = new Date(start)
    next.setHours(nextTime.getHours(), nextTime.getMinutes(), 0, 0)
    setStart(next)
  }

  function pickerOptions(mode) {
    return {
      value: start,
      mode,
      minimumDate: mode === 'date' ? new Date() : undefined,
      onSelect: mode === 'date' ? changeDate : changeTime,
    }
  }

  function openPicker(mode) {
    openDateTimePicker({ ...pickerOptions(mode), onShow: () => setPicker(mode) })
  }

  const isPast = start.getTime() <= Date.now()

  function handleSave() {
    // The expected finish is filled in server-side; we only send arrival + a
    // short grace as the end.
    onSave(start, new Date(start.getTime() + ARRIVAL_GRACE_MIN * 60 * 1000))
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.heading}>
            <View>
              <Text style={styles.kicker}>WORK SCHEDULE</Text>
              <Text style={styles.title}>Confirm arrival time</Text>
            </View>
            <TouchableOpacity onPress={onClose} accessibilityLabel="Close">
              <Icon name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <Text style={styles.body}>
            This becomes the shared time for calendar events, reminders and completion prompts.
          </Text>

          <DateChips value={start} arrival onSelect={changeDate} onOpen={() => openPicker('date')} />
          <TouchableOpacity style={styles.field} onPress={() => openPicker('date')}>
            <Text style={styles.fieldLabel}>Date</Text>
            <Text style={styles.fieldValue}>{nzDate(start)}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.field} onPress={() => openPicker('time')}>
            <Text style={styles.fieldLabel}>Expected arrival</Text>
            <Text style={styles.fieldValue}>{timeLabel(start)}</Text>
          </TouchableOpacity>

          {isPast ? <Text style={styles.errorText}>Pick a time later today</Text> : null}

          {picker && <NativeDateTimePicker visible {...pickerOptions(picker)} onDone={() => setPicker(null)} />}

          <View style={styles.actions}>
            <Button variant="secondary" title="Cancel" onPress={onClose} style={styles.action} />
            <Button title="Confirm time" onPress={handleSave} loading={saving} disabled={isPast} style={styles.action} />
          </View>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(12,28,22,0.48)', justifyContent: 'center', padding: 20 },
  sheet: { backgroundColor: colors.white, borderRadius: 16, padding: 20 },
  heading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  kicker: { color: colors.accent, fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 5 },
  title: { color: colors.textPrimary, fontSize: 22, fontWeight: '700' },
  body: { color: colors.textSecondary, fontSize: 14, lineHeight: 20, marginTop: 10, marginBottom: 16 },
  field: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, marginBottom: 10 },
  fieldLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '700', marginBottom: 4, textTransform: 'uppercase' },
  fieldValue: { color: colors.textPrimary, fontSize: 15, fontWeight: '600' },
  errorText: { color: colors.danger, fontSize: 13, fontWeight: '600', marginBottom: 6 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 6 },
  action: { flex: 1 },
})
