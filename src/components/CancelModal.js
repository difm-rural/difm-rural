import React, { useEffect, useRef, useState } from 'react'
import {
  Animated,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

const REASONS = {
  job_open: [
    'Job no longer needed',
    'Found someone locally',
    'Budget has changed',
    'Posted by mistake',
    'Taking too long to get offers',
    'Other',
  ],
  job_accepted: [
    'Job no longer needed',
    'Provider not responding',
    'Provider cancelled on me',
    'Budget has changed',
    'Other',
  ],
  booking: [
    'Service no longer needed',
    'Found someone else',
    'Budget has changed',
    'Booked by mistake',
    'Provider not responding',
    'Other',
  ],
}

export default function CancelModal({
  visible,
  onClose,
  onConfirm,
  title = 'Cancel',
  subtitle,
  type = 'job_open',
  bidCount = 0,
  providerName,
}) {
  const insets = useSafeAreaInsets()
  const slideAnim = useRef(new Animated.Value(600)).current
  const fadeAnim  = useRef(new Animated.Value(0)).current

  const [selectedReason, setSelectedReason] = useState(null)
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (visible) {
      setSelectedReason(null)
      setNote('')
      setSubmitting(false)
      slideAnim.setValue(600)
      fadeAnim.setValue(0)
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
        Animated.timing(fadeAnim,  { toValue: 1, duration: 250, useNativeDriver: true }),
      ]).start()
    }
  }, [visible])

  const reasons    = REASONS[type] || REASONS.job_open
  const isJob      = type !== 'booking'
  const keepLabel  = isJob ? 'Keep job' : 'Keep booking'
  const confirmLabel = isJob ? 'Cancel job →' : 'Cancel booking →'
  const canConfirm = !!selectedReason && !submitting

  let warningText  = null
  let isRedWarning = false
  if (type === 'job_open' && bidCount > 0) {
    warningText = `${bidCount} provider${bidCount !== 1 ? 's have' : ' has'} made an offer on this job and will be notified.`
  } else if (type === 'job_accepted') {
    warningText = `${providerName ? `${providerName} has` : 'A provider has'} accepted this job and will be notified. This may affect your rating.`
    isRedWarning = true
  } else if (type === 'booking') {
    warningText = 'The provider will be notified of your cancellation.'
  }

  async function handleConfirm() {
    if (!canConfirm) return
    setSubmitting(true)
    await onConfirm(selectedReason, note.trim() || null)
    setSubmitting(false)
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent>

      <View style={styles.wrapper}>
        {/* Tap-anywhere-to-dismiss sits behind the sheet */}
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          activeOpacity={1}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />

        {/* Dark overlay fades in on top of tap area, below sheet */}
        <Animated.View
          style={[StyleSheet.absoluteFill, styles.overlay, { opacity: fadeAnim }]}
          pointerEvents="none"
        />

        {/* Sliding sheet — rendered last so it's on top */}
        <Animated.View style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}>

          {/* Handle bar */}
          <View style={styles.handle} />

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.scrollContent}>

            <Text style={styles.title}>{title}</Text>
            {!!subtitle && (
              <Text style={styles.subtitle} numberOfLines={2}>{subtitle}</Text>
            )}

            {/* Warning box */}
            {!!warningText && (
              <View style={[styles.warningBox, isRedWarning && styles.warningBoxRed]}>
                <Text style={[styles.warningText, isRedWarning && styles.warningTextRed]}>
                  ⚠️ {warningText}
                </Text>
              </View>
            )}

            {/* Reason list */}
            <Text style={styles.sectionLabel}>Why are you cancelling?</Text>
            {reasons.map((reason, idx) => (
              <TouchableOpacity
                key={reason}
                style={[styles.radioRow, idx === reasons.length - 1 && styles.radioRowLast]}
                onPress={() => { setSelectedReason(reason); if (reason !== 'Other') setNote('') }}
                activeOpacity={0.7}
                accessibilityRole="radio"
                accessibilityState={{ checked: selectedReason === reason }}
                accessibilityLabel={reason}>
                <View style={[styles.radioCircle, selectedReason === reason && styles.radioCircleSelected]}>
                  {selectedReason === reason && <View style={styles.radioDot} />}
                </View>
                <Text style={[styles.radioLabel, selectedReason === reason && styles.radioLabelSelected]}>
                  {reason}
                </Text>
              </TouchableOpacity>
            ))}

            {/* "Other" note input */}
            {selectedReason === 'Other' && (
              <TextInput
                style={styles.noteInput}
                placeholder="Please describe your reason..."
                placeholderTextColor="#aaa"
                value={note}
                onChangeText={setNote}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                autoFocus
                accessibilityLabel="Cancellation note"
              />
            )}
          </ScrollView>

          {/* Fixed action buttons */}
          <View style={[styles.buttons, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <TouchableOpacity
              style={styles.keepBtn}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={keepLabel}>
              <Text style={styles.keepBtnText}>{keepLabel}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmBtn, !canConfirm && styles.confirmBtnDisabled]}
              onPress={handleConfirm}
              disabled={!canConfirm}
              accessibilityRole="button"
              accessibilityLabel={confirmLabel}>
              <Text style={styles.confirmBtnText}>
                {submitting ? 'Cancelling…' : confirmLabel}
              </Text>
            </TouchableOpacity>
          </View>

        </Animated.View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  overlay: {
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '88%',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 20,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: '#d1d5db',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 4,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },

  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#c0392b',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#666666',
    marginBottom: 16,
    lineHeight: 20,
  },

  warningBox: {
    backgroundColor: '#fff8e1',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#ffd54f',
  },
  warningBoxRed: {
    backgroundColor: '#fce8e8',
    borderColor: '#ef9a9a',
  },
  warningText: {
    fontSize: 13,
    color: '#795548',
    lineHeight: 19,
  },
  warningTextRed: {
    color: '#c0392b',
  },

  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#999999',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  radioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: '#f2f2f2',
    gap: 14,
    minHeight: 48,
  },
  radioRowLast: {
    borderBottomWidth: 0,
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#cccccc',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  radioCircleSelected: {
    borderColor: '#c0392b',
    borderWidth: 2,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#c0392b',
  },
  radioLabel: {
    fontSize: 15,
    color: '#333333',
    flex: 1,
  },
  radioLabelSelected: {
    fontWeight: '600',
    color: '#c0392b',
  },

  noteInput: {
    borderWidth: 1.5,
    borderColor: '#c0392b',
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: '#222222',
    marginTop: 8,
    minHeight: 80,
    backgroundColor: '#fff8f8',
    textAlignVertical: 'top',
  },

  buttons: {
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: '#f2f2f2',
  },
  keepBtn: {
    borderWidth: 1.5,
    borderColor: '#cccccc',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    minHeight: 52,
    justifyContent: 'center',
  },
  keepBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666666',
  },
  confirmBtn: {
    backgroundColor: '#c0392b',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    minHeight: 52,
    justifyContent: 'center',
  },
  confirmBtnDisabled: {
    backgroundColor: '#e8a9a0',
  },
  confirmBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
  },
})
