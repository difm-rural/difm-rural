import {formatDate as nzDate} from '../../shared/formatting.js'
import React, { useEffect, useState } from 'react'
import { Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import DateTimePicker from '@react-native-community/datetimepicker'
import Button from './Button'
import Icon from './Icon'
import { colors } from '../theme/tokens'

// The schema still stores an arrival_end_at, and the running-late + completion
// logic (and the DB check) need an end, so we save arrival + a short grace.
const ARRIVAL_GRACE_MIN = 30

function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }

function roundUpToHalfHour(d) {
  const r = new Date(d)
  r.setSeconds(0, 0)
  const m = r.getMinutes()
  if (m === 0 || m === 30) return r
  if (m < 30) r.setMinutes(30)
  else { r.setMinutes(0); r.setHours(r.getHours() + 1) }
  return r
}

// Default arrival for a given date: today (or earlier) → now rounded up to the
// next half hour, nudged on +30 min if that lands under 15 min away; otherwise
// 9:00 am on that date.
export function defaultStartForDate(suggestedDate) {
  const now = new Date()
  const base = suggestedDate ? new Date(suggestedDate) : new Date()
  const picked = Number.isNaN(base.getTime()) ? new Date() : base
  if (startOfDay(picked) <= startOfDay(now)) {
    // e.g. now 1:45 pm → round up to 2:00, which is within 15 min → 2:30 pm.
    let r = roundUpToHalfHour(now)
    if (r.getTime() - now.getTime() <= 15 * 60 * 1000) r = new Date(r.getTime() + 30 * 60 * 1000)
    return r
  }
  const nine = new Date(picked)
  nine.setHours(9, 0, 0, 0)
  return nine
}

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

  function changeStart(nextTime) {
    const next = new Date(start)
    next.setHours(nextTime.getHours(), nextTime.getMinutes(), 0, 0)
    setStart(next)
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

          <TouchableOpacity style={styles.field} onPress={() => setPicker('date')}>
            <Text style={styles.fieldLabel}>Date</Text>
            <Text style={styles.fieldValue}>{nzDate(start)}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.field} onPress={() => setPicker('start')}>
            <Text style={styles.fieldLabel}>Expected arrival</Text>
            <Text style={styles.fieldValue}>{timeLabel(start)}</Text>
          </TouchableOpacity>

          {isPast ? <Text style={styles.errorText}>Pick a time later today</Text> : null}

          {picker ? (
            <View style={styles.pickerWrap}>
              <DateTimePicker
                value={start}
                mode={picker === 'date' ? 'date' : 'time'}
                minimumDate={picker === 'date' ? new Date() : undefined}
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={(event, value) => {
                  if (Platform.OS === 'android') setPicker(null)
                  if (!value || event.type === 'dismissed') return
                  if (picker === 'date') changeDate(value)
                  else changeStart(value)
                }}
              />
              {Platform.OS === 'ios' ? (
                <TouchableOpacity style={styles.done} onPress={() => setPicker(null)}>
                  <Text style={styles.doneText}>Done</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}

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
  pickerWrap: { borderTopWidth: 1, borderTopColor: colors.border, marginBottom: 10 },
  done: { alignSelf: 'flex-end', padding: 8 },
  doneText: { color: colors.primary, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 6 },
  action: { flex: 1 },
})
