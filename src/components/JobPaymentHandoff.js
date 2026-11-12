import React, { useEffect, useState } from 'react'
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View, ActivityIndicator } from 'react-native'
import { colors } from '../theme/tokens'
import { supabase } from '../lib/supabase'
import { formatDate as nzDate } from '../../shared/formatting'
import { paymentLine } from '../../shared/offers'
import Button from './Button'
import Icon from './Icon'

// Payment handoff for an accepted JOB. Rural Connections never handles money —
// this only keeps both people on the same page. The provider says how they'd
// like to be paid (bank details only ever go into the thread); EITHER person
// can then say "Payment all taken care of" at any time, and undo it.
const METHOD_LABELS = {
  bank_transfer: 'Bank transfer',
  cash: 'Cash on the day',
  invoice: "I'll send an invoice",
  agreed: 'Already agreed',
}

// "You, 12 Nov 2026" / "Sam, 12 Nov 2026" — who marked payment sorted and when.
export function paymentSortedByline({ sortedAt, sortedBy, currentUserId, otherFirstName }) {
  const who = sortedBy && sortedBy === currentUserId ? 'You' : (otherFirstName || 'Them')
  return `${who}, ${nzDate(new Date(sortedAt))}`
}

// The single button both sides see, and its "done · Undo" state.
function PaymentSortedControl({ bidId, sortedAt, sortedBy, currentUserId, otherFirstName, onChanged }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function mark(undo) {
    if (busy) return
    setBusy(true); setError('')
    const { error: rpcError } = await supabase.rpc('mark_job_payment_sorted', { p_bid: bidId, p_undo: !!undo })
    setBusy(false)
    if (rpcError) { setError('Could not update. Pull to refresh and try again.'); return }
    onChanged?.()
  }

  function confirmUndo() {
    Alert.alert('Mark payment as not sorted?', `${otherFirstName} will be told.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Mark not sorted', onPress: () => mark(true) },
    ])
  }

  if (sortedAt) {
    return (
      <View>
        <View style={styles.doneRow}>
          <Icon name="checkmark-done-outline" size={18} color={colors.primary} />
          <Text style={styles.doneText}>
            Payment all taken care of
            <Text style={styles.doneMeta}> · {paymentSortedByline({ sortedAt, sortedBy, currentUserId, otherFirstName })}</Text>
          </Text>
          <TouchableOpacity onPress={confirmUndo} disabled={busy} accessibilityRole="button" accessibilityLabel="Undo payment all taken care of">
            <Text style={styles.undo}>{busy ? '…' : 'Undo'}</Text>
          </TouchableOpacity>
        </View>
        {!!error && <Text style={styles.error}>{error}</Text>}
      </View>
    )
  }
  return (
    <View>
      <Button title="Payment all taken care of" onPress={() => mark(false)} loading={busy} accessibilityLabel="Payment all taken care of" />
      {!!error && <Text style={styles.error}>{error}</Text>}
    </View>
  )
}

export default function JobPaymentHandoff(props) {
  return props.viewerRole === 'requester' ? <RequesterPayment {...props} /> : <ProviderPayment {...props} />
}

function RequesterPayment({
  bidId, method, amount, pricingType, sortedAt, sortedBy, paymentMessageId, otherFirstName, currentUserId, onChanged,
}) {
  const [bankDetails, setBankDetails] = useState(null)
  useEffect(() => {
    let active = true
    // Bank details come ONLY from the message the RPC pinned — never by scanning
    // the thread.
    if (method === 'bank_transfer' && paymentMessageId) {
      supabase.from('messages').select('content').eq('id', paymentMessageId).maybeSingle()
        .then(({ data }) => { if (active) setBankDetails(data?.content || null) })
    }
    return () => { active = false }
  }, [method, paymentMessageId])

  if (!method) return null // not confirmed yet; the next-move banner says to wait
  const sorted = { bidId, sortedAt, sortedBy, currentUserId, otherFirstName, onChanged }

  if (sortedAt) return <View style={styles.card}><PaymentSortedControl {...sorted} /></View>

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{paymentLine(amount, pricingType, method)}</Text>
      {method === 'bank_transfer' && !!bankDetails && (
        <View style={styles.detailsBox}><Text style={styles.detailsText}>{bankDetails}</Text></View>
      )}
      {method === 'bank_transfer' && (
        <Text style={[styles.safety, styles.safetyAbove]}>Only pay the account {otherFirstName} sent in this conversation. Rural Connections never asks for payment.</Text>
      )}
      <PaymentSortedControl {...sorted} />
    </View>
  )
}

function ProviderPayment({
  jobTitle, bidId, method, amount, pricingType, sortedAt, sortedBy, otherFirstName, currentUserId, onChanged,
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(!method)
  const [choice, setChoice] = useState('')
  const [acct, setAcct] = useState('')
  const [acctNo, setAcctNo] = useState('')
  const [reference, setReference] = useState('Payment for ' + (jobTitle || 'the job'))

  // The RPC posts the "Payment: $150 by …" line itself; only bank details ride along.
  const details = choice === 'bank_transfer'
    ? `Please pay by bank transfer.\nAccount name: ${acct.trim() || '—'}\nAccount number: ${acctNo.trim() || '—'}\nReference: ${reference.trim() || '—'}`
    : ''

  async function sendMethod() {
    if (busy || !choice) return
    if (choice === 'bank_transfer' && (!acct.trim() || !acctNo.trim())) { setError('Add the account name and number.'); return }
    setBusy(true); setError('')
    const { error: rpcError } = await supabase.rpc('set_job_payment_method', { p_bid: bidId, p_method: choice, p_message: details })
    setBusy(false)
    if (rpcError) { setError('Could not save. Pull to refresh and try again.'); return }
    setOpen(false); onChanged?.()
  }

  if (method && !open) {
    return (
      <View style={styles.card}>
        <View style={[styles.doneRow, styles.methodRow]}>
          <Icon name="card-outline" size={18} color={colors.primary} />
          <Text style={styles.doneText}>{paymentLine(amount, pricingType, method)}</Text>
          <TouchableOpacity onPress={() => { setOpen(true); setChoice('') }} accessibilityRole="button" accessibilityLabel="Change payment method">
            <Text style={styles.undo}>Change</Text>
          </TouchableOpacity>
        </View>
        <PaymentSortedControl
          bidId={bidId} sortedAt={sortedAt} sortedBy={sortedBy}
          currentUserId={currentUserId} otherFirstName={otherFirstName} onChanged={onChanged}
        />
      </View>
    )
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>How would you like to be paid?</Text>
      <View style={styles.options}>
        {Object.entries(METHOD_LABELS).map(([id, label]) => (
          <TouchableOpacity
            key={id}
            style={[styles.option, choice === id && styles.optionActive]}
            onPress={() => setChoice(id)}
            accessibilityRole="button"
            accessibilityState={{ selected: choice === id }}
            accessibilityLabel={label}>
            <Text style={[styles.optionText, choice === id && styles.optionTextActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {choice === 'bank_transfer' && (
        <View style={styles.bankForm}>
          <Text style={styles.fieldLabel}>Account name</Text>
          <TextInput style={styles.input} value={acct} onChangeText={setAcct} maxLength={120} />
          <Text style={styles.fieldLabel}>Account number</Text>
          <TextInput style={styles.input} value={acctNo} onChangeText={setAcctNo} placeholder="00-0000-0000000-00" placeholderTextColor={colors.textMuted} keyboardType="numbers-and-punctuation" />
          <Text style={styles.hint}>NZ format, e.g. 00-0000-0000000-00(0)</Text>
          <Text style={styles.fieldLabel}>Reference</Text>
          <TextInput style={styles.input} value={reference} onChangeText={setReference} maxLength={120} />
        </View>
      )}

      {!!choice && (
        <View style={styles.previewBox}>
          <Text style={styles.previewHead}>Message to {otherFirstName}</Text>
          <Text style={styles.previewText}>{paymentLine(amount, pricingType, choice)}{details ? `\n\n${details}` : ''}</Text>
        </View>
      )}

      {!!choice && (
        <Button title={busy ? 'Sending…' : 'Send'} onPress={sendMethod} loading={busy} />
      )}
      {!!method && (
        <TouchableOpacity onPress={() => { setOpen(false); setError('') }} accessibilityRole="button" style={styles.cancelChange}>
          <Text style={styles.undo}>Keep current payment</Text>
        </TouchableOpacity>
      )}
      {!!error && <Text style={styles.error}>{error}</Text>}
      <Text style={styles.safety}>Rural Connections never handles the money — only share account details here, in the conversation.</Text>
      {busy && <ActivityIndicator style={{ marginTop: 8 }} color={colors.primary} />}
    </View>
  )
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 16, marginBottom: 12 },
  title: { fontSize: 16, fontWeight: '800', color: colors.textPrimary, marginBottom: 10 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: colors.textSecondary, marginBottom: 4, marginTop: 8 },
  hint: { fontSize: 11, color: colors.textMuted, marginTop: 4 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: colors.textPrimary, backgroundColor: colors.white, marginBottom: 2 },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  option: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9, backgroundColor: colors.white },
  optionActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  optionText: { fontSize: 13, fontWeight: '700', color: colors.textPrimary },
  optionTextActive: { color: colors.white },
  bankForm: { marginBottom: 10 },
  previewBox: { backgroundColor: colors.background, borderRadius: 10, padding: 12, marginBottom: 12 },
  previewHead: { fontSize: 12, fontWeight: '800', color: colors.textSecondary, marginBottom: 4 },
  previewText: { fontSize: 13, color: colors.textPrimary, lineHeight: 19 },
  detailsBox: { backgroundColor: colors.background, borderRadius: 10, padding: 12, marginBottom: 8 },
  detailsText: { fontSize: 13, color: colors.textPrimary, lineHeight: 19 },
  safety: { fontSize: 12, color: colors.textMuted, marginTop: 10, lineHeight: 17 },
  safetyAbove: { marginTop: 0, marginBottom: 12 },
  doneRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  methodRow: { marginBottom: 12 },
  doneText: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  doneMeta: { fontWeight: '500', color: colors.textSecondary },
  undo: { fontSize: 13, fontWeight: '700', color: colors.primary },
  cancelChange: { marginTop: 10, alignSelf: 'flex-start' },
  error: { fontSize: 13, color: colors.danger, marginTop: 8 },
})
