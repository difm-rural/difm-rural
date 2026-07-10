import React, { useRef, useState, useEffect } from 'react'
import {
  Alert, Animated, Dimensions, Image, Modal,
  ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import PostJobHeader from './PostJobHeader'
import { usePostJob } from '../../context/PostJobContext'
import { supabase } from '../../lib/supabase'
import { trackEvent } from '../../lib/analytics'
import { trackCategoryInterest } from '../../lib/preferences'
import { staticMapUrl, staticMapPolygonUrl } from '../../lib/maps'
import { uploadJobPhotos, toStorablePhoto } from '../../lib/jobPhotos'
import { inferJobCategory } from '../../lib/categorize'
import { colors } from '../../theme/tokens'
import Icon from '../../components/Icon'
import Button from '../../components/Button'

const { height: SCREEN_HEIGHT } = Dimensions.get('window')

const SCHEDULE_LABELS = {
  asap:     'As soon as possible',
  specific: 'On a specific date',
  flexible: "I'm flexible",
}

const MATERIALS_LABELS = {
  none:      'No materials needed',
  requester: 'I supply materials',
  provider:  'Provider to supply',
}
const ACCESS_LABELS = {
  park_and_walk: 'Park and walk in',
  '4wd_required': '4WD required',
  dogs_on_property: 'Dogs on property',
  livestock_nearby: 'Livestock nearby',
  electric_fences: 'Electric fences',
  contact_before_arrival: 'Contact before arrival',
}

function formatDate(iso) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

function AuthSheet({ onDismiss, onLogin }) {
  const translateY      = useRef(new Animated.Value(SCREEN_HEIGHT)).current
  const backdropOpacity = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.parallel([
      Animated.spring(translateY, { toValue: 0, damping: 20, stiffness: 200, useNativeDriver: true }),
      Animated.timing(backdropOpacity, { toValue: 0.5, duration: 300, useNativeDriver: true }),
    ]).start()
  }, [])

  function dismiss() {
    Animated.parallel([
      Animated.timing(translateY,      { toValue: SCREEN_HEIGHT, duration: 250, useNativeDriver: true }),
      Animated.timing(backdropOpacity, { toValue: 0,             duration: 250, useNativeDriver: true }),
    ]).start(({ finished }) => { if (finished) onDismiss() })
  }

  return (
    <View style={styles.absoluteFill}>
      <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]} />
      <TouchableOpacity
        style={styles.absoluteFill}
        activeOpacity={1}
        onPress={dismiss}
        accessibilityRole="button"
        accessibilityLabel="Dismiss" />
      <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
        <Text style={styles.sheetTitle}>Almost there!</Text>
        <Text style={styles.sheetMessage}>
          Sign in to post your job. Your details have been saved.{'\n'}
          New? Just enter your email — we'll create your account automatically.
        </Text>
        <TouchableOpacity
          style={styles.sheetPrimary}
          onPress={() => { dismiss(); setTimeout(onLogin, 280) }}
          accessibilityRole="button">
          <Text style={styles.sheetPrimaryText}>Sign in / Create account</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  )
}

