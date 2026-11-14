import React from 'react'
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { toLocalIsoDate } from '../../shared/dates'
import { localDate, quickPickDays } from '../lib/quickPickDates'
import { colors } from '../theme/tokens'

// Quick day chips for a date field. Optionally led by:
//   requestedLabel — "Requested: Sat 15 Nov" shown above the chips
//   chips          — extra chips first ({ day: 'YYYY-MM-DD', label }), e.g.
//                    "Use requested date · Sat 15" (see shared/requestedDate.ts)
//   quickPicks     — false hides the usual Today / Tomorrow / … chips
export default function DateChips({ value, minimumDate, arrival, requestedLabel, chips = [], quickPicks = true, onSelect, onOpen }) {
  const selectedDay = toLocalIsoDate(value)
  const leading = chips.map(({ day, label }) => ({ key: day, date: localDate(day), label }))
  const usual = quickPicks
    ? quickPickDays({ minimumDate, arrival })
        .map(({ date, label }) => ({ key: toLocalIsoDate(date), date, label }))
        .filter(({ key }) => !leading.some(chip => chip.key === key))
    : []
  const days = [...leading, ...usual]
  const otherSelected = !!selectedDay && !days.some(({ key }) => key === selectedDay)

  return (
    <View>
      {requestedLabel ? (
        <Text style={styles.requested} accessibilityLabel={`Requested: ${requestedLabel}`}>
          Requested: <Text style={styles.requestedValue}>{requestedLabel}</Text>
        </Text>
      ) : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled"
        style={styles.scroll} contentContainerStyle={styles.row}>
        {days.map(({ key, date, label }) => (
          <Chip key={key} label={label} selected={key === selectedDay} onPress={() => onSelect(date)} />
        ))}
        <Chip label="Other date…" selected={otherSelected} onPress={onOpen} />
      </ScrollView>
    </View>
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
  requested: { color: colors.textSecondary, fontSize: 13, marginBottom: 8 },
  requestedValue: { color: colors.textPrimary, fontWeight: '700' },
  scroll: { flexGrow: 0 },
  row: { gap: 8, paddingBottom: 10 },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 9 },
  selected: { backgroundColor: colors.primary, borderColor: colors.primary },
  label: { color: colors.textPrimary, fontWeight: '700', fontSize: 13 },
  selectedLabel: { color: colors.white },
})
