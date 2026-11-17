import React, { useEffect, useRef, useState } from 'react'
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import ArrivalWhen from './ArrivalWhen'
import FullScreenSheet from './FullScreenSheet'
import { formatWorkDateTime } from '../../shared/formatting.js'
import { nzCalendarDay, nzToday } from '../../shared/postingDates'
import { arrivalDayChoices, arrivalDayNote } from '../../shared/requestedDate'
import { arrivalPickerInstant, arrivalPickerSeed } from '../lib/quickPickDates'
import { supabase } from '../lib/supabase'
import { paymentLine } from '../../shared/offers'
import Button from './Button'
import { colors } from '../theme/tokens'

const METHOD_LABELS = {
  bank_transfer: 'Bank transfer',
  cash: 'Cash',
  invoice: "I'll send an invoice",
  agreed: 'Arrange directly',
}

// One-step job confirmation: arrival time + how to get paid, posted together via
// the confirm_job RPC (one message, one notification). The RPC writes the
// "Payment: $150 by bank transfer" line itself; the preview mirrors it.
//
// `job` carries the requested schedule (schedule_type, scheduled_date, date_from,
// date_to): the requested date is shown, offered as the first chip and
// pre-selected so the provider can accept it in one tap. `availableFrom` is the
// date on the provider's own offer.
//
// Full screen: "When" is one collapsed row (ArrivalWhen), then payment, note and
// the message preview; Confirm job stays pinned above the keyboard.
export default function ConfirmJobSheet({ visible, bidId, jobTitle, requesterFirst, job, availableFrom, amount, pricingType, onClose, onConfirmed }) {
  const initialDay = arrivalDayChoices(job, { today: nzToday(), offerDay: availableFrom }).preselect
  const [start, setStart] = useState(() => arrivalPickerSeed(initialDay))
  const [daySelected, setDaySelected] = useState(!!initialDay)
  const [timeSelected, setTimeSelected] = useState(false)
  const submitting = useRef(false)
  const [choice, setChoice] = useState('agreed')
  const [acct, setAcct] = useState('')
  const [acctNo, setAcctNo] = useState('')
  const [reference, setReference] = useState('Payment for ' + (jobTitle || 'the job'))
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!visible) return
    setStart(arrivalPickerSeed(initialDay))
    setDaySelected(!!initialDay)
    setTimeSelected(false)
    setChoice('agreed'); setAcct(''); setAcctNo('')
    setReference('Payment for ' + (jobTitle || 'the job')); setNote(''); setError('')
  }, [visible, initialDay, jobTitle])

  const arrival = daySelected && timeSelected ? arrivalPickerInstant(start) : null
  const isPast = arrival && arrival.getTime() <= Date.now()
  const paymentMessage = choice === 'bank_transfer' && acct.trim() && acctNo.trim()
    ? `Please pay by bank transfer.\nAccount name: ${acct || '—'}\nAccount number: ${acctNo || '—'}\nReference: ${reference || '—'}`
    : ''
  const noteText = note.trim()
  // Mirrors the message confirm_job posts, including how the day relates to
  // the one the requester asked for.
  const arrivalDay = nzCalendarDay(arrival)
  const dayNote = arrivalDayNote(job, arrivalDay)
  const preview = (arrival
    ? `Confirmed: I'll be there around ${formatWorkDateTime(arrival)}${dayNote.suffix}.`
    : 'Choose an arrival date and time to complete this preview.')
    + (dayNote.line ? `\n${dayNote.line}` : '')
    + `\n${paymentLine(amount, pricingType, choice)}`
    + (noteText ? `\nNote: ${noteText}` : '')
    + (paymentMessage ? `\n\n${paymentMessage}` : '')
  const blocked = !arrival || isPast || busy

  async function confirm() {
    if (blocked || submitting.current) return
    submitting.current = true
    setBusy(true); setError('')
    try {
      const { error: rpcError } = await supabase.rpc('confirm_job', {
        p_bid: bidId,
        p_arrival: arrival.toISOString(),
        p_method: choice,
        p_message: paymentMessage,
        p_note: noteText || null,
      })
      if (rpcError) {
        setError(rpcError.message === 'Choose an arrival time in the future and a finish time after it'
          ? 'That time has already passed. Pick a time later today or another day.'
          : (rpcError.message || 'Could not confirm. Pull to refresh and try again.'))
        return
      }
      onConfirmed?.({ arrival_start_at: arrival.toISOString(), arrival_end_at: new Date(arrival.getTime() + 30 * 60000).toISOString() })
    } catch (e) {
      setError(e?.message || 'Could not confirm. Pull to refresh and try again.')
    } finally {
      submitting.current = false
      setBusy(false)
    }
  }

  return (
    <FullScreenSheet
      visible={visible}
      title="Confirm the job"
      onClose={onClose}
      footer={<Button title="Confirm job" onPress={confirm} loading={busy} disabled={blocked} />}>
      <Text style={styles.section}>When will you arrive?</Text>
      <ArrivalWhen value={start} onChange={setStart} job={job} offerDay={availableFrom} resetKey={visible} daySelected={daySelected} onDaySelected={setDaySelected} timeSelected={timeSelected} onTimeSelected={setTimeSelected} />

      <Text style={styles.section}>Payment method (optional)</Text>
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
      <Text style={styles.fieldLabel2}>Note (optional)</Text>
      <TextInput
        style={[styles.input, styles.noteInput]}
        value={note}
        onChangeText={setNote}
        maxLength={500}
        multiline
        placeholder="e.g. about 3 hours, bring the gate key"
        placeholderTextColor={colors.textMuted}
        accessibilityLabel="Note (optional)"
      />
      {choice ? (
        <View style={styles.previewBox}>
          <Text style={styles.previewHead}>Message to {requesterFirst}</Text>
          <Text style={styles.previewText}>{preview}</Text>
        </View>
      ) : null}
      {!!error && <Text style={styles.error}>{error}</Text>}
    </FullScreenSheet>
  )
}

const styles = StyleSheet.create({
  section: { color: colors.textPrimary, fontSize: 15, fontWeight: '800', marginTop: 16, marginBottom: 8 },
  fieldLabel2: { color: colors.textSecondary, fontSize: 12, fontWeight: '700', marginBottom: 4, marginTop: 8 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: colors.textPrimary },
  noteInput: { minHeight: 64, textAlignVertical: 'top', marginBottom: 10 },
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
})
