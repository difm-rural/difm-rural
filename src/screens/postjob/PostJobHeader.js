import React from 'react'
import {useNavigation} from '@react-navigation/native'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors } from '../../theme/tokens'
import Icon from '../../components/Icon'
import SideHeader from '../../components/SideHeader'
import { usePostJobCancel } from './usePostJobCancel'

// Step 1 is really title + timing — the category is inferred later, so "Basics"
// rather than "Job type" (which implies a category picker that isn't there).
const STEPS = ['Basics', 'Location', 'Details', 'Budget', 'Review']

export default function PostJobHeader({ currentStep, title, onBack, busy = false, extraChanges = false }) {
  const insets = useSafeAreaInsets()
  const navigation=useNavigation()
  const cancel=usePostJobCancel({currentStep,busy,extraChanges})
  const routes=[navigation.getState().routeNames.includes('GuestPostJob')?'GuestPostJob':'PostJob','PostJobStep2Location','PostJobStep3Details','PostJobStep4Budget','PostJobStep5Review']
  return (
    <View style={styles.header}>
      <SideHeader kind="job" label="POST A JOB · WANTED" tone="dark" topInset={insets.top} bg={colors.primary} pad={16} />
      <View style={styles.body}>
      <View style={styles.titleRow}>
        {/* Back on the left from Step 2; Cancel always on the right. */}
        {currentStep === 1 ? <View style={styles.backBtn} /> : <TouchableOpacity
          style={styles.backBtn}
          onPress={onBack}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel="Go back">
          <Text style={styles.backText}><Icon name="chevron-back" size={14} color="rgba(255,255,255,0.92)" /> Back</Text>
        </TouchableOpacity>}
        <Text style={styles.title} numberOfLines={1}>{title || 'Post a job'}</Text>
        <TouchableOpacity
          style={[styles.cancelBtn, busy && styles.cancelBusy]}
          onPress={cancel}
          disabled={busy}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          accessibilityState={{ disabled: busy }}
          accessibilityHint="Leaves without posting or saving. Asks first if you have made changes.">
          <Text style={styles.backText}>Cancel</Text>
        </TouchableOpacity>
      </View>
      {currentStep===1 ? <View style={styles.compact}>
        <Text style={styles.progressText}>Step 1 of {STEPS.length} · Basics</Text>
        <View style={styles.track} accessible accessibilityRole="progressbar"
          accessibilityValue={{min:0,max:STEPS.length,now:1}}>
          <View style={styles.fill} />
        </View>
      </View> : <View style={styles.stepsRow}>
        {STEPS.map((label, i) => {
          const n = i + 1
          const done   = n < currentStep
          const active = n === currentStep
          return (
            <TouchableOpacity key={n} style={styles.stepItem} disabled={!done||busy} accessibilityRole="button" accessibilityLabel={'Go to '+label} onPress={()=>navigation.popTo(routes[i])}>
              <View style={[styles.dot, done && styles.dotDone, active && styles.dotActive]}>
                <Text style={[styles.dotNum, (done || active) && styles.dotNumLight]}>
                  {done ? <Icon name="checkmark" size={13} color={colors.primary} /> : String(n)}
                </Text>
              </View>
              <Text style={[styles.stepLabel, active && styles.stepLabelActive]} numberOfLines={1}>
                {label}
              </Text>
            </TouchableOpacity>
          )
        })}
      </View>}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: colors.primary,
  },
  body: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 14,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  backBtn:  { minWidth: 72, minHeight: 32, justifyContent: 'center' },
  cancelBtn: { minWidth: 72, minHeight: 32, paddingHorizontal: 10, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.7)', alignItems: 'center', justifyContent: 'center' },
  cancelBusy: { opacity: 0.5 },
  backText: { color: 'rgba(255,255,255,0.92)', fontSize: 15, fontWeight: '600' },
  title:    { flexShrink: 1, fontSize: 17, fontWeight: '700', color: '#fff', textAlign: 'center' },
  compact: { gap: 7 },
  progressText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  track: { height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.25)' },
  fill: { width: '20%', height: '100%', borderRadius: 2, backgroundColor: '#fff' },

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