export default function PostJobStep5Review({ navigation, route }) {
  const insets = useSafeAreaInsets()
  const { jobData, resetJobData } = usePostJob()

  const isEditMode   = route.params?.mode === 'edit'
  const editJob      = route.params?.job || null
  const editBidCount = route.params?.bidCount || 0

  const {
    latitude, longitude, jobAddress, locationNote,
    areaPolygon = [], areaHectares,
    category, title,
    scheduleType, scheduledDate,
    priceType, price,
    photos = [],
    description,
    materialsType,
    accessConditions = [],
    inviteProviderId,
    inviteProviderName,
  } = jobData

  const isInvite = !!inviteProviderId && !isEditMode

  const [uploadStatus,  setUploadStatus]  = useState('')
  const [showAuthSheet, setShowAuthSheet] = useState(false)
  const [alsoPublic,    setAlsoPublic]    = useState(false)

  const locationSummary = jobAddress
    || (latitude ? `${parseFloat(latitude).toFixed(4)}, ${parseFloat(longitude).toFixed(4)}` : 'No location set')

  const scheduleLabel   = SCHEDULE_LABELS[scheduleType] || scheduleType
  const scheduleDisplay = scheduleType === 'specific' && scheduledDate
    ? `${scheduleLabel} — ${formatDate(scheduledDate)}`
    : scheduleLabel
  const budgetDisplay   = priceType === 'fixed' ? `$${price} NZD (fixed price)`
    : priceType === 'unpaid' ? 'Unpaid / in-kind'
    : 'Open to offers'

  const mapImgUri = areaPolygon.length > 0
    ? staticMapPolygonUrl(areaPolygon)
    : (latitude ? staticMapUrl(latitude, longitude, { zoom: 17 }) : null)

  // Step order: 1=JobType, 2=Location, 3=Details, 4=Budget, 5=Review
  // popCount = screens to pop from Step5 to reach that step
  const rows = [
    { label: 'Location',    value: locationSummary, popCount: 3 },
    category ? { label: 'Category', value: category, popCount: 4 } : null,
    { label: 'Title',       value: title,           popCount: 4 },
    { label: 'When',        value: scheduleDisplay, popCount: 4 },
    { label: 'Budget',      value: budgetDisplay,   popCount: 1 },
    photos.length > 0
      ? { label: 'Photos', value: `${photos.length} photo${photos.length !== 1 ? 's' : ''} attached`, popCount: 2 }
      : null,
    locationNote ? { label: 'Location note', value: locationNote, popCount: 3 } : null,
    { label: 'Description', value: description,     popCount: 2 },
    materialsType ? { label: 'Materials', value: MATERIALS_LABELS[materialsType] || materialsType, popCount: 2 } : null,
    accessConditions.length > 0
      ? { label: 'Site access', value: accessConditions.map(c => ACCESS_LABELS[c] || c).join(', '), popCount: 2 }
      : null,
  ].filter(Boolean)

  function handleBack() {
    navigation.goBack()
  }

  const TAB_ROOTS = { Home: 'Dashboard', Jobs: 'JobsBoard', Browse: 'BrowseMain', Activity: 'ActivityMain' }

  // Reset the current stack to its root screen, clearing the whole wizard so
  // Back never walks back through the steps. Used after an edit save.
  function goToStackRoot() {
    const rootName = navigation.getState()?.routes?.[0]?.name
    if (rootName) navigation.reset({ index: 0, routes: [{ name: rootName }] })
  }

  // After a successful post: wipe the wizard out of the Jobs stack and land on
  // a real tab root — the launching tab, or Home by default. (A new-post wizard
  // always lives in the Jobs stack, so JobsBoard is a safe explicit target;
  // navigate(rootName) was unreliable because nested launches can leave the
  // wizard screen itself as the stack root.)
  function returnAfterPost() {
    const origin = route.params?.origin
    const parent = navigation.getParent()
    navigation.reset({ index: 0, routes: [{ name: 'JobsBoard' }] })
    const destTab = TAB_ROOTS[origin] ? origin : 'Home'
    if (destTab !== 'Jobs') parent?.navigate(destTab, { screen: TAB_ROOTS[destTab] })
  }

  function handleEditRow(popCount) {
    navigation.pop(popCount)
  }

  async function handleSubmit() {
    const { data: { user } } = await supabase.auth.getUser()

    // Category is auto-detected from the title + details (keep any existing one
    // on edit). Falls back to 'Other' if the AI call is unavailable.
    const resolvedCategory = (category && category.trim())
      ? category
      : await inferJobCategory(title, description)

    const payload = {
      title,
      description,
      category: resolvedCategory,
      price_type:        priceType,
      price:             priceType === 'fixed' ? parseFloat(price) : null,
      location_name:     jobAddress || null,
      location_note:     locationNote || null,
      latitude:          latitude  || null,
      longitude:         longitude || null,
      area_polygon:      areaPolygon.length > 0 ? areaPolygon : null,
      area_hectares:     areaHectares || null,
      schedule_type:     scheduleType,
      scheduled_date:    scheduleType === 'specific' && scheduledDate
        ? (typeof scheduledDate === 'string' ? scheduledDate.split('T')[0] : new Date(scheduledDate).toISOString().split('T')[0])
        : null,
      materials_type:    materialsType || null,
      access_conditions: accessConditions.length > 0 ? accessConditions : null,
    }

    if (!user) {
      // Save photos with the draft so they survive the login round-trip.
      const pendingPhotos = (photos || []).map(toStorablePhoto)
      await AsyncStorage.setItem('pendingJob', JSON.stringify({ ...payload, _photos: pendingPhotos }))
      setShowAuthSheet(true)
      return
    }

    setUploadStatus(isEditMode ? 'Saving...' : 'Posting...')

    if (isEditMode && editJob) {
      const { error } = await supabase
        .from('jobs').update(payload).eq('id', editJob.id).eq('requester_id', user.id)
      if (error) { setUploadStatus(''); Alert.alert('Error', error.message); return }

      setUploadStatus('Uploading photos...')
      const finalUrls = await uploadJobPhotos(editJob.id, photos)
      await supabase.from('jobs').update({ photos: finalUrls }).eq('id', editJob.id)

      setUploadStatus('')
      resetJobData()
      Alert.alert('Job updated', 'Your job has been updated.', [
        { text: 'OK', onPress: goToStackRoot },
      ])
      return
    }

    const visibility = isInvite ? (alsoPublic ? 'public' : 'invite_only') : 'public'

    const { data: newJob, error: insertError } = await supabase
      .from('jobs')
      .insert({ ...payload, requester_id: user.id, status: 'open', visibility })
      .select('id')
      .single()
    if (insertError) { setUploadStatus(''); Alert.alert('Error', insertError.message); return }

    if (photos.length > 0) {
      setUploadStatus('Uploading photos...')
      const finalUrls = await uploadJobPhotos(newJob.id, photos)
      if (finalUrls.length > 0) {
        await supabase.from('jobs').update({ photos: finalUrls }).eq('id', newJob.id)
      }
    }

    let inviteFailed = false
    if (isInvite) {
      const { error: inviteError } = await supabase
        .from('job_invites')
        .insert({ job_id: newJob.id, requester_id: user.id, provider_id: inviteProviderId })
      inviteFailed = !!inviteError
    }

    trackEvent('job_posted', { category: resolvedCategory, price_type: priceType, location: jobAddress, invited: isInvite })
    trackCategoryInterest(resolvedCategory)
    setUploadStatus('')
    resetJobData()

    const who = inviteProviderName || 'your provider'
    const successTitle = isInvite ? 'Offer sent!' : 'Job posted!'
    const successBody = inviteFailed
      ? `Your job is posted, but we couldn't notify ${who}. You can offer it from their profile.`
      : isInvite
        ? (alsoPublic
            ? `${who} has been invited, and your job is also on the public board.`
            : `${who} has been invited. Only they can see this job.`)
        : 'Providers near you will be notified.'
    Alert.alert(successTitle, successBody, [
      { text: 'OK', onPress: returnAfterPost },
    ])
  }

  const submitLabel = uploadStatus || (isEditMode ? 'Save changes' : (isInvite ? 'Send offer' : 'Post job'))

  return (
    <View style={styles.screen}>
      <PostJobHeader
        currentStep={5}
        title={isEditMode ? 'Edit job' : 'Post a job'}
        onBack={handleBack}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}>

        {isInvite && (
          <View style={styles.inviteBanner}>
            <Icon name="person-add-outline" size={20} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.inviteTitle}>Offering this job to {inviteProviderName || 'your provider'}</Text>
              <Text style={styles.inviteSub}>
                {alsoPublic
                  ? "They'll be invited directly, and it's also on the public board."
                  : "Private offer — only they can see this job."}
              </Text>
            </View>
          </View>
        )}

        {isInvite && (
          <TouchableOpacity
            style={styles.publicToggle}
            onPress={() => setAlsoPublic(v => !v)}
            activeOpacity={0.7}
            accessibilityRole="switch"
            accessibilityState={{ checked: alsoPublic }}
            accessibilityLabel="Also post on the public board">
            <View style={[styles.checkbox, alsoPublic && styles.checkboxOn]}>
              {alsoPublic && <Icon name="checkmark" size={14} color={colors.white} />}
            </View>
            <Text style={styles.publicToggleText}>Also post on the public board</Text>
          </TouchableOpacity>
        )}

        {mapImgUri ? (
          <Image source={{ uri: mapImgUri }} style={styles.mapThumb} resizeMode="cover" />
        ) : (
          <View style={styles.mapPlaceholder}>
            <Text style={styles.mapPlaceholderText}><Icon name="location-outline" size={13} color={colors.textMuted} /> No location set</Text>
          </View>
        )}

        <View style={styles.reviewCard}>
          {rows.map((row, i) => (
            <View key={row.label} style={[styles.reviewRow, i < rows.length - 1 && styles.reviewRowBorder]}>
              <View style={styles.reviewFlex}>
                <Text style={styles.reviewLabel}>{row.label}</Text>
                <Text
                  style={styles.reviewValue}
                  numberOfLines={row.label === 'Description' ? 4 : 2}>
                  {row.value}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => handleEditRow(row.popCount)}
                hitSlop={{ top: 8, bottom: 8, left: 16, right: 4 }}>
                <Text style={styles.editLink}>Edit</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>

        {photos.length === 0 && (
          <TouchableOpacity
            style={styles.photoReminder}
            onPress={() => handleEditRow(2)}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Add photos to your job">
            <Icon name="camera-outline" size={18} color={colors.warning} />
            <Text style={styles.photoReminderText}>
              No photos added — jobs with photos get more offers. Tap to add a couple.
            </Text>
            <Icon name="chevron-forward" size={16} color={colors.warning} />
          </TouchableOpacity>
        )}

        <View style={styles.infoBox}>
          <Icon name="flash-outline" size={18} color={colors.primary} />
          <Text style={styles.infoText}>
            Your job will be visible to providers{' '}
            {latitude || areaPolygon.length > 0
              ? `near ${jobAddress || 'your location'}`
              : 'across the platform'}{' '}
            immediately.
          </Text>
        </View>

        {isEditMode && editBidCount > 0 && (
          <View style={styles.warningBox}>
            <Text style={styles.warningText}>
              <Icon name="warning-outline" size={14} color={colors.warning} /> This job has {editBidCount} bid{editBidCount > 1 ? 's' : ''}. Editing may affect existing bids.
            </Text>
          </View>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.footerBtns}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={handleBack}
            accessibilityRole="button"
            accessibilityLabel="Go back">
            <Text style={styles.backBtnText}><Icon name="chevron-back" size={14} color={colors.primary} /> Back</Text>
          </TouchableOpacity>
          <Button
            title={submitLabel}
            onPress={handleSubmit}
            loading={!!uploadStatus}
            style={{ flex: 1 }}
            accessibilityLabel={submitLabel}
          />
        </View>
      </View>

      <Modal
        visible={showAuthSheet}
        transparent
        animationType="none"
        onRequestClose={() => setShowAuthSheet(false)}>
        <AuthSheet
          onDismiss={() => setShowAuthSheet(false)}
          onLogin={() => navigation.navigate('Login')}
        />
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  screen:        { flex: 1, backgroundColor: '#f5f5f5' },
  scroll:        { flex: 1 },
  scrollContent: { padding: 16 },

  mapThumb: {
    width: '100%',
    height: 130,
    borderRadius: 12,
    marginBottom: 12,
    backgroundColor: '#ddd',
  },
  mapPlaceholder: {
    width: '100%',
    height: 72,
    borderRadius: 12,
    marginBottom: 12,
    backgroundColor: '#f0faf5',
    borderWidth: 1,
    borderColor: '#c3e6d4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapPlaceholderText: { fontSize: 14, color: colors.textMuted },

  inviteBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: colors.primaryLight,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  inviteTitle: { fontSize: 14, fontWeight: '700', color: colors.primary },
  inviteSub:   { fontSize: 12.5, color: colors.textSecondary, marginTop: 3, lineHeight: 18 },
  publicToggle: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, marginBottom: 12 },
  checkbox: {
    width: 22, height: 22, borderRadius: 6,
    borderWidth: 1.5, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  publicToggleText: { fontSize: 14, color: colors.textPrimary },

  reviewCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e8e8e8',
    marginBottom: 12,
  },
  reviewRow:       { flexDirection: 'row', alignItems: 'flex-start', padding: 14 },
  reviewRowBorder: { borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  reviewFlex:      { flex: 1 },
  reviewLabel:     { fontSize: 11, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 3 },
  reviewValue:     { fontSize: 14, color: '#222', lineHeight: 20 },
  editLink:        { fontSize: 13, color: colors.primary, textDecorationLine: 'underline', paddingTop: 2, marginLeft: 8, flexShrink: 0 },

  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#fffbeb',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#fcd34d',
    gap: 10,
    marginBottom: 12,
  },
  infoIcon: { fontSize: 18 },
  infoText: { flex: 1, fontSize: 13, color: '#92400e', lineHeight: 19 },
  photoReminder: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.warningLight,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#f0c98a',
    padding: 14,
    marginBottom: 12,
  },
  photoReminderText: { flex: 1, fontSize: 13, color: colors.warning, lineHeight: 19, fontWeight: '600' },

  warningBox: {
    backgroundColor: '#fff3e0',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#ffb74d',
    marginBottom: 12,
  },
  warningText: { fontSize: 13, color: '#e65100' },

  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderTopWidth: 0.5,
    borderTopColor: '#e0e0e0',
    paddingTop: 12,
    paddingHorizontal: 16,
  },
  footerBtns:        { flexDirection: 'row', gap: 10 },
  backBtn:           { borderWidth: 1.5, borderColor: colors.primary, borderRadius: 12, paddingVertical: 15, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center', minHeight: 52 },
  backBtnText:       { color: colors.primary, fontSize: 14, fontWeight: '600' },

  absoluteFill: { ...StyleSheet.absoluteFillObject },
  backdrop:     { ...StyleSheet.absoluteFillObject, backgroundColor: '#000' },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 28, paddingBottom: 48,
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 20, elevation: 20,
  },
  sheetTitle:         { fontSize: 22, fontWeight: '700', color: '#222', marginBottom: 8 },
  sheetMessage:       { fontSize: 15, color: '#555', lineHeight: 22, marginBottom: 24 },
  sheetPrimary:       { backgroundColor: colors.primary, borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: 12 },
  sheetPrimaryText:   { color: '#fff', fontSize: 16, fontWeight: '700' },
  sheetSecondary:     { padding: 14, alignItems: 'center' },
  sheetSecondaryText: { color: colors.primary, fontSize: 15, fontWeight: '600', textDecorationLine: 'underline' },
})
