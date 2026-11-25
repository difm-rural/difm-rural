import React, {useState} from 'react'
import {Alert, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View} from 'react-native'
import {useSafeAreaInsets} from 'react-native-safe-area-context'
import {availabilityDraft, availabilityPatch, AVAILABILITY_MESSAGE_LIMIT, LEAD_TIME_OPTIONS, LISTING_AVAILABILITY_COLUMNS, LISTING_AVAILABILITY_STATUSES} from '../../shared/listingAvailability'
import {supabase} from '../lib/supabase'
import {colors} from '../theme/tokens'
import Button from './Button'

export default function ManageListingAvailability({listing, ownerId, onClose, onSaved}) {
  const insets = useSafeAreaInsets()
  const [draft, setDraft] = useState(() => availabilityDraft(listing))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (key, value) => setDraft(current => ({...current, [key]: value}))

  async function save() {
    if (saving) return
    setError('')
    setSaving(true)
    try {
      const patch = availabilityPatch(draft, listing)
      const {data, error: saveError} = await supabase.from('services').update(patch)
        .eq('id', listing.id).eq('provider_id', ownerId).select(LISTING_AVAILABILITY_COLUMNS).single()
      if (saveError) throw saveError
      onSaved(data)
      Alert.alert('Availability saved')
    } catch (err) {
      setError(err.message || 'Could not save availability. Try again.')
    } finally {
      setSaving(false)
    }
  }

  function choices(field, options) {
    return <View style={styles.choices}>{Object.entries(options).map(([value, label]) => (
      <TouchableOpacity key={value} style={[styles.option, draft[field] === value && styles.optionSelected]}
        accessibilityRole="radio" accessibilityState={{checked: draft[field] === value, disabled: saving}}
        disabled={saving} onPress={() => set(field, value)}>
        <Text style={styles.optionLabel}>{label}</Text>
      </TouchableOpacity>
    ))}</View>
  }

  function input(field, label, props = {}) {
    return <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput style={styles.input} accessibilityLabel={label} value={draft[field]} editable={!saving}
        onChangeText={value => set(field, value)} {...props} />
    </View>
  }

  return <Modal animationType="slide" transparent visible onRequestClose={saving ? undefined : onClose}>
    <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[styles.sheet, {paddingBottom: Math.max(16, insets.bottom)}]}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
          <Text style={styles.heading} accessibilityRole="header">Manage availability</Text>
          <Text>{listing.title}</Text>
          <Text style={styles.label}>Availability</Text>
          {choices('status', LISTING_AVAILABILITY_STATUSES)}
          {draft.status === 'paused' && <Text style={styles.hint}>The listing stays visible. Existing requests and enquiries can continue.</Text>}
          <Text style={styles.label}>Estimated lead time</Text>
          {choices('type', LEAD_TIME_OPTIONS)}
          {draft.type === 'fixed_days' && input('min', 'Number of days', {keyboardType: 'number-pad'})}
          {draft.type === 'range_days' && <View style={styles.choices}>
            {input('min', 'Minimum days', {keyboardType: 'number-pad'})}
            {input('max', 'Maximum days', {keyboardType: 'number-pad'})}
          </View>}
          {draft.type === 'earliest_date' && input('date', 'Earliest date (YYYY-MM-DD)', {placeholder: 'YYYY-MM-DD', maxLength: 10})}
          {input('message', 'Public message (optional)', {multiline: true, maxLength: AVAILABILITY_MESSAGE_LIMIT})}
          <Text style={styles.hint}>{Array.from(draft.message).length} / {AVAILABILITY_MESSAGE_LIMIT}</Text>
          {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        </ScrollView>
        <View style={styles.actions}>
          <Button title="Cancel" variant="secondary" disabled={saving} onPress={onClose} style={styles.field} />
          <Button title={saving ? 'Saving availability' : 'Save availability'} loading={saving} onPress={save} style={styles.field} />
        </View>
      </View>
    </KeyboardAvoidingView>
  </Modal>
}

const styles = StyleSheet.create({
  overlay: {flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)'},
  sheet: {backgroundColor: colors.white, maxHeight: '90%', borderTopLeftRadius: 16, borderTopRightRadius: 16},
  content: {padding: 16, gap: 8},
  heading: {fontSize: 21, fontWeight: '700', color: colors.textPrimary},
  label: {fontWeight: '700', color: colors.textPrimary, marginTop: 4},
  choices: {flexDirection: 'row', flexWrap: 'wrap', gap: 6},
  option: {borderWidth: 1, borderColor: colors.border, borderRadius: 8, minHeight: 44, justifyContent: 'center', paddingHorizontal: 10},
  optionSelected: {backgroundColor: colors.primaryLight, borderColor: colors.primary},
  optionLabel: {color: colors.textPrimary, fontWeight: '600'},
  field: {flex: 1},
  input: {borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 10, minHeight: 44, color: colors.textPrimary},
  hint: {color: colors.textSecondary, fontSize: 13},
  error: {color: colors.danger},
  actions: {flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 8},
})
