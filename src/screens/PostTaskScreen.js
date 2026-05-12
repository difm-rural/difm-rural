import React, { useEffect, useRef, useState } from 'react'
import {
  Animated, Alert, Dimensions, Image, KeyboardAvoidingView, Modal, Platform,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import * as ImagePicker from 'expo-image-picker'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '../lib/supabase'
import { colors } from '../theme/tokens'
import { trackEvent } from '../lib/analytics'
import { trackCategoryInterest } from '../lib/preferences'

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window')

const CATEGORIES = ['Fencing', 'Maintenance', 'Property Check', 'Landscaping', 'Animal Care', 'Machinery', 'General Labour', 'Other']
const STEP_LABELS = ['Task name', 'Schedule', 'Details', 'Budget', 'Review']

const SCHEDULE_OPTIONS = [
  { id: 'specific', label: 'On a specific date', icon: '📅' },
  { id: 'before',   label: 'Before a certain date', icon: '⏳' },
  { id: 'flexible', label: "I'm flexible", icon: '🤙' },
]

const BUDGET_OPTIONS = [
  { id: 'fixed', icon: '💰', label: 'Fixed price' },
  { id: 'open',  icon: '📊', label: 'Open to bids' },
]

// Bottom sheet that slides up with spring + fade backdrop
function AuthSheet({ onDismiss, onLogin, onRegister }) {
  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current
  const backdropOpacity = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.parallel([
      Animated.spring(translateY, { toValue: 0, damping: 20, stiffness: 200, useNativeDriver: true }),
      Animated.timing(backdropOpacity, { toValue: 0.5, duration: 300, useNativeDriver: true }),
    ]).start()
  }, [])

  function dismiss() {
    Animated.parallel([
      Animated.timing(translateY, { toValue: SCREEN_HEIGHT, duration: 250, useNativeDriver: true }),
      Animated.timing(backdropOpacity, { toValue: 0, duration: 250, useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (finished) onDismiss()
    })
  }

  return (
    <View style={StyleSheet.absoluteFill}>
      <Animated.View style={[styles.modalBackdrop, { opacity: backdropOpacity }]} />
      <TouchableOpacity
        style={StyleSheet.absoluteFill}
        activeOpacity={1}
        onPress={dismiss}
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
      />
      <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
        <Text style={styles.sheetTitle}>Almost there!</Text>
        <Text style={styles.sheetMessage}>
          Create a free account to post your task. Your task details have been saved.
        </Text>
        <TouchableOpacity
          style={styles.sheetPrimary}
          onPress={() => { dismiss(); setTimeout(onRegister, 280) }}
          accessibilityRole="button"
          accessibilityLabel="Create account">
          <Text style={styles.sheetPrimaryText}>Create account</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.sheetSecondary}
          onPress={() => { dismiss(); setTimeout(onLogin, 280) }}
          accessibilityRole="button"
          accessibilityLabel="Sign in to existing account">
          <Text style={styles.sheetSecondaryText}>I already have an account</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  )
}

