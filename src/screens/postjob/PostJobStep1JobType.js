import {formatWorkDate as nzDate} from '../../../shared/formatting.js'
import {POSTING_TITLE_MAX,POSTING_DESCRIPTION_MAX,postingTextError} from '../../../shared/postingText'
import {editorScheduleType,jobScheduleError,nzCalendarDay,nzToday} from '../../../shared/postingDates'
import React, { useEffect, useRef, useState } from 'react'
import {
  Keyboard, KeyboardAvoidingView, Platform, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native'
import {toLocalIsoDate} from '../../../shared/dates'
import {localDate} from '../../lib/quickPickDates'
import DateChips from '../../components/DateChips'
import NativeDateTimePicker, { openDateTimePicker } from '../../components/NativeDateTimePicker'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import AiJobAssistant, { JobAiChoice } from '../../components/AiJobAssistant'
import JobPrimaryPhotoDraft from '../../components/JobPrimaryPhotoDraft'
import { photoToJobEnabled } from '../../lib/jobPrimaryPhoto'
import { fillJobDraftFields } from '../../../shared/jobSuggestion'
import { jobEditSeed } from '../../../shared/jobEdit'
import PostJobHeader from './PostJobHeader'
import { usePostJob } from '../../context/PostJobContext'
import { draftToJobData } from '../../lib/draftJob'
import { repeatJobToJobData } from '../../lib/repeatJob'
import { isHouseSitting } from '../../lib/categories'
import { CATEGORIES } from '../../../shared/categories'
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
  return nzDate(toLocalIsoDate(d))
}

function formatShort(d) {
  return d ? formatDate(d) : ''
}

