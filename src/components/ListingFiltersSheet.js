import React, { useEffect, useState } from 'react'
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors } from '../theme/tokens'
import Icon from './Icon'
import Button from './Button'
import { AVAILABILITY_FILTERS, LEAD_TIME_SORT, LEAD_TIME_SORT_LABEL } from '../../shared/availabilityDiscovery'

// Release 2.1 availability options for the Listings Browse screen, kept out of
// the default view. Choices are a draft until "Apply filters"; Reset applies the
// defaults straight away. Styling follows the Location & distance sheet.
function Option({ label, selected, onPress }) {
  return (
    <TouchableOpacity
      style={[styles.option, selected && styles.selected]}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: !!selected, checked: !!selected }}>
      <Text style={[styles.optionText, selected && styles.selectedText]}>{label}</Text>
    </TouchableOpacity>
  )
}

export default function ListingFiltersSheet({ visible, availability, sort, defaultSortLabel = 'Newest first', onApply, onClose }) {
  const insets = useSafeAreaInsets()
  const [draftAvailability, setDraftAvailability] = useState(availability || '')
  const [draftSort, setDraftSort] = useState(sort || 'default')

  // Each opening starts from what is currently applied.
  useEffect(() => {
    if (visible) { setDraftAvailability(availability || ''); setDraftSort(sort || 'default') }
  }, [visible, availability, sort])

  const sorts = [['default', defaultSortLabel], [LEAD_TIME_SORT, LEAD_TIME_SORT_LABEL]]

  return (
    <Modal visible={!!visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} accessibilityRole="button" accessibilityLabel="Close filters" />
        <View style={[styles.sheet, { paddingBottom: Math.max(20, insets.bottom) }]} accessibilityViewIsModal>
          <View style={styles.heading}>
            <Text style={styles.title} accessibilityRole="header">Filters</Text>
            <TouchableOpacity hitSlop={10} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close filters">
              <Icon name="close" size={24} color={colors.primary} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.content}>
            <Text style={styles.label}>Availability</Text>
            <View style={styles.options} accessibilityRole="radiogroup" accessibilityLabel="Availability">
              {AVAILABILITY_FILTERS.map(([value, label]) => (
                <Option key={value || 'all'} label={label} selected={draftAvailability === value} onPress={() => setDraftAvailability(value)} />
              ))}
            </View>
            <Text style={styles.label}>Sort by</Text>
            <View style={styles.options} accessibilityRole="radiogroup" accessibilityLabel="Sort by">
              {sorts.map(([value, label]) => (
                <Option key={value} label={label} selected={draftSort === value} onPress={() => setDraftSort(value)} />
              ))}
            </View>
          </ScrollView>
          <View style={styles.actions}>
            <Button
              variant="secondary"
              title="Reset"
              accessibilityLabel="Reset filters and sort"
              style={styles.action}
              onPress={() => onApply({ availability: '', sort: 'default' })}
            />
            <Button
              title="Apply filters"
              style={styles.action}
              onPress={() => onApply({ availability: draftAvailability, sort: draftSort })}
            />
          </View>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '88%' },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  title: { fontSize: 20, fontWeight: '700', color: colors.textPrimary },
  content: { paddingBottom: 16 },
  label: { color: colors.textPrimary, fontSize: 14, fontWeight: '600', marginTop: 18, marginBottom: 10 },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingVertical: 12, paddingHorizontal: 16, minHeight: 44, justifyContent: 'center' },
  selected: { backgroundColor: colors.primary, borderColor: colors.primary },
  optionText: { color: colors.textSecondary, fontSize: 13 },
  selectedText: { color: colors.white, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 12 },
  action: { flex: 1 },
})