export default function PostTaskScreen({ navigation, route }) {
  // ─── Edit mode detection ───────────────────────────────────────
  const isEditMode = route?.params?.mode === 'edit'
  const editJob    = route?.params?.job    || null
  const editBidCount = route?.params?.bidCount || 0

  const [step, setStep] = useState(1)

  // Step 1
  const [title, setTitle]             = useState('')
  const [category, setCategory]       = useState('')
  const [locationName, setLocationName] = useState('')

  // Step 2
  const [scheduleType, setScheduleType] = useState('')
  const [date, setDate]               = useState('')
  const [time, setTime]               = useState('')

  // Step 3
  const [description, setDescription] = useState('')
  const [photos, setPhotos]           = useState([])

  // Step 4
  const [priceType, setPriceType]     = useState('')
  const [price, setPrice]             = useState('')

  // UI state
  const [uploadStatus, setUploadStatus] = useState('')
  const [showAuthSheet, setShowAuthSheet] = useState(false)

  // Edit mode: original values for change tracking
  const [original, setOriginal] = useState(null)

  // Step slide animation
  const stepTranslateX = useRef(new Animated.Value(0)).current

  // Refs for form chaining
  const locationRef = useRef(null)
  const timeRef     = useRef(null)

  // ─── Pre-fill: guest flow (prefill) or edit mode ───────────────
  useEffect(() => {
    const prefill = route?.params?.prefill
    if (prefill) {
      setTitle(prefill.title || '')
      setCategory(prefill.category || '')
      setLocationName(prefill.locationName || '')
      setDescription(prefill.description || '')
      setPriceType(prefill.priceType || '')
      setPrice(prefill.price ? String(prefill.price) : '')
      setScheduleType('')
      setDate('')
      setTime('')
      setPhotos([])
      setStep(1)
      return
    }

    if (!isEditMode || !editJob) return

    // Block editing tasks where a provider is confirmed or task is done
    if (['accepted', 'in_progress'].includes(editJob.status)) {
      Alert.alert(
        'Cannot edit task',
        'This task cannot be edited as a provider has already been confirmed.',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      )
      return
    }
    if (['completed', 'cancelled'].includes(editJob.status)) {
      Alert.alert(
        'Cannot edit task',
        'This task cannot be edited.',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      )
      return
    }

    const orig = {
      title:        editJob.title          || '',
      category:     editJob.category       || '',
      locationName: editJob.location_name  || '',
      scheduleType: editJob.schedule_type  || 'flexible',
      date:         editJob.scheduled_date || '',
      description:  editJob.description    || '',
      priceType:    editJob.price_type     || '',
      price:        editJob.price?.toString() || '',
      photos:       editJob.photos         || [],
    }

    setTitle(orig.title)
    setCategory(orig.category)
    setLocationName(orig.locationName)
    setScheduleType(orig.scheduleType)
    setDate(orig.date)
    setDescription(orig.description)
    setPriceType(orig.priceType)
    setPrice(orig.price)
    setPhotos(orig.photos)
    setOriginal(orig)
  }, [route?.params?.prefill, route?.params?.job?.id])

  // ─── Detect unsaved changes ────────────────────────────────────
  const hasChanges = isEditMode && original !== null && (
    title        !== original.title        ||
    category     !== original.category     ||
    locationName !== original.locationName ||
    scheduleType !== original.scheduleType ||
    date         !== original.date         ||
    description  !== original.description  ||
    priceType    !== original.priceType    ||
    price        !== original.price        ||
    photos.length !== original.photos.length ||
    photos.some((p, i) => p !== original.photos[i])
  )

  const stepContentStyle = { transform: [{ translateX: stepTranslateX }] }

  function animateStep(newStep, direction) {
    const outTo  = direction === 'forward' ? -SCREEN_WIDTH : SCREEN_WIDTH
    const inFrom = direction === 'forward' ?  SCREEN_WIDTH : -SCREEN_WIDTH

    Animated.timing(stepTranslateX, { toValue: outTo, duration: 200, useNativeDriver: true }).start(({ finished }) => {
      if (finished) {
        setStep(newStep)
        stepTranslateX.setValue(inFrom)
        Animated.timing(stepTranslateX, { toValue: 0, duration: 200, useNativeDriver: true }).start()
      }
    })
  }

  function canProceed() {
    switch (step) {
      case 1: return !!(title.trim() && category && locationName.trim())
      case 2: return !!scheduleType
      case 3: return !!description.trim()
      case 4: return !!(priceType && (priceType === 'open' || price.trim()))
      default: return true
    }
  }

  async function handleNext() {
    if (step < 5) {
      animateStep(step + 1, 'forward')
      return
    }
    if (isEditMode) {
      await saveJobChanges()
      return
    }
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      await AsyncStorage.setItem('pendingJob', JSON.stringify({
        title,
        description,
        category,
        price_type: priceType,
        price: priceType === 'fixed' ? parseFloat(price) : null,
        location_name: locationName,
      }))
      setShowAuthSheet(true)
      return
    }
    await postJobDirectly(user.id)
  }

  function handleBack() {
    animateStep(step - 1, 'backward')
  }

  async function postJobDirectly(userId) {
    setUploadStatus('Posting...')

    const { data: jobData, error: insertError } = await supabase
      .from('jobs')
      .insert({
        requester_id: userId,
        title,
        description,
        category,
        price_type: priceType,
        price: priceType === 'fixed' ? parseFloat(price) : null,
        location_name: locationName,
        status: 'open',
      })
      .select('id')
      .single()

    if (insertError) {
      setUploadStatus('')
      Alert.alert('Error', insertError.message)
      return
    }

    if (photos.length > 0) {
      setUploadStatus('Uploading photos...')
      const photoUrls = await uploadPhotos(jobData.id, photos)
      if (photoUrls.length > 0) {
        await supabase.from('jobs').update({ photos: photoUrls }).eq('id', jobData.id)
      }
    }

    trackEvent('job_posted', { category, price_type: priceType, location: locationName })
    trackCategoryInterest(category)
    setUploadStatus('')
    resetForm()
    navigation.navigate('Dashboard', { refresh: true })
  }

  // ─── Save edited job ───────────────────────────────────────────
  async function saveJobChanges() {
    setUploadStatus('Saving...')

    const { error } = await supabase
      .from('jobs')
      .update({
        title,
        description,
        category,
        price_type: priceType,
        price: priceType === 'fixed' ? parseFloat(price) : null,
        location_name: locationName,
        schedule_type: scheduleType,
        scheduled_date: (scheduleType === 'specific' || scheduleType === 'before') ? (date || null) : null,
      })
      .eq('id', editJob.id)

    if (error) {
      setUploadStatus('')
      Alert.alert('Error', error.message)
      return
    }

    // Separate new local URIs from existing HTTPS URLs
    const newLocalPhotos = photos.filter(p => !p.startsWith('http'))
    const existingUrls   = photos.filter(p => p.startsWith('http'))

    if (newLocalPhotos.length > 0) {
      setUploadStatus('Uploading photos...')
      const newUrls = await uploadPhotos(editJob.id, newLocalPhotos)
      await supabase.from('jobs').update({ photos: [...existingUrls, ...newUrls] }).eq('id', editJob.id)
    } else {
      await supabase.from('jobs').update({ photos: existingUrls }).eq('id', editJob.id)
    }

    setUploadStatus('')
    Alert.alert('Task updated', 'Your task has been updated successfully.', [
      { text: 'OK', onPress: () => navigation.goBack() },
    ])
  }

  async function uploadPhotos(jobId, photoUris) {
    const urls = []
    for (let i = 0; i < photoUris.length; i++) {
      try {
        const uri = photoUris[i]
        const ext = uri.split('.').pop()?.split('?')[0]?.toLowerCase() || 'jpg'
        const path = `${jobId}/${Date.now()}_${i}.${ext}`

        const response = await fetch(uri)
        const blob = await response.blob()

        const { error } = await supabase.storage
          .from('job-photos')
          .upload(path, blob, { contentType: blob.type || 'image/jpeg', upsert: false })

        if (!error) {
          const { data: { publicUrl } } = supabase.storage
            .from('job-photos')
            .getPublicUrl(path)
          urls.push(publicUrl)
        }
      } catch {
        // Skip failed uploads — photos are optional
      }
    }
    return urls
  }

  function resetForm() {
    setStep(1)
    setTitle(''); setCategory(''); setLocationName('')
    setScheduleType(''); setDate(''); setTime('')
    setDescription(''); setPhotos([])
    setPriceType(''); setPrice('')
  }

  async function pickPhoto() {
    if (photos.length >= 4) return
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow photo access to upload images.')
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaType.Images,
      quality: 0.7,
    })
    if (!result.canceled) setPhotos(p => [...p, result.assets[0].uri])
  }

  // ─── Progress bar ──────────────────────────────────────────────
  function renderProgress() {
    return (
      <View style={styles.progressWrap}>
        <View style={styles.progressTrack}>
          <View style={styles.trackBg} />
          <View style={[styles.trackFill, { width: `${(step - 1) * 20}%` }]} />
          <View style={styles.dotsRow}>
            {[1, 2, 3, 4, 5].map(s => {
              const done   = s < step
              const active = s === step
              return (
                <View key={s} style={styles.dotCell}>
                  <View style={[
                    styles.dot,
                    done   && styles.dotDone,
                    active && styles.dotActive,
                    !done && !active && styles.dotInactive,
                  ]}>
                    <Text style={[
                      styles.dotText,
                      done   && styles.dotTextDone,
                      active && styles.dotTextActive,
                      !done && !active && styles.dotTextInactive,
                    ]}>
                      {done ? '✓' : s}
                    </Text>
                  </View>
                </View>
              )
            })}
          </View>
        </View>
        <View style={styles.labelsRow}>
          {STEP_LABELS.map((label, i) => (
            <Text
              key={label}
              numberOfLines={1}
              style={[styles.stepLabel, step === i + 1 && styles.stepLabelActive]}>
              {label}
            </Text>
          ))}
        </View>
      </View>
    )
  }

  // ─── Step 1: Task name ─────────────────────────────────────────
  function renderStep1() {
    return (
      <>
        {isEditMode && editBidCount > 0 && (
          <View style={styles.bidWarning}>
            <Text style={styles.bidWarningText}>
              ⚠️ This task has {editBidCount} bid{editBidCount > 1 ? 's' : ''}. Editing may affect existing bids. Providers will be notified of changes.
            </Text>
          </View>
        )}

        <Text style={styles.stepHeading}>What's the task?</Text>

        <Text style={styles.fieldLabel}>Task title</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Fix fence on north paddock"
          placeholderTextColor={colors.textMuted}
          value={title}
          onChangeText={setTitle}
          autoCapitalize="sentences"
          autoCorrect
          returnKeyType="next"
          blurOnSubmit={false}
          onSubmitEditing={() => locationRef.current?.focus()}
          accessibilityLabel="Task title"
        />

        <Text style={styles.fieldLabel}>Category</Text>
        <View style={styles.chipWrap}>
          {CATEGORIES.map(cat => (
            <TouchableOpacity
              key={cat}
              style={[styles.chip, category === cat && styles.chipActive]}
              onPress={() => setCategory(cat)}
              accessibilityRole="button"
              accessibilityLabel={cat}
              accessibilityState={{ selected: category === cat }}>
              <Text style={[styles.chipText, category === cat && styles.chipTextActive]}>{cat}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.fieldLabel}>Location</Text>
        <TextInput
          ref={locationRef}
          style={styles.input}
          placeholder="e.g. Hawke's Bay"
          placeholderTextColor={colors.textMuted}
          value={locationName}
          onChangeText={setLocationName}
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType="done"
          accessibilityLabel="Location"
        />
      </>
    )
  }

  // ─── Step 2: Schedule ──────────────────────────────────────────
  function renderStep2() {
    const needsDate = scheduleType === 'specific' || scheduleType === 'before'
    return (
      <>
        <Text style={styles.stepHeading}>When is the task?</Text>

        {SCHEDULE_OPTIONS.map(opt => (
          <TouchableOpacity
            key={opt.id}
            style={[styles.optionTile, scheduleType === opt.id && styles.optionTileActive]}
            onPress={() => setScheduleType(opt.id)}
            accessibilityRole="button"
            accessibilityLabel={opt.label}
            accessibilityState={{ selected: scheduleType === opt.id }}>
            <Text style={styles.optionIcon}>{opt.icon}</Text>
            <Text style={[styles.optionLabel, scheduleType === opt.id && styles.optionLabelActive]}>
              {opt.label}
            </Text>
            <View style={[styles.radio, scheduleType === opt.id && styles.radioActive]}>
              {scheduleType === opt.id && <View style={styles.radioDot} />}
            </View>
          </TouchableOpacity>
        ))}

        {needsDate && (
          <View style={styles.dateGroup}>
            <Text style={styles.fieldLabel}>Date</Text>
            <TextInput
              style={styles.input}
              placeholder="DD/MM/YYYY"
              placeholderTextColor={colors.textMuted}
              value={date}
              onChangeText={setDate}
              keyboardType="numbers-and-punctuation"
              returnKeyType="next"
              blurOnSubmit={false}
              onSubmitEditing={() => timeRef.current?.focus()}
              accessibilityLabel="Date"
            />
            <Text style={styles.fieldLabel}>
              Time{'  '}
              <Text style={styles.optional}>(optional)</Text>
            </Text>
            <TextInput
              ref={timeRef}
              style={styles.input}
              placeholder="e.g. 9:00 AM"
              placeholderTextColor={colors.textMuted}
              value={time}
              onChangeText={setTime}
              returnKeyType="done"
              accessibilityLabel="Time, optional"
            />
          </View>
        )}
      </>
    )
  }

  // ─── Step 3: Details ───────────────────────────────────────────
  function renderStep3() {
    return (
      <>
        <Text style={styles.stepHeading}>Job details</Text>

        <Text style={styles.fieldLabel}>Description</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          placeholder="Describe the job in detail — materials needed, access, any special requirements..."
          placeholderTextColor={colors.textMuted}
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={5}
          textAlignVertical="top"
          autoCapitalize="sentences"
          autoCorrect
          returnKeyType="done"
          accessibilityLabel="Job description"
        />

        <Text style={styles.fieldLabel}>
          Photos{'  '}
          <Text style={styles.optional}>(optional, up to 4)</Text>
        </Text>
        <View style={styles.photoGrid}>
          {photos.map((uri, idx) => (
            <View key={idx} style={styles.photoThumb}>
              <Image source={{ uri }} style={styles.photoImg} />
              <TouchableOpacity
                style={styles.photoRemove}
                onPress={() => setPhotos(p => p.filter((_, i) => i !== idx))}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={`Remove photo ${idx + 1}`}>
                <Text style={styles.photoRemoveText}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}
          {photos.length < 4 && (
            <TouchableOpacity
              style={styles.photoAdd}
              onPress={pickPhoto}
              accessibilityRole="button"
              accessibilityLabel="Add photo"
              accessibilityHint="Double tap to pick a photo from your library">
              <Text style={styles.photoAddIcon}>📷</Text>
              <Text style={styles.photoAddText}>Add photo</Text>
            </TouchableOpacity>
          )}
        </View>
      </>
    )
  }

  // ─── Step 4: Budget ────────────────────────────────────────────
  function renderStep4() {
    return (
      <>
        <Text style={styles.stepHeading}>Set your budget</Text>

        <View style={styles.budgetRow}>
          {BUDGET_OPTIONS.map(opt => (
            <TouchableOpacity
              key={opt.id}
              style={[styles.budgetTile, priceType === opt.id && styles.budgetTileActive]}
              onPress={() => setPriceType(opt.id)}
              accessibilityRole="button"
              accessibilityLabel={opt.label}
              accessibilityState={{ selected: priceType === opt.id }}>
              <Text style={styles.budgetIcon}>{opt.icon}</Text>
              <Text style={[styles.budgetLabel, priceType === opt.id && styles.budgetLabelActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {priceType === 'fixed' && (
          <>
            <Text style={styles.fieldLabel}>Amount (NZD)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 250"
              placeholderTextColor={colors.textMuted}
              value={price}
              onChangeText={setPrice}
              keyboardType="numeric"
              returnKeyType="done"
              accessibilityLabel="Price in NZD"
            />
          </>
        )}

        <View style={styles.infoBox}>
          <Text style={styles.infoIcon}>🔒</Text>
          <Text style={styles.infoText}>
            Funds are held securely and only released when you confirm the job is complete.
          </Text>
        </View>
      </>
    )
  }

  // ─── Step 5: Review ────────────────────────────────────────────
  function renderStep5() {
    const scheduleText =
      scheduleType === 'specific'
        ? `On ${date || 'a specific date'}${time ? ` at ${time}` : ''}`
        : scheduleType === 'before'
        ? `Before ${date || 'a certain date'}${time ? ` at ${time}` : ''}`
        : "I'm flexible"
    const budgetText = priceType === 'fixed' ? `Fixed — $${price} NZD` : 'Open to bids'

    const rows = [
      { label: 'Task',        value: title },
      { label: 'Category',    value: category },
      { label: 'Location',    value: locationName },
      { label: 'Schedule',    value: scheduleText },
      { label: 'Budget',      value: budgetText },
      { label: 'Description', value: description },
      photos.length > 0 && { label: 'Photos', value: `${photos.length} attached` },
    ].filter(Boolean)

    function fieldChanged(label) {
      if (!isEditMode || !original) return false
      switch (label) {
        case 'Task':        return title        !== original.title
        case 'Category':    return category     !== original.category
        case 'Location':    return locationName !== original.locationName
        case 'Schedule':    return scheduleType !== original.scheduleType || date !== original.date
        case 'Budget':      return priceType    !== original.priceType    || price !== original.price
        case 'Description': return description  !== original.description
        case 'Photos':      return photos.length !== original.photos.length
        default:            return false
      }
    }

    return (
      <>
        <Text style={styles.stepHeading}>
          {isEditMode ? 'Review changes' : 'Review your task'}
        </Text>
        <View style={styles.reviewCard}>
          {rows.map((row, i) => {
            const changed = fieldChanged(row.label)
            return (
              <View
                key={row.label}
                style={[
                  styles.reviewRow,
                  i < rows.length - 1 && styles.reviewRowBorder,
                  changed && styles.reviewRowChanged,
                ]}>
                <Text style={[styles.reviewLabel, changed && styles.reviewLabelChanged]}>
                  {row.label}
                </Text>
                <Text
                  style={[styles.reviewValue, changed && styles.reviewValueChanged]}
                  numberOfLines={row.label === 'Description' ? 4 : 2}>
                  {row.value}
                </Text>
              </View>
            )
          })}
        </View>
      </>
    )
  }

  const RENDERERS = [renderStep1, renderStep2, renderStep3, renderStep4, renderStep5]

  const submitLabel = isEditMode ? 'Save changes' : 'Post task'

  return (
    <View style={styles.screen}>
      {/* Green header */}
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <Text style={styles.headerTitle} accessibilityRole="header">
            {isEditMode ? 'Edit task' : 'Post a task'}
          </Text>
          {isEditMode && (
            <View style={styles.editingBadge}>
              <Text style={styles.editingBadgeText}>Editing</Text>
            </View>
          )}
        </View>
        {renderProgress()}
      </View>

      {/* Unsaved changes banner */}
      {hasChanges && (
        <View style={styles.changesHint}>
          <Text style={styles.changesHintText}>⚠️  You have unsaved changes</Text>
        </View>
      )}

      {/* Step content with slide animation */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}>
        <Animated.View style={[{ flex: 1 }, stepContentStyle]}>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled">
            {RENDERERS[step - 1]()}
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>

      {/* Footer buttons */}
      <SafeAreaView edges={['bottom']} style={styles.footer}>
        {step === 1 ? (
          <TouchableOpacity
            style={[styles.nextBtnFull, !canProceed() && styles.btnDisabled]}
            onPress={handleNext}
            disabled={!canProceed()}
            accessibilityRole="button"
            accessibilityLabel="Next step"
            accessibilityHint={canProceed() ? 'Double tap to go to the next step' : 'Complete all fields to continue'}>
            <Text style={styles.nextBtnText}>Next →</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.footerRow}>
            <TouchableOpacity
              style={styles.backBtn}
              onPress={handleBack}
              accessibilityRole="button"
              accessibilityLabel="Go back to previous step">
              <Text style={styles.backBtnText}>← Back</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.nextBtn, !canProceed() && styles.btnDisabled]}
              onPress={handleNext}
              disabled={!canProceed() || !!uploadStatus}
              accessibilityRole="button"
              accessibilityLabel={step === 5 ? (uploadStatus || submitLabel) : 'Next step'}
              accessibilityHint={step === 5 ? 'Double tap to submit your task' : undefined}>
              <Text style={styles.nextBtnText}>
                {step === 5 ? (uploadStatus || submitLabel) : 'Next →'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </SafeAreaView>

      {/* Guest auth bottom sheet with spring animation */}
      <Modal
        visible={showAuthSheet}
        transparent
        animationType="none"
        onRequestClose={() => setShowAuthSheet(false)}>
        <AuthSheet
          onDismiss={() => setShowAuthSheet(false)}
          onLogin={() => navigation.navigate('Login')}
          onRegister={() => navigation.navigate('Register')}
        />
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },

  // ─── Header ─────────────────────────────────────────────────────
  header: {
    backgroundColor: colors.primary,
    paddingTop: 52,
    paddingHorizontal: 20,
    paddingBottom: 18,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: colors.white },
  editingBadge: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  editingBadgeText: { fontSize: 13, fontWeight: '700', color: colors.white },

  // ─── Unsaved changes banner ──────────────────────────────────────
  changesHint: {
    backgroundColor: '#fffbeb',
    borderBottomWidth: 1,
    borderBottomColor: '#fcd34d',
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  changesHintText: { fontSize: 13, fontWeight: '600', color: '#92400e' },

  // ─── Step 1: Bid warning ─────────────────────────────────────────
  bidWarning: {
    backgroundColor: '#fef3c7',
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#fcd34d',
  },
  bidWarningText: { fontSize: 14, color: '#92400e', lineHeight: 20 },

  // ─── Progress bar ───────────────────────────────────────────────
  progressWrap: { gap: 7 },
  progressTrack: { position: 'relative', height: 26 },
  trackBg: {
    position: 'absolute',
    left: '10%',
    right: '10%',
    top: 12,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  trackFill: {
    position: 'absolute',
    left: '10%',
    top: 12,
    height: 2,
    backgroundColor: colors.white,
  },
  dotsRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    flexDirection: 'row',
  },
  dotCell: { flex: 1, alignItems: 'center' },
  dot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotDone:     { backgroundColor: '#52b788' },
  dotActive:   { backgroundColor: colors.white },
  dotInactive: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  dotText:         { fontSize: 13, fontWeight: 'bold' },
  dotTextDone:     { color: colors.white },
  dotTextActive:   { color: colors.primary },
  dotTextInactive: { color: 'rgba(255,255,255,0.5)' },

  labelsRow: { flexDirection: 'row' },
  stepLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    fontWeight: '500',
  },
  stepLabelActive: { color: colors.white, fontWeight: '700' },

  // ─── Content ────────────────────────────────────────────────────
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 40 },

  stepHeading: { fontSize: 22, fontWeight: 'bold', color: colors.primary, marginBottom: 20 },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 8,
    marginTop: 16,
  },
  optional: { fontSize: 13, fontWeight: '400', color: colors.textMuted },
  input: {
    backgroundColor: colors.white,
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 4,
  },
  multiline: { height: 120, textAlignVertical: 'top' },

  // ─── Chips (step 1) ─────────────────────────────────────────────
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.white,
    minHeight: 44,
    justifyContent: 'center',
  },
  chipActive:     { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  chipText:       { color: colors.textSecondary, fontSize: 13, fontWeight: '500' },
  chipTextActive: { color: colors.primary, fontWeight: '700' },

  // ─── Option tiles (step 2) ──────────────────────────────────────
  optionTile: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1.5,
    borderColor: colors.border,
    gap: 12,
    minHeight: 56,
  },
  optionTileActive:  { borderColor: colors.primary, backgroundColor: '#f0faf5' },
  optionIcon:        { fontSize: 22 },
  optionLabel:       { flex: 1, fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  optionLabelActive: { color: colors.primary },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioActive: { borderColor: colors.primary },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
  dateGroup: { marginTop: 4 },

  // ─── Photos (step 3) ────────────────────────────────────────────
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  photoThumb: { width: 80, height: 80, borderRadius: 8, position: 'relative' },
  photoImg:   { width: 80, height: 80, borderRadius: 8 },
  photoRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoRemoveText: { color: colors.white, fontSize: 13, fontWeight: 'bold', lineHeight: 14 },
  photoAdd: {
    width: 80,
    height: 80,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#c8c8c8',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fafafa',
  },
  photoAddIcon: { fontSize: 22, marginBottom: 4 },
  photoAddText: { fontSize: 13, color: colors.textMuted, fontWeight: '500' },

  // ─── Budget (step 4) ────────────────────────────────────────────
  budgetRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  budgetTile: {
    flex: 1,
    padding: 20,
    backgroundColor: colors.white,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.border,
    minHeight: 44,
  },
  budgetTileActive:  { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  budgetIcon:        { fontSize: 28, marginBottom: 8 },
  budgetLabel:       { fontSize: 14, fontWeight: '700', color: colors.textSecondary, textAlign: 'center' },
  budgetLabelActive: { color: colors.primary },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: '#f0faf5',
    borderRadius: 10,
    padding: 14,
    alignItems: 'flex-start',
    gap: 10,
    borderWidth: 1,
    borderColor: '#c8e6c9',
    marginTop: 8,
  },
  infoIcon: { fontSize: 18 },
  infoText: { flex: 1, fontSize: 13, color: colors.textSecondary, lineHeight: 20 },

  // ─── Review (step 5) ────────────────────────────────────────────
  reviewCard: {
    backgroundColor: colors.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    marginTop: 4,
  },
  reviewRow: {
    flexDirection: 'row',
    paddingVertical: 13,
    paddingHorizontal: 16,
    alignItems: 'flex-start',
  },
  reviewRowBorder:  { borderBottomWidth: 1, borderBottomColor: '#f2f2f2' },
  reviewRowChanged: { backgroundColor: '#fffbeb' },
  reviewLabel: {
    fontSize: 13,
    color: colors.textMuted,
    fontWeight: '600',
    width: 84,
    flexShrink: 0,
    paddingTop: 1,
  },
  reviewLabelChanged: { color: '#92400e' },
  reviewValue: {
    fontSize: 14,
    color: colors.textPrimary,
    flex: 1,
    fontWeight: '500',
    textAlign: 'right',
  },
  reviewValueChanged: { color: '#78350f' },

  // ─── Footer ─────────────────────────────────────────────────────
  footer: {
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: 16,
    paddingBottom: 16,
  },
  footerRow: { flexDirection: 'row', gap: 12 },
  backBtn: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  backBtnText: { color: colors.primary, fontSize: 15, fontWeight: '600' },
  nextBtn: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    minHeight: 52,
    justifyContent: 'center',
  },
  nextBtnFull: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    minHeight: 52,
    justifyContent: 'center',
  },
  nextBtnText: { color: colors.white, fontSize: 16, fontWeight: 'bold' },
  btnDisabled: { backgroundColor: '#a8cfc0' },

  // ─── Auth sheet ─────────────────────────────────────────────────
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.white,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 28,
    paddingBottom: 48,
  },
  sheetTitle:   { fontSize: 22, fontWeight: 'bold', color: colors.primary, textAlign: 'center', marginBottom: 10 },
  sheetMessage: { fontSize: 15, color: colors.textSecondary, textAlign: 'center', marginBottom: 28, lineHeight: 24 },
  sheetPrimary: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
    minHeight: 52,
    justifyContent: 'center',
  },
  sheetPrimaryText:   { color: colors.white, fontSize: 16, fontWeight: 'bold' },
  sheetSecondary: {
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.primary,
    minHeight: 52,
    justifyContent: 'center',
  },
  sheetSecondaryText: { color: colors.primary, fontSize: 16, fontWeight: '600' },
})
