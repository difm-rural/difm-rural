import React from 'react'
import { Modal, StyleSheet, Text, View } from 'react-native'
import Button from './Button'
import { colors } from '../theme/tokens'

export default function MarkCompleteSheet({ visible, otherFirstName, busy, error, onClose, onConfirm }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={busy ? undefined : onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet} accessibilityViewIsModal>
          <Text accessibilityRole="header" style={styles.title}>Mark this job complete</Text>
          <Text style={styles.body}>Marking complete closes this job and invites {otherFirstName} to leave a review.</Text>
          {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
          <View style={styles.actions}>
            <Button variant="secondary" title="Not yet" onPress={onClose} disabled={busy} style={styles.action} />
            <Button title="Mark complete" onPress={onConfirm} loading={busy} style={styles.action} />
          </View>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(12,28,22,0.48)', justifyContent: 'center', padding: 20 },
  sheet: { backgroundColor: colors.white, borderRadius: 16, padding: 20, gap: 12 },
  title: { color: colors.textPrimary, fontSize: 20, fontWeight: '700' },
  body: { color: colors.textSecondary, fontSize: 14, lineHeight: 20 },
  error: { color: colors.danger },
  actions: { flexDirection: 'row', gap: 12 },
  action: { flex: 1 },
})
