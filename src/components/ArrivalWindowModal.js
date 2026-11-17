import React, { useEffect, useState } from 'react'
import { StyleSheet, Text } from 'react-native'
import ArrivalWhen, { timeLabel } from './ArrivalWhen'
import FullScreenSheet from './FullScreenSheet'
import { defaultStartForDate } from '../lib/quickPickDates'
import Button from './Button'
import { colors } from '../theme/tokens'

// Kept here for the screens that import it from this module.
export { timeLabel }

// The schema still stores an arrival_end_at, and the running-late + completion
// logic (and the DB check) need an end, so we save arrival + a short grace.
const ARRIVAL_GRACE_MIN = 30

function initialStart(schedule, suggestedDate) {
  if (schedule?.arrival_start_at) return new Date(schedule.arrival_start_at)
  return defaultStartForDate(suggestedDate)
}

// "Change time" for confirmed work. Same full-screen layout and collapsed
// "When" row as ConfirmJobSheet, so the two flows feel the same.
export default function ArrivalWindowModal({
  visible,
  schedule,
  suggestedDate,
  job,
  offerDay,
  saving,
  onClose,
  onSave,
}) {
  const [start, setStart] = useState(() => initialStart(schedule, suggestedDate))

  const [timeSelected, setTimeSelected] = useState(!!schedule?.arrival_start_at)

  useEffect(() => {
    if (!visible) return
    setStart(initialStart(schedule, suggestedDate))
    setTimeSelected(!!schedule?.arrival_start_at)
  }, [visible, schedule?.arrival_start_at, suggestedDate])

  const isPast = start.getTime() <= Date.now()

  function handleSave() {
    if (!timeSelected || isPast || saving) return
    // The expected finish is filled in server-side; we only send arrival + a
    // short grace as the end.
    onSave(start, new Date(start.getTime() + ARRIVAL_GRACE_MIN * 60 * 1000))
  }

  return (
    <FullScreenSheet
      visible={visible}
      title="Confirm arrival time"
      onClose={onClose}
      footer={<Button title="Confirm time" onPress={handleSave} loading={saving} disabled={!timeSelected || isPast} />}>
      <Text style={styles.body}>
        This becomes the shared time for calendar events, reminders and completion prompts.
      </Text>
      <Text style={styles.section}>When will you arrive?</Text>
      <ArrivalWhen value={start} onChange={setStart} job={job} offerDay={offerDay} resetKey={visible} timeSelected={timeSelected} onTimeSelected={setTimeSelected} />
    </FullScreenSheet>
  )
}

const styles = StyleSheet.create({
  body: { color: colors.textSecondary, fontSize: 14, lineHeight: 20, marginTop: 8 },
  section: { color: colors.textPrimary, fontSize: 15, fontWeight: '800', marginTop: 16, marginBottom: 8 },
})
