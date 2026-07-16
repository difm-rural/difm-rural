import React from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { CATEGORY_CAPABILITIES } from '../lib/categories'
import { colors } from '../theme/tokens'

// Provider capability selector — the detailed skill layer, grouped by the shared
// browse category. Selected capabilities are stored in profiles.skills (text[]).
export default function CapabilityPicker({ selected = [], onToggle }) {
  return (
    <View>
      {Object.entries(CATEGORY_CAPABILITIES).map(([category, caps]) => (
        <View key={category} style={styles.group}>
          <Text style={styles.groupTitle}>{category}</Text>
          <View style={styles.chipGrid}>
            {caps.map(cap => {
              const isSel = selected.includes(cap)
              return (
                <TouchableOpacity
                  key={cap}
                  style={[styles.chip, isSel && styles.chipSelected]}
                  onPress={() => onToggle(cap)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSel }}
                  accessibilityLabel={cap}>
                  <Text style={[styles.chipText, isSel && styles.chipTextSelected]}>{cap}</Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  group:      { marginBottom: 16 },
  groupTitle: { fontSize: 13, fontWeight: '700', color: colors.primary, marginBottom: 8 },
  chipGrid:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipSelected:     { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  chipText:         { fontSize: 13, color: colors.textSecondary, fontWeight: '600' },
  chipTextSelected: { color: colors.primary },
})
