import React, { useEffect, useState } from 'react'
import {
  Keyboard, KeyboardAvoidingView, Platform, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native'
import DateTimePicker from '@react-native-community/datetimepicker'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import PostJobHeader from './PostJobHeader'
import { usePostJob } from '../../context/PostJobContext'
import { draftToJobData } from '../../lib/draftJob'
import { isHouseSitting } from '../../lib/categories'
import { colors } from '../../theme/tokens'
import Icon from '../../components/Icon'
import Button from '../../components/Button'

const SCHEDULE_OPTIONS = [
  { id: 'asap',     label: 'As soon as possible',     icon: 'flash-outline' },
  { id: 'specific', label: 'On a specific date',       icon: 'calendar-outline' },
  { id: 'range',    label: 'Over a period (from–to)',  icon: 'calendar-number-outline' },
  { id: 'flexible', label: "I'm flexible",             icon: 'happy-outline' },
]

function formatDate(d) {
  return d.toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

function formatShort(d) {
  return d ? d.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' }) : ''
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
  const [dateFrom,       setDateFrom]       = useState(() => {
    if (editJob?.date_from) return new Date(editJob.date_from)
    if (jobData.dateFrom)   return new Date(jobData.dateFrom)
    return null
  })
  const [dateTo,         setDateTo]         = useState(() => {
    if (editJob?.date_to) return new Date(editJob.date_to)
    if (jobData.dateTo)   return new Date(jobData.dateTo)
    return null
  })
  const [showFromPicker, setShowFromPicker] = useState(false)
  const [showToPicker,   setShowToPicker]   = useState(false)

  // Seed context from editJob on first entry into this edit session
  useEffect(() => {
    if (isEditMode && editJob && jobData._editJobId !== editJob.id) {
      updateJobData({
        category:     editJob.category        || '',
        title:        editJob.title           || '',
        scheduleType: editJob.schedule_type   || '',
        scheduledDate: editJob.scheduled_date || null,
        dateFrom:     editJob.date_from        || null,
        dateTo:       editJob.date_to          || null,
        hideExactLocation: editJob.hide_exact_location || false,
        locationArea:      editJob.location_area || '',
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
    } else if (!isEditMode) {
      // New job — start clean. Clear both context AND local field state, since a
      // still-mounted Step 1 would otherwise re-sync stale values into context.
      resetJobData()
      setTitle(prefill?.title || '')
      setScheduleType('')
      setScheduledDate(null)
      setDateFrom(null)
      setDateTo(null)
    }
  }, [])

  // Seed everything from an AI assistant draft. The assistant lands here so the
  // user sees the generated title first, then taps through the pre-filled steps.
  useEffect(() => {
    const seed = route.params?.aiSeed
    if (!seed || isEditMode) return
    const mapped = draftToJobData(seed)
    updateJobData(mapped)
    setTitle(mapped.title || '')
    setScheduleType(mapped.scheduleType || '')
    setScheduledDate(mapped.scheduledDate ? new Date(mapped.scheduledDate) : null)
    navigation.setParams({ aiSeed: undefined })
  }, [route.params?.aiSeed])

  // Seed a direct-offer target (from a Connection) after the reset above, so it
  // survives into the review step where the invite is created.
  useEffect(() => {
    if (!isEditMode && route.params?.inviteProviderId) {
      updateJobData({
        inviteProviderId:   route.params.inviteProviderId,
        inviteProviderName: route.params.inviteProviderName || null,
      })
    }
  }, [])

  // Keep context in sync with local state
  useEffect(() => {
    updateJobData({
      title,
      scheduleType,
      scheduledDate: scheduledDate ? scheduledDate.toISOString() : null,
      dateFrom: dateFrom ? dateFrom.toISOString() : null,
      dateTo:   dateTo   ? dateTo.toISOString()   : null,
    })
  }, [title, scheduleType, scheduledDate, dateFrom, dateTo])

  function canProceed() {
    if (title.trim().length < 3 || !scheduleType) return false
    if (scheduleType === 'range') return !!(dateFrom && dateTo)
    return true
  }

  const rangeDays = scheduleType === 'range' && dateFrom && dateTo
    ? Math.max(0, Math.round((dateTo - dateFrom) / 86400000))
    : null

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
              {SCHEDULE_OPTIONS.filter(opt => opt.id !== 'range' || isHouseSitting(title)).map(opt => (
                <React.Fragment key={opt.id}>
                  <TouchableOpacity
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

                  {opt.id === 'specific' && scheduleType === 'specific' && (
                    <View style={styles.scheduleSub}>
                      <TouchableOpacity style={styles.datePicker} onPress={() => setShowDatePicker(true)} accessibilityRole="button">
                        <Text style={scheduledDate ? styles.datePickerValue : styles.datePickerPlaceholder}>
                          {scheduledDate ? formatDate(scheduledDate) : 'Select a date'}
                        </Text>
                        <Icon name="calendar-outline" size={18} color={colors.textMuted} />
                      </TouchableOpacity>
                      {showDatePicker && (
                        <>
                          {Platform.OS === 'ios' && (
                            <TouchableOpacity style={styles.pickerDone} onPress={() => setShowDatePicker(false)}>
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
                    </View>
                  )}

                  {opt.id === 'range' && scheduleType === 'range' && (
                    <View style={styles.scheduleSub}>
                      <View style={styles.rangeRow}>
                        <View style={styles.rangeCol}>
                          <Text style={styles.rangeLabel}>From</Text>
                          <TouchableOpacity style={styles.datePicker} onPress={() => setShowFromPicker(true)} accessibilityRole="button">
                            <Text style={dateFrom ? styles.datePickerValue : styles.datePickerPlaceholder}>
                              {dateFrom ? formatDate(dateFrom) : 'Start date'}
                            </Text>
                            <Icon name="calendar-outline" size={18} color={colors.textMuted} />
                          </TouchableOpacity>
                        </View>
                        <View style={styles.rangeCol}>
                          <Text style={styles.rangeLabel}>To</Text>
                          <TouchableOpacity style={styles.datePicker} onPress={() => setShowToPicker(true)} accessibilityRole="button">
                            <Text style={dateTo ? styles.datePickerValue : styles.datePickerPlaceholder}>
                              {dateTo ? formatDate(dateTo) : 'End date'}
                            </Text>
                            <Icon name="calendar-outline" size={18} color={colors.textMuted} />
                          </TouchableOpacity>
                        </View>
                      </View>
                      {rangeDays != null && (
                        <Text style={styles.rangeDaysText}>
                          <Icon name="moon-outline" size={13} color={colors.primary} /> {rangeDays} {rangeDays === 1 ? 'night' : 'nights'} · {formatShort(dateFrom)} – {formatShort(dateTo)}
                        </Text>
                      )}
                      {showFromPicker && (
                        <>
                          {Platform.OS === 'ios' && (
                            <TouchableOpacity style={styles.pickerDone} onPress={() => setShowFromPicker(false)}>
                              <Text style={styles.pickerDoneText}>Done</Text>
                            </TouchableOpacity>
                          )}
                          <DateTimePicker
                            value={dateFrom || new Date()}
                            mode="date"
                            minimumDate={new Date()}
                            onChange={(event, selected) => {
                              if (Platform.OS === 'android') setShowFromPicker(false)
                              if (event?.type !== 'dismissed' && selected) {
                                setDateFrom(selected)
                                if (dateTo && selected > dateTo) setDateTo(null)
                              }
                            }}
                          />
                        </>
                      )}
                      {showToPicker && (
                        <>
                          {Platform.OS === 'ios' && (
                            <TouchableOpacity style={styles.pickerDone} onPress={() => setShowToPicker(false)}>
                              <Text style={styles.pickerDoneText}>Done</Text>
                            </TouchableOpacity>
                          )}
                          <DateTimePicker
                            value={dateTo || dateFrom || new Date()}
                            mode="date"
                            minimumDate={dateFrom || new Date()}
                            onChange={(event, selected) => {
                              if (Platform.OS === 'android') setShowToPicker(false)
                              if (event?.type !== 'dismissed' && selected) setDateTo(selected)
                            }}
                          />
                        </>
                      )}
                    </View>
                  )}
                </React.Fragment>
              ))}
            </View>

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
  scheduleSub:   { marginTop: 4, marginBottom: 4 },
  rangeRow:   { flexDirection: 'row', gap: 10, marginTop: 4 },
  rangeCol:   { flex: 1 },
  rangeLabel: { fontSize: 12, color: '#666', marginBottom: 6, marginLeft: 2 },
  rangeDaysText: { fontSize: 13, fontWeight: '700', color: colors.primary, marginTop: 8, marginLeft: 2 },
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
