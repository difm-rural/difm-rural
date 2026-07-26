import React, { useEffect, useState } from 'react'
import { Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import DateTimePicker from '@react-native-community/datetimepicker'
import Button from './Button'
import Icon from './Icon'
import { colors } from '../theme/tokens'

function initialStart(schedule, suggestedDate) {
  if (schedule?.arrival_start_at) return new Date(schedule.arrival_start_at)
  let date = suggestedDate ? new Date(suggestedDate) : new Date()
  if (Number.isNaN(date.getTime()) || date < new Date()) {
    date = new Date()
    date.setDate(date.getDate() + 1)
  }
  date.setHours(9, 0, 0, 0)
  return date
}

function timeLabel(date) {
  return date.toLocaleTimeString('en-NZ', { hour: 'numeric', minute: '2-digit' })
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
  const [end, setEnd] = useState(() => new Date(start.getTime() + 2 * 60 * 60 * 1000))
  const [expectedComplete, setExpectedComplete] = useState(() => new Date(start.getTime() + 6 * 60 * 60 * 1000))
  const [picker, setPicker] = useState(null)

  useEffect(() => {
    if (!visible) return
    const nextStart = initialStart(schedule, suggestedDate)
    setStart(nextStart)
    setEnd(schedule?.arrival_end_at
      ? new Date(schedule.arrival_end_at)
      : new Date(nextStart.getTime() + 60 * 60 * 1000))
    setExpectedComplete(schedule?.expected_complete_at
      ? new Date(schedule.expected_complete_at)
      : new Date(nextStart.getTime() + 6 * 60 * 60 * 1000))
    setPicker(null)
  }, [visible, schedule?.arrival_start_at, schedule?.arrival_end_at, suggestedDate])

  function changeDate(nextDate) {
    const duration = end.getTime() - start.getTime()
    const nextStart = new Date(start)
    nextStart.setFullYear(nextDate.getFullYear(), nextDate.getMonth(), nextDate.getDate())
    setStart(nextStart)
    setEnd(new Date(nextStart.getTime() + Math.max(duration, 30 * 60 * 1000)))
    const finishDuration = expectedComplete.getTime() - start.getTime()
    setExpectedComplete(new Date(nextStart.getTime() + Math.max(finishDuration, duration)))
  }

  function changeStart(nextTime) {
    const next = new Date(start)
    next.setHours(nextTime.getHours(), nextTime.getMinutes(), 0, 0)
    setStart(next)
    if (end <= next) setEnd(new Date(next.getTime() + 60 * 60 * 1000))
    if (expectedComplete <= next) setExpectedComplete(new Date(next.getTime() + 6 * 60 * 60 * 1000))
  }

  function changeEnd(nextTime) {
    const next = new Date(start)
    next.setHours(nextTime.getHours(), nextTime.getMinutes(), 0, 0)
    if (next <= start) next.setDate(next.getDate() + 1)
    setEnd(next)
    if (expectedComplete < next) setExpectedComplete(next)
  }

  function changeExpectedComplete(nextTime) {
    const next = new Date(start)
    next.setHours(nextTime.getHours(), nextTime.getMinutes(), 0, 0)
    if (next < end) next.setDate(next.getDate() + 1)
    setExpectedComplete(next)
  }

  const pickerValue = picker === 'date' ? start
    : picker === 'start' ? start
    : picker === 'end' ? end
    : expectedComplete

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.heading}>
            <View>
              <Text style={styles.kicker}>WORK SCHEDULE</Text>
              <Text style={styles.title}>Confirm arrival window</Text>
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
            <Text style={styles.fieldValue}>{start.toLocaleDateString('en-NZ', {
              weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
            })}</Text>
          </TouchableOpacity>
          <View style={styles.timeRow}>
            <TouchableOpacity style={[styles.field, styles.timeField]} onPress={() => setPicker('start')}>
              <Text style={styles.fieldLabel}>Arrive from</Text>
              <Text style={styles.fieldValue}>{timeLabel(start)}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.field, styles.timeField]} onPress={() => setPicker('end')}>
              <Text style={styles.fieldLabel}>By</Text>
              <Text style={styles.fieldValue}>{timeLabel(end)}</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.field} onPress={() => setPicker('complete')}>
            <Text style={styles.fieldLabel}>Expected finish</Text>
            <Text style={styles.fieldValue}>{timeLabel(expectedComplete)}</Text>
          </TouchableOpacity>

          {picker ? (
            <View style={styles.pickerWrap}>
              <DateTimePicker
                value={pickerValue}
                mode={picker === 'date' ? 'date' : 'time'}
                minimumDate={picker === 'date' ? new Date() : undefined}
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={(event, value) => {
                  if (Platform.OS === 'android') setPicker(null)
                  if (!value || event.type === 'dismissed') return
                  if (picker === 'date') changeDate(value)
                  else if (picker === 'start') changeStart(value)
                  else if (picker === 'end') changeEnd(value)
                  else changeExpectedComplete(value)
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
            <Button title="Confirm window" onPress={() => onSave(start, end, expectedComplete)} loading={saving} style={styles.action} />
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
  timeRow: { flexDirection: 'row', gap: 10 },
  timeField: { flex: 1 },
  pickerWrap: { borderTopWidth: 1, borderTopColor: colors.border, marginBottom: 10 },
  done: { alignSelf: 'flex-end', padding: 8 },
  doneText: { color: colors.primary, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 6 },
  action: { flex: 1 },
})
