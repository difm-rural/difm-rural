import { newJobId } from '../../lib/draftId'
import {formatMoney as nzMoney,formatWorkDate as nzDate} from '../../../shared/formatting.js'
import {publicAreaError} from '../../../shared/publicArea'
import {localityFromAddress} from '../../../shared/locality'
import {postingTextError} from '../../../shared/postingText'
import {runSubmission} from '../../../shared/submission'
import {moneyInputError} from '../../../shared/postingMoney'
import {jobScheduleError,nzCalendarDay} from '../../../shared/postingDates'
import {confirmPublishingLocation} from '../../lib/publishingLocation'
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
import JobPrimaryPhotoDraft from '../../components/JobPrimaryPhotoDraft'
import { jobPrimaryPhotoRequest } from '../../lib/jobPrimaryPhoto'
import { uploadJobPhotos, toStorablePhoto } from '../../lib/jobPhotos'
import { removeThumbnails } from '../../lib/photoThumbs'
import { removedThumbPaths } from '../../../shared/photos'
import { inferJobCategory } from '../../lib/categorize'
import { CATEGORIES, isHouseSitting } from '../../lib/categories'
import { colors } from '../../theme/tokens'
import Icon from '../../components/Icon'
import Button from '../../components/Button'

const { height: SCREEN_HEIGHT } = Dimensions.get('window')

const SCHEDULE_LABELS = {
  asap:     'As soon as possible',
  specific: 'On a specific date',
  range:    'Over a period',
  flexible: "I'm flexible",
}

