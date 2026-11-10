import React, { useEffect, useState } from 'react'
import { StyleSheet, Text, TextInput, TouchableOpacity, View, ActivityIndicator } from 'react-native'
import { colors } from '../theme/tokens'
import { supabase } from '../lib/supabase'
import { formatDate as nzDate } from '../../shared/formatting'
import Button from './Button'
import Icon from './Icon'

// Payment handoff for an accepted JOB. Rural Connections never handles money —
// this only makes "whose turn" clear. Provider says how they'd like to be paid
// (bank details only ever go into the thread); requester marks it sent.
const METHOD_LABELS = {
  bank_transfer: 'Bank transfer',
  cash: 'Cash on the day',
  invoice: "I'll send an invoice",
  agreed: 'Already agreed',
}
const METHOD_MESSAGES = {
  cash: "I'll take cash on the day.",
  invoice: "I'll send you an invoice.",
  agreed: "Let's settle up the way we agreed.",
}

export default function JobPaymentHandoff({
  jobId, jobTitle, viewerRole, bidId, method, markedSentAt, paymentMessageId,
  otherFirstName, counterpartId, currentUserId, availableFrom, onChanged,
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // ── Requester view ─────────────────────────────────────────────────────────
  const [bankDetails, setBankDetails] = useState(null)
  useEffect(() => {
    let active = true
    // Bank details come ONLY from the message the RPC pinned — never by scanning
    // the thread.
    if (viewerRole === 'requester' && method === 'bank_transfer' && paymentMessageId) {
      supabase.from('messages').select('content').eq('id', paymentMessageId).maybeSingle()
        .then(({ data }) => { if (active) setBankDetails(data?.content || null) })
    }
    return () => { active = false }
  }, [viewerRole, method, paymentMessageId])

  async function markPaid(undo) {
    if (busy) return
    setBusy(true); setError('')
    const { error: rpcError } = await supabase.rpc('mark_job_payment_sent', { p_bid: bidId, p_undo: !!undo })
    setBusy(false)
    if (rpcError) { setError('Could not update. Pull to refresh and try again.'); return }
    onChanged?.()
  }

  if (viewerRole === 'requester') {
    if (!method) return null // nothing to pay yet; the next-move banner says to wait
    if (markedSentAt) {
      return (
        <View style={styles.card}>
          <View style={styles.doneRow}>
            <Icon name="checkmark-done-outline" size={18} color={colors.primary} />
            <Text style={styles.doneText}>Payment marked sent</Text>
            <TouchableOpacity onPress={() => markPaid(true)} disabled={busy} accessibilityRole="button" accessibilityLabel="Undo payment marked sent">
              <Text style={styles.undo}>{busy ? '…' : 'Undo'}</Text>
            </TouchableOpacity>
          </View>
          {!!error && <Text style={styles.error}>{error}</Text>}
        </View>
      )
    }
    return (
      <View style={styles.card}>
        <Text style={styles.title}>Pay {otherFirstName}</Text>
        <Text style={styles.metaRow}>How: {METHOD_LABELS[method] || method}</Text>
        {method === 'bank_transfer' && !!bankDetails && (
          <View style={styles.detailsBox}><Text style={styles.detailsText}>{bankDetails}</Text></View>
        )}
        {method === 'bank_transfer' && (
          <Text style={styles.safety}>Only pay the account {otherFirstName} sent in this conversation. Rural Connections never asks for payment.</Text>
        )}
        <Button
          title={method === 'cash' ? 'Paid on the day' : `I've paid — let ${otherFirstName} know`}
          onPress={() => markPaid(false)}
          loading={busy}
          accessibilityLabel="Mark payment sent"
        />
        {!!error && <Text style={styles.error}>{error}</Text>}
      </View>
    )
  }

  // ── Provider view ────────────────────────────────────────────────────────────
  const [open, setOpen] = useState(!method)
  const [choice, setChoice] = useState('')
  const [acct, setAcct] = useState('')
  const [acctNo, setAcctNo] = useState('')
  const [reference, setReference] = useState('Payment for ' + (jobTitle || 'the job'))
  const [timing, setTiming] = useState(
    `Hi ${otherFirstName}, I can do ${availableFrom ? nzDate(availableFrom) : 'this'} — does that suit?`,
  )
  const [timingState, setTimingState] = useState('idle') // idle | busy | sent

  async function sendTiming() {
    if (timingState === 'busy' || !timing.trim()) return
    setTimingState('busy')
    const { error: msgError } = await supabase.from('messages')
      .insert({ job_id: jobId, sender_id: currentUserId, receiver_id: counterpartId, content: timing.trim() })
    if (msgError) { setTimingState('idle'); setError('Could not send the message. Try again.'); return }
    setTimingState('sent'); onChanged?.()
  }

  async function sendMethod() {
    if (busy || !choice) return
    if (choice === 'bank_transfer' && (!acct.trim() || !acctNo.trim())) { setError('Add the account name and number.'); return }
    const message = choice === 'bank_transfer'
      ? `Please pay by bank transfer.\nAccount name: ${acct.trim()}\nAccount number: ${acctNo.trim()}\nReference: ${reference.trim() || '—'}`
      : (METHOD_MESSAGES[choice] || '')
    setBusy(true); setError('')
    const { error: rpcError } = await supabase.rpc('set_job_payment_method', { p_bid: bidId, p_method: choice, p_message: message })
    setBusy(false)
    if (rpcError) { setError('Could not save. Pull to refresh and try again.'); return }
    setOpen(false); onChanged?.()
  }

  if (method && !open) {
    return (
      <View style={styles.card}>
        <View style={styles.doneRow}>
          <Icon name="card-outline" size={18} color={colors.primary} />
          <Text style={styles.doneText}>Paid by: {METHOD_LABELS[method] || method}</Text>
          <TouchableOpacity onPress={() => { setOpen(true); setChoice('') }} accessibilityRole="button" accessibilityLabel="Change payment method">
            <Text style={styles.undo}>Change</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Next steps</Text>

      <Text style={styles.stepLabel}>1. Confirm timing</Text>
      <TextInput
        style={styles.input}
        value={timing}
        onChangeText={setTiming}
        multiline
        maxLength={1000}
        accessibilityLabel="Timing message"
      />
      <Button
        variant="secondary"
        title={timingState === 'sent' ? 'Message sent' : timingState === 'busy' ? 'Sending…' : `Send to ${otherFirstName}`}
        onPress={sendTiming}
        disabled={timingState !== 'idle'}
        style={{ marginBottom: 14 }}
      />

      <Text style={styles.stepLabel}>2. How would you like to be paid?</Text>
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
          <Text style={styles.previewText}>
            {choice === 'bank_transfer'
              ? `Please pay by bank transfer.\nAccount name: ${acct || '—'}\nAccount number: ${acctNo || '—'}\nReference: ${reference || '—'}`
              : (METHOD_MESSAGES[choice] || '')}
          </Text>
        </View>
      )}

      {!!choice && (
        <Button title={busy ? 'Sending…' : 'Send'} onPress={sendMethod} loading={busy} />
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
  stepLabel: { fontSize: 14, fontWeight: '700', color: colors.textPrimary, marginBottom: 8, marginTop: 4 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: colors.textSecondary, marginBottom: 4, marginTop: 8 },
  hint: { fontSize: 11, color: colors.textMuted, marginTop: 4 },
  metaRow: { fontSize: 14, color: colors.textPrimary, marginBottom: 8 },
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
  doneRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  doneText: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  undo: { fontSize: 13, fontWeight: '700', color: colors.primary },
  error: { fontSize: 13, color: colors.danger, marginTop: 8 },
})
