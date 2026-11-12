import React from 'react'
import { ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native'
import { toLocalIsoDate } from '../../shared/dates'
import { quickPickDays } from '../lib/quickPickDates'
import { colors } from '../theme/tokens'

export default function DateChips({ value, minimumDate, arrival, onSelect, onOpen }) {
  const selectedDay = toLocalIsoDate(value)
  const days = quickPickDays({ minimumDate, arrival })
  const otherSelected = !!selectedDay && !days.some(({ date }) => toLocalIsoDate(date) === selectedDay)

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled"
      style={styles.scroll} contentContainerStyle={styles.row}>
      {days.map(({ date, label }) => {
        const key = toLocalIsoDate(date)
        return <Chip key={key} label={label} selected={key === selectedDay} onPress={() => onSelect(date)} />
      })}
      <Chip label="Other date…" selected={otherSelected} onPress={onOpen} />
    </ScrollView>
  )
}

function Chip({ label, selected, onPress }) {
  return (
    <TouchableOpacity style={[styles.chip, selected && styles.selected]} accessibilityRole="button"
      accessibilityState={{ selected }} onPress={onPress}>
      <Text style={[styles.label, selected && styles.selectedLabel]}>{label}</Text>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 0 },
  row: { gap: 8, paddingBottom: 10 },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 9 },
  selected: { backgroundColor: colors.primary, borderColor: colors.primary },
  label: { color: colors.textPrimary, fontWeight: '700', fontSize: 13 },
  selectedLabel: { color: colors.white },
})
