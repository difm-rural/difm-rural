import React from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors } from '../../theme/tokens'
import Icon from '../../components/Icon'
import AiJobAssistant from '../../components/AiJobAssistant'

const STEPS = ['Job type', 'Location', 'Details', 'Budget', 'Review']

export default function PostJobHeader({ currentStep, title, onBack }) {
  const insets = useSafeAreaInsets()
  return (
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      <View style={styles.titleRow}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={onBack}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel={currentStep === 1 ? 'Cancel' : 'Go back'}>
          <Text style={styles.backText}>{currentStep === 1 ? 'Cancel' : <><Icon name="chevron-back" size={14} color="rgba(255,255,255,0.92)" /> Back</>}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{title || 'Post a job'}</Text>
        <View style={styles.assistantSlot}>
          <AiJobAssistant />
        </View>
      </View>
      <View style={styles.stepsRow}>
        {STEPS.map((label, i) => {
          const n = i + 1
          const done   = n < currentStep
          const active = n === currentStep
          return (
            <View key={n} style={styles.stepItem}>
              <View style={[styles.dot, done && styles.dotDone, active && styles.dotActive]}>
                <Text style={[styles.dotNum, (done || active) && styles.dotNumLight]}>
                  {done ? <Icon name="checkmark" size={13} color={colors.primary} /> : String(n)}
                </Text>
              </View>
              <Text style={[styles.stepLabel, active && styles.stepLabelActive]} numberOfLines={1}>
                {label}
              </Text>
            </View>
          )
        })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  backBtn:  { minWidth: 60 },
  backText: { color: 'rgba(255,255,255,0.92)', fontSize: 15, fontWeight: '600' },
  title:    { fontSize: 17, fontWeight: '700', color: '#fff', textAlign: 'center' },
  spacer:   { minWidth: 60 },
  assistantSlot: { minWidth: 60, alignItems: 'flex-end' },

  stepsRow:    { flexDirection: 'row', justifyContent: 'space-between' },
  stepItem:    { alignItems: 'center', flex: 1 },
  dot:         { width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  dotDone:     { backgroundColor: '#95d5b2' },
  dotActive:   { backgroundColor: '#ffffff' },
  dotNum:      { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.6)' },
  dotNumLight: { color: colors.primary },
  stepLabel:   { fontSize: 9, color: 'rgba(255,255,255,0.55)', fontWeight: '500', textAlign: 'center' },
  stepLabelActive: { color: '#ffffff', fontWeight: '700' },
})
