import React, { useEffect, useState } from 'react'
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import Button from './Button'
import Icon from './Icon'
import { colors } from '../theme/tokens'

// "Mark complete" for an accepted JOB. The only required tick is that the work
// is finished. Payment is flexible: if it's already marked as taken care of we
// just show that; otherwise an optional, never pre-ticked box lets the provider
// say so now — or leave it and invoice later.
export default function MarkCompleteSheet({ visible, otherFirstName, paymentSortedByline, busy, error, onClose, onConfirm }) {
  const [finished, setFinished] = useState(false)
  const [paymentSorted, setPaymentSorted] = useState(false)

  useEffect(() => {
    if (visible) { setFinished(false); setPaymentSorted(false) }
  }, [visible])

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.heading}>
            <Text style={styles.title}>Mark this job complete</Text>
            <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Close">
              <Icon name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <Text style={styles.body}>This closes the job and invites {otherFirstName} to leave a review.</Text>

          <Tick checked={finished} onToggle={() => setFinished(v => !v)} label="The work is finished" />

          {paymentSortedByline ? (
            <View style={styles.sortedRow}>
              <Icon name="checkmark-done-outline" size={18} color={colors.primary} />
              <Text style={styles.sortedText}>Payment all taken care of ✓ ({paymentSortedByline})</Text>
            </View>
          ) : (
            <>
              <Tick checked={paymentSorted} onToggle={() => setPaymentSorted(v => !v)} label="Payment's all taken care of" />
              <Text style={styles.hint}>Optional — leave it unticked if you're invoicing later.</Text>
            </>
          )}

          {!!error && <Text style={styles.error}>{error}</Text>}

          <View style={styles.actions}>
            <Button variant="secondary" title="Not yet" onPress={onClose} style={styles.action} />
            <Button
              title="Mark complete"
              onPress={() => onConfirm({ paymentSorted: !paymentSortedByline && paymentSorted })}
              loading={busy}
              disabled={!finished}
              style={styles.action}
            />
          </View>
        </View>
      </View>
    </Modal>
  )
}

function Tick({ checked, onToggle, label }) {
  return (
    <TouchableOpacity
      style={styles.tickRow}
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}>
      <View style={[styles.box, checked && styles.boxChecked]}>
        {checked ? <Icon name="checkmark" size={16} color={colors.white} /> : null}
      </View>
      <Text style={styles.tickLabel}>{label}</Text>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(12,28,22,0.48)', justifyContent: 'center', padding: 20 },
  sheet: { backgroundColor: colors.white, borderRadius: 16, padding: 20 },
  heading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  title: { flex: 1, color: colors.textPrimary, fontSize: 20, fontWeight: '700' },
  body: { color: colors.textSecondary, fontSize: 14, lineHeight: 20, marginBottom: 12 },
  tickRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, minHeight: 44 },
  box: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white },
  boxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
  tickLabel: { flex: 1, color: colors.textPrimary, fontSize: 15, fontWeight: '600' },
  hint: { color: colors.textMuted, fontSize: 12, marginLeft: 36, marginTop: -4, marginBottom: 4 },
  sortedRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  sortedText: { flex: 1, color: colors.textPrimary, fontSize: 14, fontWeight: '600' },
  error: { color: colors.danger, fontSize: 13, fontWeight: '600', marginTop: 8 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  action: { flex: 1 },
})