export default function PostJobStep1JobType({ navigation, route }) {
  const insets = useSafeAreaInsets()
  const { jobData, updateJobData, resetJobData, startJobBaseline } = usePostJob()

  const isEditMode = route.params?.mode === 'edit'
  const editJob    = route.params?.job || null
  const prefill    = route.params?.prefill || null
  const repeatJob  = route.params?.repeatJob || null
  const isRepeatMode = route.params?.mode === 'repeat' && !!repeatJob

  const [title,          setTitle]          = useState(editJob?.title           || jobData.title || prefill?.title || '')
  const [scheduleType,   setScheduleType]   = useState(editJob ? editorScheduleType(editJob) : jobData.scheduleType)
  const [scheduledDate,  setScheduledDate]  = useState(() => {
    if (editJob?.scheduled_date) return localDate(nzCalendarDay(editJob.scheduled_date))
    if (jobData.scheduledDate)   return localDate(nzCalendarDay(jobData.scheduledDate))
    return null
  })
  const [dateFrom,       setDateFrom]       = useState(() => {
    if (editJob?.date_from) return localDate(nzCalendarDay(editJob.date_from))
    if (jobData.dateFrom)   return localDate(nzCalendarDay(jobData.dateFrom))
    return null
  })
  const [dateTo,         setDateTo]         = useState(() => {
    if (editJob?.date_to) return localDate(nzCalendarDay(editJob.date_to))
    if (jobData.dateTo)   return localDate(nzCalendarDay(jobData.dateTo))
    return null
  })
  // Which date is being picked: 'date' | 'from' | 'to'. Uses the same picker as
  // the rest of the app (a dialog on Android, an inline spinner with Done on iOS).
  const [picker, setPicker] = useState(null)
  const [aiExpanded, setAiExpanded] = useState(false)
  // Words typed to the AI helper but not used yet also count as entered.
  const [assistantText, setAssistantText] = useState(false)
  const [photoExpanded, setPhotoExpanded] = useState(false)
  const scroll = useRef(null)
  const viewport = useRef(null)
  const photoPanel = useRef(null)
  const scrollY = useRef(0)
  const revealPhoto = useRef(false)
  const canUsePhoto = photoToJobEnabled && route.name !== 'GuestPostJob' && !jobData.photos?.length

  function showPhotoControls() {
    if (!revealPhoto.current || !photoExpanded || !aiExpanded) return
    revealPhoto.current=false
    viewport.current?.measureInWindow((_x, top, _width, height) => {
      photoPanel.current?.measureInWindow((_x, panelTop, _width, panelHeight) => {
        const bottom=top+height-16
        const hiddenHeight=panelTop+Math.min(panelHeight,150)-bottom
        if (hiddenHeight>0) scroll.current?.scrollTo({y:scrollY.current+hiddenHeight,animated:true})
      })
    })
  }

  function pickerOptions(which) {
    const today = localDate(nzToday())
    if (which === 'from') {
      return {
        value: dateFrom || today, mode: 'date', minimumDate: today,
        onSelect: selected => { setDateFrom(selected); if (dateTo && selected > dateTo) setDateTo(null) },
      }
    }
    if (which === 'to') return { value: dateTo || dateFrom || today, mode: 'date', minimumDate: dateFrom || today, onSelect: setDateTo }
    return { value: scheduledDate || today, mode: 'date', minimumDate: today, onSelect: setScheduledDate }
  }

  function openPicker(which) {
    openDateTimePicker({ ...pickerOptions(which), onShow: () => setPicker(which) })
  }

  // Seed context from editJob whenever this edit opens. Each branch also records
  // what it opened with, so Cancel only asks when something has changed.
  useEffect(() => {
    if (isEditMode && editJob) {
      const seeded = jobEditSeed(editJob)
      resetJobData()
      updateJobData(seeded)
      startJobBaseline(seeded)
    } else if (isRepeatMode) {
      resetJobData()
      const mapped = repeatJobToJobData(repeatJob)
      updateJobData(mapped)
      startJobBaseline(mapped)
      setTitle(mapped.title)
      setScheduleType(mapped.scheduleType)
      setScheduledDate(null)
      setDateFrom(null)
      setDateTo(null)
    } else if (!isEditMode) {
      // New job — start clean. Clear both context AND local field state, since a
      // still-mounted Step 1 would otherwise re-sync stale values into context.
      resetJobData()
      startJobBaseline({ title: prefill?.title || '', category: CATEGORIES.includes(prefill?.category) ? prefill.category : '' })
      setTitle(prefill?.title || '')
      if(CATEGORIES.includes(prefill?.category))updateJobData({category:prefill.category})
      if(prefill?.service)updateJobData({propertyService:String(prefill.service).slice(0,80),propertyServiceCategory:prefill.category||''})
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
    setScheduledDate(mapped.scheduledDate ? localDate(nzCalendarDay(mapped.scheduledDate)) : null)
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
      scheduledDate: toLocalIsoDate(scheduledDate),
      dateFrom: toLocalIsoDate(dateFrom),
      dateTo:   toLocalIsoDate(dateTo),
    })
  }, [title, scheduleType, scheduledDate, dateFrom, dateTo])

  const scheduleError=jobScheduleError({schedule_type:scheduleType,scheduled_date:toLocalIsoDate(scheduledDate),date_from:toLocalIsoDate(dateFrom),date_to:toLocalIsoDate(dateTo)},isRepeatMode?null:editJob)

  const [attempted,setAttempted]=useState(false)
  function canProceed() {
    if (scheduleError || postingTextError(title,'title')) return false
    if (title.trim().length < 3 || !scheduleType) return false
    if (scheduleType === 'specific') return !!scheduledDate
    if (scheduleType === 'range') return !!(dateFrom && dateTo)
    return true
  }

  const rangeDays = scheduleType === 'range' && dateFrom && dateTo
    ? Math.max(0, Math.round((dateTo - dateFrom) / 86400000))
    : null

  const [suggestionFeedback, setSuggestionFeedback] = useState('')
  function applySuggestion(suggestion) {
    const result=fillJobDraftFields({title,description:jobData.description || '',category:jobData.category || ''},suggestion)
    if (!result) return false
    setTitle(result.fields.title)
    updateJobData(result.fields)
    setSuggestionFeedback(result.changed?'Suggestion applied. Review and edit the details as needed.':'Your existing job details were kept.')
    return true
  }

  function handleNext() {
    Keyboard.dismiss()
    setAttempted(true)
    if (!canProceed()) return
    navigation.navigate('PostJobStep2Location', { ...route.params })
  }

  return (
    <View style={styles.screen}>
      <PostJobHeader currentStep={1} title={isRepeatMode ? 'Repeat a job' : undefined} extraChanges={assistantText} />

      <KeyboardAvoidingView
        style={styles.flex1}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
        enabled={Platform.OS === 'android'}>
        <View ref={viewport} collapsable={false} style={styles.flex1}>
        <ScrollView ref={scroll}
          style={styles.scroll}
          onScroll={event=>{scrollY.current=event.nativeEvent.contentOffset.y}}
          scrollEventThrottle={16}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets={true}
          showsVerticalScrollIndicator={false}>
          {!!scheduleType && !!scheduleError && <Text accessibilityRole="alert" style={{ color: colors.danger, marginBottom: 12 }}>{scheduleError}</Text>}

          <View style={styles.card}>
            <Text accessibilityRole="header" style={styles.heading}>What do you need done?</Text>
            <TextInput
              style={[styles.input, attempted && (title.trim().length < 3 || !!postingTextError(title,'title')) && { borderColor: colors.danger, borderWidth: 2 }]}
              placeholder="e.g. Fix fence on north paddock"
              placeholderTextColor={colors.textMuted}
              maxLength={POSTING_TITLE_MAX}
              value={title}
              onChangeText={setTitle}
              autoCapitalize="sentences"
              returnKeyType="done"
              onSubmitEditing={Keyboard.dismiss}
              accessibilityLabel="Job title"
            />
            <Text style={styles.hintText}>{title.length} / {POSTING_TITLE_MAX} characters</Text>
            {!!postingTextError(title,'title') && <Text accessibilityRole="alert" style={{color:colors.danger}}>{postingTextError(title,'title')}</Text>}
            {attempted && title.trim().length < 3 && <Text accessibilityRole="alert" style={{color:colors.danger}}>Enter a job title with at least 3 characters.</Text>}
            {title.trim().length > 0 && title.trim().length < 3 && (
              <Text style={styles.hintText}>Keep going…</Text>
            )}
          </View>

          {!!suggestionFeedback&&<Text accessibilityLiveRegion="polite" style={styles.hintText}>{suggestionFeedback}</Text>}
          {!isEditMode && !isRepeatMode && <View style={styles.aiHelper}>
            <TouchableOpacity style={styles.aiToggle} onPress={() => setAiExpanded(value => !value)}
              accessibilityRole="button" accessibilityState={{expanded:aiExpanded}}>
              <Icon name="sparkles-outline" size={20} color={colors.primary} />
              <View style={styles.flex1}>
                <Text style={styles.aiTitle}>Use AI to help create my job</Text>
                <Text style={styles.aiHint}>{canUsePhoto ? 'Use a photo, speak or describe what you need.' : 'Speak or describe what you need.'}</Text>
              </View>
              <Icon name={aiExpanded?'chevron-up':'chevron-down'} size={18} color={colors.primary} />
            </TouchableOpacity>
            <View style={aiExpanded ? styles.aiChoices : styles.hidden}>
              {canUsePhoto && <>
                <JobAiChoice label="Use a photo" description="Take or choose a photo and add a few words if you like."
                  icon="camera-outline" expanded={photoExpanded} hint={jobData.primaryPhoto ? 'Photo selected' : undefined}
                  onPress={() => {revealPhoto.current=!photoExpanded;setPhotoExpanded(!photoExpanded)}} />
                <View ref={photoPanel} collapsable={false} onLayout={showPhotoControls}
                  style={photoExpanded ? styles.photoPanel : styles.hidden}>
                  <JobPrimaryPhotoDraft photo={jobData.primaryPhoto} required={jobData.primaryPhotoRequired}
                    onPhoto={primaryPhoto=>updateJobData({primaryPhoto,primaryPhotoRequired:true})}
                    onManual={()=>updateJobData({primaryPhoto:null,primaryPhotoRequired:false})}
                    onSuggestion={applySuggestion}/>
                </View>
              </>}
              <AiJobAssistant onDraftChange={setAssistantText} onUse={draft=>{
                const suggestion=draftToJobData(draft)
                if (!applySuggestion(suggestion)) return false
                if (!scheduleType) {
                  setScheduleType(suggestion.scheduleType)
                  setScheduledDate(suggestion.scheduledDate ? localDate(suggestion.scheduledDate) : null)
                }
                if (!jobData.price) updateJobData({price:suggestion.price,priceType:suggestion.priceType})
                return true
              }}/>
            </View>
          </View>}

          <View style={styles.card}>
            <Text style={styles.cardQuestion}>When do you need it done?</Text>
            {attempted && !scheduleType && <Text accessibilityRole="alert" style={{color:colors.danger}}>Choose when you need the job done.</Text>}
            <View style={styles.scheduleList}>
              {SCHEDULE_OPTIONS.filter(opt => opt.id !== 'range' || isHouseSitting(title) || scheduleType==='range').map(opt => (
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
                      <DateChips value={scheduledDate} now={localDate(nzToday())} wrap onSelect={setScheduledDate} onOpen={() => openPicker('date')} />
                      <TouchableOpacity style={styles.datePicker} onPress={() => openPicker('date')} accessibilityRole="button"
                        accessibilityLabel={scheduledDate ? `Date: ${formatDate(scheduledDate)}. Change` : 'Select a date'}>
                        <Text style={scheduledDate ? styles.datePickerValue : styles.datePickerPlaceholder}>
                          {scheduledDate ? formatDate(scheduledDate) : 'Select a date'}
                        </Text>
                        <Icon name="calendar-outline" size={18} color={colors.textMuted} />
                      </TouchableOpacity>
                      {picker === 'date' && <NativeDateTimePicker visible {...pickerOptions('date')} onDone={() => setPicker(null)} />}
                    </View>
                  )}

                  {opt.id === 'range' && scheduleType === 'range' && (
                    <View style={styles.scheduleSub}>
                      <View style={styles.rangeRow}>
                        <View style={styles.rangeCol}>
                          <Text style={styles.rangeLabel}>From</Text>
                          <TouchableOpacity style={styles.datePicker} onPress={() => openPicker('from')} accessibilityRole="button">
                            <Text style={dateFrom ? styles.datePickerValue : styles.datePickerPlaceholder}>
                              {dateFrom ? formatDate(dateFrom) : 'Start date'}
                            </Text>
                            <Icon name="calendar-outline" size={18} color={colors.textMuted} />
                          </TouchableOpacity>
                        </View>
                        <View style={styles.rangeCol}>
                          <Text style={styles.rangeLabel}>To</Text>
                          <TouchableOpacity style={styles.datePicker} onPress={() => openPicker('to')} accessibilityRole="button">
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
                      {(picker === 'from' || picker === 'to') && (
                        <NativeDateTimePicker visible {...pickerOptions(picker)} onDone={() => setPicker(null)} />
                      )}
                    </View>
                  )}
                </React.Fragment>
              ))}
            </View>

          </View>
        </ScrollView>
        </View>

        <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
          <Button
            title="Next — Location"
            icon="arrow-forward"
            onPress={handleNext}

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
  scrollContent: { padding: 16, paddingBottom: 36 },

  card: { marginBottom: 18 },
  heading: { fontSize: 24, fontWeight: '700', color: colors.textPrimary, marginBottom: 14 },
  aiHelper: { backgroundColor: colors.primaryLight, borderRadius: 12, marginBottom: 24 },
  aiToggle: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  aiTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: '700' },
  aiHint: { color: colors.textSecondary, fontSize: 13, lineHeight:18, marginTop: 3 },
  aiChoices: { paddingHorizontal: 14, paddingBottom: 14, gap: 6 },
  photoPanel: { paddingHorizontal: 8 },
  hidden: { display: 'none' },
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
  scheduleTile:            { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 8, padding: 12, gap: 12, minHeight: 48 },
  scheduleTileActive:      { backgroundColor: colors.primaryLight },
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
