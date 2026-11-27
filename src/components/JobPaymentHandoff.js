import React, { useEffect, useRef, useState } from 'react'
import { Alert, StyleSheet, Text, View } from 'react-native'
import { colors } from '../theme/tokens'
import { supabase } from '../lib/supabase'
import { agreedPaymentMethodLabels, paymentAcknowledgement as copy, paymentAcknowledgementActor } from '../../shared/paymentAcknowledgement'
import Button from './Button'

export default function JobPaymentHandoff({
  bidId, method, sortedAt, sortedBy, requesterId, providerId, canUpdate, canEditMethod, onChanged,
}) {
  const saving = useRef(false)
  const [busy, setBusy] = useState(false)
  const [sorted, setSorted] = useState(!!sortedAt)
  const [actor, setActor] = useState(paymentAcknowledgementActor(sortedBy, requesterId, providerId))
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')
  const [editingMethod, setEditingMethod] = useState(false)

  useEffect(() => {
    setSorted(!!sortedAt)
    setActor(paymentAcknowledgementActor(sortedBy, requesterId, providerId))
  }, [sortedAt, sortedBy, requesterId, providerId])

  async function save(undo) {
    if (!canUpdate || saving.current) return
    saving.current = true
    setBusy(true)
    setError('')
    setFeedback('')
    try {
      const { error: rpcError } = await supabase.rpc('mark_job_payment_sorted', { p_bid: bidId, p_undo: undo })
      if (rpcError) throw rpcError
      setSorted(!undo)
      setActor(null)
      setFeedback(undo ? copy.removed : '')
    } catch {
      setError(copy.error)
      return
    } finally {
      saving.current = false
      setBusy(false)
    }
    onChanged?.()
  }

  function undo() {
    Alert.alert(copy.undoTitle, copy.undoDetail, [
      { text: 'Cancel', style: 'cancel' },
      { text: copy.undoConfirm, onPress: () => save(true) },
    ], { cancelable: true })
  }

  async function updateMethod(choice) {
    if (!canEditMethod || saving.current) return
    saving.current = true
    setBusy(true)
    setFeedback('')
    setError('')
    try {
      const { error: rpcError } = await supabase.rpc('set_job_payment_method', {
        p_bid: bidId, p_method: choice, p_message: '',
      })
      if (rpcError) throw rpcError
      setEditingMethod(false)
      setFeedback('Payment method updated.')
    } catch {
      setError('Could not update the payment method. Please try again.')
      return
    } finally {
      saving.current = false
      setBusy(false)
    }
    onChanged?.()
  }

  return (
    <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.title}>Payment</Text>
      {sorted && <Text accessibilityLiveRegion="polite" style={styles.status}>{copy.sorted}</Text>}
      {!sorted && <Text style={styles.body}>{canUpdate ? copy.providerReminder : copy.reminder}</Text>}
      {agreedPaymentMethodLabels[method] && <Text style={styles.body}>Agreed method: {agreedPaymentMethodLabels[method]}</Text>}
      {canUpdate && (
        <Button
          variant="secondary"
          title={busy ? 'Saving…' : sorted ? copy.undo : copy.mark}
          onPress={sorted ? undo : () => save(false)}
          disabled={busy}
          loading={busy}
        />
      )}
      {canEditMethod && (editingMethod ? (
        <>
          {Object.entries(agreedPaymentMethodLabels).map(([id, label]) => (
            <Button key={id} title={label} variant="secondary" disabled={busy} onPress={() => updateMethod(id)} />
          ))}
          <Button title="Cancel method change" variant="secondary" disabled={busy} onPress={() => setEditingMethod(false)} />
        </>
      ) : (
        <Button title="Change payment method" variant="secondary" disabled={busy} onPress={() => setEditingMethod(true)} />
      ))}
      {!!feedback && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.body}>{feedback}</Text>}
      {!!error && <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" style={styles.error}>{error}</Text>}
    </View>
  )
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.white, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 8, marginBottom: 12 },
  title: { color: colors.textPrimary, fontSize: 18, fontWeight: '700' },
  status: { color: colors.primary, fontWeight: '700' },
  body: { color: colors.textSecondary, lineHeight: 20 },
  error: { color: colors.danger || '#9f2626', lineHeight: 20 },
})
