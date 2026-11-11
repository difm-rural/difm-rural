import React, { useEffect, useState } from 'react'
import { Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import DateTimePicker from '@react-native-community/datetimepicker'
import { formatDate as nzDate } from '../../shared/formatting.js'
import { defaultStartForDate, timeLabel } from './ArrivalWindowModal'
import { supabase } from '../lib/supabase'
import Button from './Button'
import Icon from './Icon'
import { colors } from '../theme/tokens'

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

// One-step job confirmation: arrival time + how to get paid, posted together via
// the confirm_job RPC (one message, one notification).
export default function ConfirmJobSheet({ visible, bidId, jobTitle, requesterFirst, availableFrom, onClose, onConfirmed }) {
  const [start, setStart] = useState(() => defaultStartForDate(availableFrom))
  const [picker, setPicker] = useState(null)
  const [choice, setChoice] = useState('')
  const [acct, setAcct] = useState('')
  const [acctNo, setAcctNo] = useState('')
  const [reference, setReference] = useState('Payment for ' + (jobTitle || 'the job'))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!visible) return
    setStart(defaultStartForDate(availableFrom))
    setPicker(null); setChoice(''); setAcct(''); setAcctNo('')
    setReference('Payment for ' + (jobTitle || 'the job')); setError('')
  }, [visible, availableFrom, jobTitle])

  function changeDate(nextDate) { setStart(defaultStartForDate(nextDate)) }
  function changeTime(nextTime) {
    const next = new Date(start)
    next.setHours(nextTime.getHours(), nextTime.getMinutes(), 0, 0)
    setStart(next)
  }

  const isPast = start.getTime() <= Date.now()
  const paymentMessage = choice === 'bank_transfer'
    ? `Please pay by bank transfer.\nAccount name: ${acct || '—'}\nAccount number: ${acctNo || '—'}\nReference: ${reference || '—'}`
    : (METHOD_MESSAGES[choice] || '')
  const bankIncomplete = choice === 'bank_transfer' && (!acct.trim() || !acctNo.trim())
  const blocked = isPast || !choice || bankIncomplete || busy

  async function confirm() {
    if (blocked) return
    setBusy(true); setError('')
    const { error: rpcError } = await supabase.rpc('confirm_job', {
      p_bid: bidId,
      p_arrival: start.toISOString(),
      p_method: choice,
      p_message: paymentMessage,
    })
    setBusy(false)
    if (rpcError) {
      setError(rpcError.message === 'Choose an arrival time in the future and a finish time after it'
        ? 'That time has already passed. Pick a time later today or another day.'
        : (rpcError.message || 'Could not confirm. Pull to refresh and try again.'))
      return
    }
    onConfirmed?.()
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.heading}>
            <View>
              <Text style={styles.kicker}>CONFIRM THE JOB</Text>
              <Text style={styles.title}>Arrival & payment</Text>
            </View>
            <TouchableOpacity onPress={onClose} accessibilityLabel="Close">
              <Icon name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ maxHeight: 460 }} keyboardShouldPersistTaps="handled">
            <Text style={styles.section}>When will you arrive?</Text>
            <TouchableOpacity style={styles.field} onPress={() => setPicker('date')}>
              <Text style={styles.fieldLabel}>Date</Text><Text style={styles.fieldValue}>{nzDate(start)}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.field} onPress={() => setPicker('time')}>
              <Text style={styles.fieldLabel}>Expected arrival</Text><Text style={styles.fieldValue}>{timeLabel(start)}</Text>
            </TouchableOpacity>
            {isPast ? <Text style={styles.error}>Pick a time later today</Text> : null}
            {picker ? (
              <View style={styles.pickerWrap}>
                <DateTimePicker
                  value={start}
                  mode={picker === 'date' ? 'date' : 'time'}
                  minimumDate={picker === 'date' ? new Date() : undefined}
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={(event, value) => {
                    if (Platform.OS === 'android') setPicker(null)
                    if (!value || event.type === 'dismissed') return
                    if (picker === 'date') changeDate(value); else changeTime(value)
                  }}
                />
                {Platform.OS === 'ios' ? (
                  <TouchableOpacity style={styles.done} onPress={() => setPicker(null)}>
                    <Text style={styles.doneText}>Done</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}

            <Text style={styles.section}>How would you like to be paid?</Text>
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
            {choice === 'bank_transfer' ? (
              <View>
                <Text style={styles.fieldLabel2}>Account name</Text>
                <TextInput style={styles.input} value={acct} onChangeText={setAcct} maxLength={120} />
                <Text style={styles.fieldLabel2}>Account number</Text>
                <TextInput style={styles.input} value={acctNo} onChangeText={setAcctNo} placeholder="00-0000-0000000-00" placeholderTextColor={colors.textMuted} keyboardType="numbers-and-punctuation" />
                <Text style={styles.hint}>NZ format, e.g. 00-0000-0000000-00(0)</Text>
                <Text style={styles.fieldLabel2}>Reference</Text>
                <TextInput style={styles.input} value={reference} onChangeText={setReference} maxLength={120} />
              </View>
            ) : null}
            {choice ? (
              <View style={styles.previewBox}>
                <Text style={styles.previewHead}>Message to {requesterFirst}</Text>
                <Text style={styles.previewText}>{`Confirmed: I'll be there around ${timeLabel(start)} (${nzDate(start)}).`}{paymentMessage ? `\n\n${paymentMessage}` : ''}</Text>
              </View>
            ) : null}
            {!!error && <Text style={styles.error}>{error}</Text>}
          </ScrollView>

          <View style={styles.actions}>
            <Button variant="secondary" title="Cancel" onPress={onClose} style={styles.action} />
            <Button title="Confirm job" onPress={confirm} loading={busy} disabled={blocked} style={styles.action} />
          </View>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(12,28,22,0.48)', justifyContent: 'center', padding: 20 },
  sheet: { backgroundColor: colors.white, borderRadius: 16, padding: 20 },
  heading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
  kicker: { color: colors.accent, fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 5 },
  title: { color: colors.textPrimary, fontSize: 22, fontWeight: '700' },
  section: { color: colors.textPrimary, fontSize: 15, fontWeight: '800', marginTop: 12, marginBottom: 8 },
  field: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, marginBottom: 10 },
  fieldLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '700', marginBottom: 4, textTransform: 'uppercase' },
  fieldLabel2: { color: colors.textSecondary, fontSize: 12, fontWeight: '700', marginBottom: 4, marginTop: 8 },
  fieldValue: { color: colors.textPrimary, fontSize: 15, fontWeight: '600' },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: colors.textPrimary },
  hint: { fontSize: 11, color: colors.textMuted, marginTop: 4 },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  option: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9, backgroundColor: colors.white },
  optionActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  optionText: { fontSize: 13, fontWeight: '700', color: colors.textPrimary },
  optionTextActive: { color: colors.white },
  previewBox: { backgroundColor: colors.background, borderRadius: 10, padding: 12, marginTop: 4, marginBottom: 8 },
  previewHead: { fontSize: 12, fontWeight: '800', color: colors.textSecondary, marginBottom: 4 },
  previewText: { fontSize: 13, color: colors.textPrimary, lineHeight: 19 },
  error: { color: colors.danger, fontSize: 13, fontWeight: '600', marginTop: 6, marginBottom: 4 },
  pickerWrap: { borderTopWidth: 1, borderTopColor: colors.border, marginBottom: 10 },
  done: { alignSelf: 'flex-end', padding: 8 },
  doneText: { color: colors.primary, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 10 },
  action: { flex: 1 },
})
