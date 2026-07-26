import React from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import Icon from './Icon'
import { colors } from '../theme/tokens'
import { formatArrivalWindow } from '../lib/workSchedule'

function Row({ icon, title, detail, onPress, last }) {
  return (
    <TouchableOpacity
      style={[styles.row, !last && styles.rowBorder]}
      onPress={onPress}
      activeOpacity={0.72}
      accessibilityRole="button"
      accessibilityLabel={title}>
      <View style={styles.iconBox}><Icon name={icon} size={20} color={colors.primary} /></View>
      <View style={styles.copy}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowDetail}>{detail}</Text>
      </View>
      <Icon name="chevron-forward" size={18} color={colors.textMuted} />
    </TouchableOpacity>
  )
}

export default function WorkScheduleCard({
  schedule,
  canSetWindow,
  onSetWindow,
  onAddCalendar,
  onRunningLate,
}) {
  const expectedFinish = (() => {
    if (!schedule?.expected_complete_at) return null
    const arrival = new Date(schedule.arrival_start_at)
    const finish = new Date(schedule.expected_complete_at)
    const time = finish.toLocaleTimeString('en-NZ', { hour: 'numeric', minute: '2-digit' })
    return arrival.toDateString() === finish.toDateString()
      ? time
      : `${finish.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' })}, ${time}`
  })()
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>WORK SCHEDULE</Text>
          <Text style={styles.title}>
            {schedule ? formatArrivalWindow(schedule) : 'Arrival time not confirmed'}
          </Text>
          {expectedFinish ? <Text style={styles.finish}>Expected finish {expectedFinish}</Text> : null}
        </View>
        <Icon name="calendar-outline" size={23} color={colors.primary} />
      </View>
      {!schedule ? (
        canSetWindow ? (
          <Row
            icon="time-outline"
            title="Confirm arrival window"
            detail="Set the shared time before adding calendar reminders."
            onPress={onSetWindow}
            last
          />
        ) : (
          <View style={styles.waiting}>
            <Text style={styles.waitingText}>Waiting for the provider to confirm an arrival window.</Text>
          </View>
        )
      ) : (
        <>
          <Row
            icon="calendar-number-outline"
            title="Add to phone calendar"
            detail="Includes an evening-before and two-hour reminder."
            onPress={onAddCalendar}
          />
          {canSetWindow ? (
            <Row
              icon="time-outline"
              title="Update arrival window"
              detail="The requester will be notified of the change."
              onPress={onSetWindow}
            />
          ) : null}
          <Row
            icon="car-outline"
            title="I’m running late"
            detail="Notify the other party with an updated delay."
            onPress={onRunningLate}
            last
          />
        </>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16,
    overflow: 'hidden',
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: 16 },
  eyebrow: { color: colors.accent, fontSize: 11, fontWeight: '800', letterSpacing: 0.9, marginBottom: 5 },
  title: { color: colors.textPrimary, fontSize: 17, fontWeight: '700' },
  finish: { color: colors.textSecondary, fontSize: 12, marginTop: 4 },
  row: { minHeight: 70, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: '#f0f1ef' },
  iconBox: { width: 38, height: 38, borderRadius: 9, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1 },
  rowTitle: { color: colors.textPrimary, fontSize: 14, fontWeight: '700', marginBottom: 2 },
  rowDetail: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  waiting: { borderTopWidth: 1, borderTopColor: '#f0f1ef', padding: 16 },
  waitingText: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
})
