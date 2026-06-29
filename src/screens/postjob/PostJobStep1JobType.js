import React, { useEffect, useState } from 'react'
import {
  Keyboard, KeyboardAvoidingView, Platform, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native'
import DateTimePicker from '@react-native-community/datetimepicker'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import PostJobHeader from './PostJobHeader'
import { usePostJob } from '../../context/PostJobContext'
import { colors } from '../../theme/tokens'
import Icon from '../../components/Icon'
import Button from '../../components/Button'

const SCHEDULE_OPTIONS = [
  { id: 'asap',     label: 'As soon as possible', icon: 'flash-outline' },
  { id: 'specific', label: 'On a specific date',   icon: 'calendar-outline' },
  { id: 'flexible', label: "I'm flexible",          icon: 'happy-outline' },
]

function formatDate(d) {
  return d.toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

export default function PostJobStep1JobType({ navigation, route }) {
  const insets = useSafeAreaInsets()
  const { jobData, updateJobData, resetJobData } = usePostJob()

  const isEditMode = route.params?.mode === 'edit'
  const editJob    = route.params?.job || null
  const prefill    = route.params?.prefill || null

  const [title,          setTitle]          = useState(editJob?.title           || jobData.title || prefill?.title || '')
  const [scheduleType,   setScheduleType]   = useState(editJob?.schedule_type   || jobData.scheduleType)
  const [scheduledDate,  setScheduledDate]  = useState(() => {
    if (editJob?.scheduled_date) return new Date(editJob.scheduled_date)
    if (jobData.scheduledDate)   return new Date(jobData.scheduledDate)
    return null
  })
  const [showDatePicker, setShowDatePicker] = useState(false)

  // Seed context from editJob on first entry into this edit session
  useEffect(() => {
    if (isEditMode && editJob && jobData._editJobId !== editJob.id) {
      updateJobData({
        category:     editJob.category        || '',
        title:        editJob.title           || '',
        scheduleType: editJob.schedule_type   || '',
        scheduledDate: editJob.scheduled_date || null,
        latitude:     editJob.latitude        || null,
        longitude:    editJob.longitude       || null,
        jobAddress:   editJob.location_name   || '',
        locationNote: editJob.location_note   || '',
        areaPolygon:  editJob.area_polygon    || [],
        areaHectares: editJob.area_hectares   || null,
        description:  editJob.description     || '',
        photos:       editJob.photos          || [],
        priceType:    editJob.price_type      || 'fixed',
        price:        editJob.price ? String(editJob.price) : '',
        _editJobId:   editJob.id,
      })
    } else if (!isEditMode && !jobData._editJobId) {
      // New job — clear any stale edit marker but keep draft data
      resetJobData()
    }
  }, [])

  // Keep context in sync with local state
  useEffect(() => {
    updateJobData({
      title,
      scheduleType,
      scheduledDate: scheduledDate ? scheduledDate.toISOString() : null,
    })
  }, [title, scheduleType, scheduledDate])

  function canProceed() {
    return !!(title.trim().length >= 3 && scheduleType)
  }

  function handleBack() {
    navigation.goBack()
  }

  function handleNext() {
    Keyboard.dismiss()
    if (!canProceed()) return
    navigation.navigate('PostJobStep2Location', { ...route.params })
  }

  return (
    <View style={styles.screen}>
      <PostJobHeader currentStep={1} onBack={handleBack} />

      <KeyboardAvoidingView
        style={styles.flex1}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
        enabled={Platform.OS === 'android'}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets={true}
          showsVerticalScrollIndicator={false}>

          <View style={styles.card}>
            <Text style={styles.cardQuestion}>Give the job a title</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Fix fence on north paddock"
              placeholderTextColor={colors.textMuted}
              value={title}
              onChangeText={setTitle}
              autoCapitalize="sentences"
              returnKeyType="done"
              onSubmitEditing={Keyboard.dismiss}
              accessibilityLabel="Job title"
            />
            {title.trim().length > 0 && title.trim().length < 3 && (
              <Text style={styles.hintText}>Keep going…</Text>
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardQuestion}>When do you need it done?</Text>
            <View style={styles.scheduleList}>
              {SCHEDULE_OPTIONS.map(opt => (
                <TouchableOpacity
                  key={opt.id}
                  style={[styles.scheduleTile, scheduleType === opt.id && styles.scheduleTileActive]}
                  onPress={() => setScheduleType(opt.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: scheduleType === opt.id }}>
                  <Icon name={opt.icon} size={18} color={colors.primary} />
                  <Text style={[styles.scheduleTileLabel, scheduleType === opt.id && styles.scheduleTileLabelActive]}>
                    {opt.label}
                  </Text>
                  <View style={[styles.radio, scheduleType === opt.id && styles.radioActive]}>
                    {scheduleType === opt.id && <View style={styles.radioDot} />}
                  </View>
                </TouchableOpacity>
              ))}
            </View>

            {scheduleType === 'specific' && (
              <>
                <TouchableOpacity
                  style={styles.datePicker}
                  onPress={() => setShowDatePicker(true)}
                  accessibilityRole="button">
                  <Text style={scheduledDate ? styles.datePickerValue : styles.datePickerPlaceholder}>
                    {scheduledDate ? formatDate(scheduledDate) : 'Select a date'}
                  </Text>
                  <Icon name="calendar-outline" size={18} color={colors.textMuted} />
                </TouchableOpacity>
                {showDatePicker && (
                  <>
                    {Platform.OS === 'ios' && (
                      <TouchableOpacity
                        style={styles.pickerDone}
                        onPress={() => setShowDatePicker(false)}>
                        <Text style={styles.pickerDoneText}>Done</Text>
                      </TouchableOpacity>
                    )}
                    <DateTimePicker
                      value={scheduledDate || new Date()}
                      mode="date"
                      minimumDate={new Date()}
                      onChange={(event, selected) => {
                        if (Platform.OS === 'android') setShowDatePicker(false)
                        if (event?.type !== 'dismissed' && selected) setScheduledDate(selected)
                      }}
                    />
                  </>
                )}
              </>
            )}
          </View>
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
          <Button
            title="Next — Location"
            icon="arrow-forward"
            onPress={handleNext}
            disabled={!canProceed()}
            accessibilityLabel="Next step"
          />
        </View>
      </KeyboardAvoidingView>
    </View>
  )
}

const styles = StyleSheet.create({
  screen:        { flex: 1, backgroundColor: '#f5f5f5' },
  flex1:         { flex: 1 },
  scroll:        { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 24 },

  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.primary,
    padding: 16,
    marginBottom: 12,
  },
  cardQuestion: { fontSize: 16, fontWeight: '700', color: '#222', marginBottom: 12 },

  input: {
    backgroundColor: '#f9f9f9',
    borderRadius: 10,
    padding: 14,
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    color: '#222',
  },
  hintText: { fontSize: 12, color: colors.textMuted, marginTop: 6 },

  chipGrid:       { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip:           { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: '#ddd', backgroundColor: '#f9f9f9' },
  chipActive:     { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  chipText:       { color: '#555', fontSize: 13, fontWeight: '500' },
  chipTextActive: { color: colors.primary, fontWeight: '700' },

  scheduleList:            { gap: 8 },
  scheduleTile:            { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f9f9f9', borderRadius: 12, padding: 14, borderWidth: 1.5, borderColor: '#ddd', gap: 12, minHeight: 52, marginTop: 4 },
  scheduleTileActive:      { borderColor: colors.primary, backgroundColor: '#f0faf5' },
  scheduleTileIcon:        { fontSize: 18 },
  scheduleTileLabel:       { flex: 1, fontSize: 15, fontWeight: '600', color: '#222' },
  scheduleTileLabelActive: { color: colors.primary },
  radio:                   { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#bbb', alignItems: 'center', justifyContent: 'center' },
  radioActive:             { borderColor: colors.primary },
  radioDot:                { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },

  datePicker:            { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#f9f9f9', borderRadius: 10, padding: 14, borderWidth: 1, borderColor: '#ddd', marginTop: 12, minHeight: 52 },
  datePickerValue:       { fontSize: 15, color: '#222', flex: 1 },
  datePickerPlaceholder: { fontSize: 15, color: colors.textMuted, flex: 1 },
  datePickerIcon:        { fontSize: 18, marginLeft: 8 },
  pickerDone:            { alignSelf: 'flex-end', paddingHorizontal: 16, paddingVertical: 8 },
  pickerDoneText:        { fontSize: 16, fontWeight: '600', color: colors.primary },

  footer: {
    backgroundColor: '#fff',
    borderTopWidth: 0.5,
    borderTopColor: '#e0e0e0',
    paddingTop: 12,
    paddingHorizontal: 16,
  },
})