function fmtDay(v) {
  return nzCalendarDay(v)
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
  return nzDate(iso)
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
  const { jobData, updateJobData, resetJobData } = usePostJob()

  const isEditMode   = route.params?.mode === 'edit'
  const isRepeatMode = route.params?.mode === 'repeat'
  const editJob      = route.params?.job || null
  const editBidCount = route.params?.bidCount || 0

  const {
    latitude, longitude, jobAddress, locationNote,
    areaPolygon = [], areaHectares,
    category, title,
    scheduleType, scheduledDate,
    priceType, price,
    photos = [], primaryPhoto, primaryPhotoRequired,
    description,
    materialsType,
    accessConditions = [],
    inviteProviderId,
    inviteProviderName,
    dateFrom, dateTo,
    hideExactLocation, locationArea,
    repeatedFromJobId,
    recurrenceFrequency,
    draftJobId,
  } = jobData

  const isInvite = !!inviteProviderId && !isEditMode

  const [uploadStatus,  setUploadStatus]  = useState('')
  const [showAuthSheet, setShowAuthSheet] = useState(false)
  const [alsoPublic,    setAlsoPublic]    = useState(false)
  const [mapFailed,     setMapFailed]     = useState(false)
  // The category is chosen automatically from the title + details. Work it out
  // on arrival so it can be shown — and corrected — before posting.
  const [suggestion, setSuggestion] = useState(null)
  const [categoryPicker,   setCategoryPicker]   = useState(false)
  const houseSit = isHouseSitting(title)
  const suggestedCategory = suggestion && suggestion.title === title && suggestion.description === description ? suggestion.category : ''
  const shownCategory = category?.trim() || (houseSit ? 'Property & House Sitting' : suggestedCategory)
  useEffect(() => {
    if (shownCategory) return
    let active = true
    inferJobCategory(title, description).then(found => { if (active) setSuggestion({ title, description, ...found }) })
    return () => { active = false }
  }, [title, description, shownCategory])
  // Guards against a double-tap posting the job twice. A ref (not state)
  // because setState is async — a second tap can fire before the re-render
  // disables the button, which is exactly how duplicates got created.
  const submittingRef = useRef(false)
  const galleryIds = useRef(new Map())
  function galleryId(photo) {
    if (!galleryIds.current.has(photo.uri)) galleryIds.current.set(photo.uri, newJobId())
    return galleryIds.current.get(photo.uri)
  }

  const locationSummary = hideExactLocation
    ? `${locationArea || 'Area only'} — exact address hidden until you accept`
    : (jobAddress
      || (latitude ? 'Pinned on map (no street address)' : 'No location set'))

  // Providers only ever see the locality before an offer is accepted, so say so
  // here rather than repeating the street address.
  const publicLocality = (locationArea || localityFromAddress(jobAddress) || '').trim()
  const publicationMessage = publicLocality
    ? `Your job will be visible to providers near ${publicLocality} immediately. They see the area only; your exact address is shared with the provider you accept.`
    : latitude || areaPolygon.length > 0
      ? 'Your job will be visible to providers near your area immediately. Your exact location is shared with the provider you accept.'
      : 'Your job will be visible to providers across the platform immediately.'

  const scheduleLabel   = SCHEDULE_LABELS[scheduleType] || scheduleType
  const scheduleDisplay = scheduleType === 'specific' && scheduledDate
    ? `${scheduleLabel} — ${formatDate(scheduledDate)}`
    : scheduleType === 'range' && dateFrom && dateTo
    ? `${formatDate(dateFrom)} – ${formatDate(dateTo)}`
    : scheduleLabel
  const budgetDisplay   = priceType === 'fixed' ? `${nzMoney(price)} (fixed price)` : 'Open to offers'

  const mapImgUri = areaPolygon.length > 0
    ? staticMapPolygonUrl(areaPolygon)
    : (latitude ? staticMapUrl(latitude, longitude, { zoom: 17 }) : null)

  // Step order: 1=JobType, 2=Location, 3=Details, 4=Budget, 5=Review
  // popCount = screens to pop from Step5 to reach that step
  const rows = [
    { label: 'Location',    value: locationSummary, popCount: 3 },
    { label: 'Category', value: shownCategory || 'Choosing from your title and details…',
      onEdit: () => { if (!submittingRef.current) setCategoryPicker(true) }, editLabel: 'Change' },
    { label: 'Title',       value: title,           popCount: 4 },
    { label: 'When',        value: scheduleDisplay, popCount: 4 },
    { label: 'Budget',      value: budgetDisplay,   popCount: 1 },
    photos.length > 0
      ? { label: 'Photos', value: `${photos.length} photo${photos.length !== 1 ? 's' : ''} attached`, popCount: 2 }
      : null,
    // The access note is entered on Details (step 3).
    locationNote ? { label: 'Access note', value: locationNote, popCount: 2 } : null,
    { label: 'Description', value: description,     popCount: 2 },
    // Materials are chosen on Budget (step 4).
    materialsType ? { label: 'Materials', value: MATERIALS_LABELS[materialsType] || materialsType, popCount: 1 } : null,
    accessConditions.length > 0
      ? { label: 'Site access', value: accessConditions.map(c => ACCESS_LABELS[c] || c).join(', '), popCount: 2 }
      : null,
  ].filter(Boolean)

  function handleBack() {
    if (submittingRef.current) return
    navigation.goBack()
  }

  // Reset the current stack to its root screen, clearing the whole wizard so
  // Back never walks back through the steps. Used after an edit save.
  function goToStackRoot() {
    const rootName = navigation.getState()?.routes?.[0]?.name
    if (rootName) navigation.reset({ index: 0, routes: [{ name: rootName }] })
  }

  function handleEditRow(popCount) {
    if (submittingRef.current) return
    navigation.pop(popCount)
  }

  async function handleSubmit() {
    // Claim the submit synchronously, before any await, so a second tap during
    // the auth and location checks can't start a second insert.
    if (submittingRef.current || !shownCategory) return
    await runSubmission(submittingRef,submitJob,
      ()=>setUploadStatus(isEditMode?'Saving changes…':'Posting job…'),()=>setUploadStatus(''),
      ()=>Alert.alert('Could not save job','Your changes are kept. Check your connection and try again.'))
  }

  async function submitJob() {
    const areaError=publicAreaError(locationArea,false)
    if(areaError){Alert.alert('Check public town or area',areaError);return}
    const textError=postingTextError(title,'title')||postingTextError(description,'description')
    if(textError){Alert.alert('Check job text',textError);return}
    const moneyError=priceType==='fixed'?moneyInputError(price,'Budget'):''
    if(moneyError){setUploadStatus('');Alert.alert('Check the budget',moneyError);return}
    const dateError=jobScheduleError({schedule_type:scheduleType,scheduled_date:scheduledDate,date_from:dateFrom,date_to:dateTo},isEditMode?editJob:null)
    if(dateError){setUploadStatus('');Alert.alert('Check the job dates',dateError);return}
    const { data: { user } } = await supabase.auth.getUser()

    if (!await confirmPublishingLocation({ latitude, longitude, area: locationArea || jobAddress, kind: 'job' }, user?.id, () => navigation.pop(3))) { setUploadStatus(''); return }

    // Category is auto-detected from the title + details (keep any existing one
    // on edit). Falls back to 'General Rural Help' if the AI call is unavailable.
    const resolvedCategory = shownCategory

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
        ? nzCalendarDay(scheduledDate)
        : null,
      date_from:         scheduleType === 'range' && dateFrom ? fmtDay(dateFrom) : null,
      date_to:           scheduleType === 'range' && dateTo   ? fmtDay(dateTo)   : null,
      materials_type:    materialsType || null,
      access_conditions: accessConditions.length > 0 ? accessConditions : null,
      hide_exact_location: !!hideExactLocation,
      location_area:       (locationArea || localityFromAddress(jobAddress)) || null,
      repeated_from_job_id: repeatedFromJobId || null,
      recurrence_frequency: recurrenceFrequency || 'one_time',
    }

    if (primaryPhotoRequired && (!user || !primaryPhoto || photos.length)) {
      Alert.alert('Primary photo required', 'Sign in and choose one primary photo, or continue without a photo.')
      return
    }
    if (!user) {
      // Save photos with the draft so they survive the login round-trip.
      const pendingPhotos = (photos || []).map(toStorablePhoto)
      await AsyncStorage.setItem('pendingJob', JSON.stringify({ ...payload, ...(draftJobId ? { id: draftJobId } : {}), _photos: pendingPhotos }))
      setUploadStatus('')          // sign-in interrupts the post; drop the busy state
      setShowAuthSheet(true)
      return
    }

    if (isEditMode && editJob?.visibility === 'invite_only') {
      setUploadStatus('Saving photos…')
      const {data:current,error:lookupError}=await supabase.rpc('list_job_private_photos',{p_job:editJob.id})
      if (lookupError || current.length + photos.length > 6) throw new Error('Could not check the gallery. Refresh and choose up to six photos in total.')
      const gallery=[...current]
      for (const photo of photos) {
        const id=galleryId(photo)
        let slot=0
        while (gallery.some(item=>item.slot===slot)) slot++
        const {checksum}=await jobPrimaryPhotoRequest('job-primary-media?action=stage-edit&job='+editJob.id,photo,id)
        gallery.push({id,slot,checksum})
      }
      const {data:saved,error}=await supabase.rpc('save_job_with_private_photos',{
        p_job:editJob.id,p_details:{...payload,photos:[]},p_expected:current.map(photo=>photo.id).sort(),p_photos:gallery,
      })
      if (error || saved!==editJob.id) throw new Error('Could not save the job and photos. Your changes are kept.')
      setUploadStatus('Saved')
      resetJobData()
      Alert.alert('Job updated','Your job has been updated.',[{text:'OK',onPress:goToStackRoot}])
      return true
    }

    if (isEditMode && editJob) {
      const { data, error } = await supabase
        .from('jobs').update(payload).eq('id', editJob.id).eq('requester_id', user.id).eq('status', 'open').select('id').maybeSingle()
      if (error || !data) {
        setUploadStatus('')
        Alert.alert('Could not save job changes', error?.message || 'The job is no longer editable. Your changes are still in this form.')
        return
      }

      setUploadStatus('Uploading photos...')
      const finalUrls = await uploadJobPhotos(editJob.id, photos)
      const photoWrite = await supabase.from('jobs').update({ photos: finalUrls }).eq('id', editJob.id).select('id').maybeSingle()
      if (photoWrite.error || !photoWrite.data || finalUrls.length < photos.length) {
        setUploadStatus('')
        Alert.alert('Some changes need attention', 'Job details were saved, but some photo changes could not be saved. Check your photos and try again.')
        return
      }
      await removeThumbnails(supabase, 'job-photos', removedThumbPaths(editJob.photos, finalUrls, 'job-photos'))

      setUploadStatus('Saved')
      resetJobData()
      Alert.alert('Job updated', 'Your job has been updated.', [
        { text: 'OK', onPress: goToStackRoot },
      ])
      return true
    }

    const visibility = isInvite ? (alsoPublic ? 'public' : 'invite_only') : 'public'

    // Insert under this session's own id. If an earlier attempt already landed
    // (its response was lost), the id clashes — that job is ours, so carry on
    // with it rather than posting a second copy.
    let newJob, insertError
    const privateGallery = isInvite && photos.length > 0
    if (primaryPhotoRequired || privateGallery) {
      setUploadStatus('Uploading primary photo…')
      const {checksum}=await jobPrimaryPhotoRequest('job-primary-media',primaryPhoto || photos[0],draftJobId)
      const gallery=[]
      if (privateGallery) {
        for (const [index,photo] of photos.slice(1).entries()) {
          const id=galleryId(photo)
          const {checksum}=await jobPrimaryPhotoRequest('job-primary-media?action=stage-gallery&job='+draftJobId,photo,id)
          gallery.push({id,slot:index+1,checksum})
        }
      }
      const {data,error}=await supabase.functions.invoke('job-primary-media?action=publish',{
        body:{draftId:draftJobId,checksum,gallery,details:payload,
          providerId:isInvite?inviteProviderId:null,publicListing:visibility==='public'},
        timeout:30000,
      })
      newJob=data?.id===draftJobId?{id:data.id}:null
      insertError=error||(!newJob?new Error('Could not confirm that the job was posted.'):null)
    } else if (isInvite) {
      const result = await supabase.rpc('create_invited_job', {
        p_job_id: draftJobId, p_details: payload, p_provider_id: inviteProviderId, p_public: alsoPublic,
      })
      newJob = result.data ? { id: result.data } : null
      insertError = result.error || (!newJob ? new Error('Could not confirm that the invitation was sent.') : null)
    } else {
      const result = await supabase
      .from('jobs')
      .insert({ ...payload, ...(draftJobId ? { id: draftJobId } : {}), requester_id: user.id, status: 'open', visibility })
      .select('id')
      .single()
      newJob=result.data
      insertError=result.error
    }
    if (!isInvite && !primaryPhotoRequired && insertError?.code === '23505' && draftJobId) {
      const { data: existing } = await supabase
        .from('jobs').select('id').eq('id', draftJobId).eq('requester_id', user.id).maybeSingle()
      if (existing) { newJob = existing; insertError = null }
    }
    if (insertError) { setUploadStatus(''); Alert.alert('Could not post job', insertError.message); return }

    let photosFailed = false
    if (photos.length > 0 && !privateGallery) {
      setUploadStatus('Uploading photos...')
      const finalUrls = await uploadJobPhotos(newJob.id, photos)
      photosFailed = finalUrls.length < photos.length
      if (finalUrls.length > 0) {
        const photoWrite = await supabase.from('jobs').update({ photos: finalUrls }).eq('id', newJob.id).select('id').maybeSingle()
        photosFailed ||= !!photoWrite.error || !photoWrite.data
      }
    }

    trackEvent('job_posted', { category: resolvedCategory, price_type: priceType, location: jobAddress, invited: isInvite, repeated: isRepeatMode })
    if (isRepeatMode) trackEvent('job_repeated', { source_job_id: repeatedFromJobId, category: resolvedCategory })
    trackCategoryInterest(resolvedCategory)
    setUploadStatus('Posted')
    resetJobData()

    const who = inviteProviderName || 'your provider'
    const successTitle = isInvite ? 'Invitation sent!' : isRepeatMode ? 'Job posted again!' : 'Job posted!'
    const successBody = isInvite
        ? (alsoPublic
            ? `${who} has been invited, and your job is also on the public board.`
            : `${who} has been invited. Only they can see this job.`)
        : 'Your job is live. Providers with matching capabilities and travel areas can now find it.'
    // A new post lands on the "Job posted" screen (confirmation + ease rating),
    // which ends in the same returnAfterPost behaviour via its returnTo param.
    navigation.replace('JobPosted', {
      jobId: newJob.id,
      title: successTitle,
      body: successBody + (photosFailed ? ' Some photos could not be saved. You can add them by editing the job.' : ''),
      returnTo: route.params?.origin,
    })
    return true
  }

  const submitLabel = uploadStatus || (isEditMode ? 'Save changes' : (isInvite ? 'Send invitation' : isRepeatMode ? 'Post repeated job' : 'Post job'))

  return (
    <View style={styles.screen}>
      <PostJobHeader
        currentStep={5}
        title={isEditMode ? 'Edit job' : route.params?.mode === 'repeat' ? 'Repeat a job' : 'Post a job'}
        onBack={handleBack}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}>

        {isRepeatMode && (
          <View style={styles.repeatNotice}>
            <Icon name="refresh-outline" size={18} color={colors.primary} />
            <Text style={styles.repeatNoticeText}>
              Based on your previous job. Check the details below before posting it again.
            </Text>
          </View>
        )}

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

        {mapImgUri && !mapFailed ? (
          <Image
            source={{ uri: mapImgUri }}
            style={styles.mapThumb}
            resizeMode="cover"
            onError={() => setMapFailed(true)}
          />
        ) : (
          <View style={styles.mapPlaceholder}>
            <Text style={styles.mapPlaceholderText}>
              <Icon name="location-outline" size={13} color={colors.textMuted} />{' '}
              {mapImgUri ? 'Map preview unavailable' : 'No location set'}
            </Text>
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
                {row.label === 'Category' && !category?.trim() && !houseSit && suggestedCategory && suggestion?.suggested
                  ? <Text style={styles.categoryHelp}>Suggested from your description. Change if needed.</Text> : null}
              </View>
              {row.onEdit !== null && (
                <TouchableOpacity
                  onPress={row.onEdit || (() => handleEditRow(row.popCount))}
                  accessibilityRole="button"
                  accessibilityLabel={`${row.editLabel || 'Edit'} ${row.label.toLowerCase()}`}
                  hitSlop={{ top: 8, bottom: 8, left: 16, right: 4 }}>
                  <Text style={styles.editLink}>{row.editLabel || 'Edit'}</Text>
                </TouchableOpacity>
              )}
            </View>
          ))}
        </View>

        {primaryPhotoRequired&&<JobPrimaryPhotoDraft photo={primaryPhoto} required disabled={!!uploadStatus}
          allowSuggestion={false} onPhoto={photo=>updateJobData({primaryPhoto:photo})}
          onManual={()=>updateJobData({primaryPhoto:null,primaryPhotoRequired:false})}/>}
        {!primaryPhotoRequired && photos.length === 0 && (
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
          <Icon name="information-circle-outline" size={18} color={colors.info} />
          <Text style={styles.infoText}>
            {publicationMessage}
          </Text>
        </View>

        {isEditMode && editBidCount > 0 && (
          <View style={styles.warningBox}>
            <Text style={styles.warningText}>
              <Icon name="warning-outline" size={14} color={colors.warning} /> This job has {editBidCount} offer{editBidCount > 1 ? 's' : ''}. Editing may affect existing offers.
            </Text>
          </View>
        )}
      </ScrollView>

      <Modal visible={categoryPicker} transparent animationType="fade" onRequestClose={() => setCategoryPicker(false)}>
        <View style={styles.categoryBackdrop}>
          <View style={styles.categorySheet}>
            <Text style={styles.categoryTitle}>Choose a category</Text>
            <Text style={styles.categoryHelp}>Providers are matched to jobs by category, so the right one helps the right people find it.</Text>
            <ScrollView style={styles.categoryList}>
              {CATEGORIES.map(name => (
                <TouchableOpacity
                  key={name}
                  style={styles.categoryRow}
                  onPress={() => { updateJobData({ category: name }); setCategoryPicker(false) }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: name === shownCategory }}>
                  <Text style={[styles.categoryName, name === shownCategory && styles.categoryNameOn]}>{name}</Text>
                  {name === shownCategory ? <Icon name="checkmark" size={18} color={colors.primary} /> : null}
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.categoryCancel} onPress={() => setCategoryPicker(false)} accessibilityRole="button">
              <Text style={styles.editLink}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        {!!uploadStatus && <Text style={styles.postingStatus} accessibilityLiveRegion="polite">{uploadStatus}</Text>}
        <View style={styles.footerBtns}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={handleBack}
            accessibilityRole="button"
            accessibilityLabel="Go back">
            <Text style={styles.backBtnText}><Icon name="chevron-back" size={14} color={colors.textSecondary} /> Back</Text>
          </TouchableOpacity>
          <Button
            title={submitLabel}
            onPress={handleSubmit}
            loading={!!uploadStatus}
            disabled={!!uploadStatus || !shownCategory}
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
  repeatNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    backgroundColor: colors.primaryLight,
    borderWidth: 1,
    borderColor: '#c3e6d4',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  repeatNoticeText: { flex: 1, color: colors.textSecondary, fontSize: 13, lineHeight: 18 },

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

  // Informational, not a warning — kept visually distinct from the amber photo
  // reminder that sits next to it.
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.infoLight,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.info,
    gap: 10,
    marginBottom: 12,
  },
  infoText: { flex: 1, fontSize: 13, color: colors.info, lineHeight: 19 },
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
  postingStatus:    { color: colors.textPrimary, marginBottom: 8, fontWeight: '600' },
  footerBtns:        { flexDirection: 'row', gap: 10 },
  // Neutral so it doesn't compete with the primary green "Post job".
  backBtn:           { borderWidth: 1.5, borderColor: colors.border, borderRadius: 12, paddingVertical: 15, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center', minHeight: 52 },
  backBtnText:       { color: colors.textSecondary, fontSize: 14, fontWeight: '600' },

  categoryBackdrop: { flex: 1, backgroundColor: 'rgba(12,28,22,0.48)', justifyContent: 'center', padding: 20 },
  categorySheet:    { backgroundColor: colors.white, borderRadius: 16, padding: 20, maxHeight: '80%' },
  categoryTitle:    { fontSize: 20, fontWeight: '700', color: colors.textPrimary, marginBottom: 6 },
  categoryHelp:     { fontSize: 13, lineHeight: 18, color: colors.textSecondary, marginBottom: 10 },
  categoryList:     { flexGrow: 0 },
  categoryRow:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 46, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  categoryName:     { flex: 1, fontSize: 15, color: colors.textPrimary },
  categoryNameOn:   { fontWeight: '700', color: colors.primary },
  categoryCancel:   { alignSelf: 'flex-end', paddingTop: 14 },
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
