import React, { useRef, useState } from 'react'
import {
  Alert,
  Animated,
  ActivityIndicator,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import DateTimePicker from '@react-native-community/datetimepicker'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import * as ImagePicker from 'expo-image-picker'
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator'
import { supabase } from '../lib/supabase'
import { colors } from '../theme/tokens'

const { width: SCREEN_WIDTH } = Dimensions.get('window')

const CATEGORIES = ['Machinery', 'Labour', 'Water delivery', 'Animal care', 'Maintenance', 'Fencing', 'Other']
const PRICING_TYPES = [
  { id: 'quote_required', label: 'Quote required' },
  { id: 'hourly', label: 'Hourly' },
  { id: 'per_unit', label: 'Per unit' },
  { id: 'fixed', label: 'Fixed' },
  { id: 'day_rate', label: 'Day rate' },
]
const STEP_LABELS = ['Service', 'Details', 'Price', 'Location', 'Equipment', 'Review']
const AI_FUNCTION_NAME = 'create-service-draft-from-photo'

function getPhotoUri(photo) {
  return typeof photo === 'string' ? photo : photo?.uri
}

function normalizePickedAsset(asset) {
  return {
    uri: asset.uri,
    base64: asset.base64 || null,
    mimeType: asset.mimeType || 'image/jpeg',
    fileName: asset.fileName || `service-photo-${Date.now()}.jpg`,
  }
}

async function preparePhotoForDraft(asset) {
  const resized = await manipulateAsync(
    asset.uri,
    [{ resize: { width: 1200 } }],
    { compress: 0.72, format: SaveFormat.JPEG, base64: true }
  )

  return {
    uri: resized.uri,
    base64: resized.base64 || asset.base64 || null,
    mimeType: 'image/jpeg',
    fileName: `service-draft-${Date.now()}.jpg`,
  }
}

function toDateValue(value) {
  if (!value) return null
  if (Array.isArray(value)) {
    for (const item of value) {
      const parsed = toDateValue(item)
      if (parsed) return parsed
    }
    return null
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value
  if (typeof value === 'number' || typeof value === 'string') {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }
  if (value?.nativeEvent?.timestamp) {
    const parsed = new Date(value.nativeEvent.timestamp)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }
  return null
}

function formatDisplayDate(value) {
  const date = toDateValue(value)
  if (!date) return ''
  return date.toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

function formatAvailabilityPayload(value) {
  const date = toDateValue(value)
  return date ? [date.toISOString().split('T')[0]] : null
}

function formatMissingField(field) {
  const value = String(field || '').replace(/_/g, ' ').trim().toLowerCase()
  if (!value) return null
  if (value.includes('service area') || value === 'location') return 'Add service area'
  if (value.includes('pricing') || value.includes('rate')) return 'Confirm pricing'
  if (value.includes('availability')) return 'Add availability'
  if (value.includes('title')) return 'Add service title'
  if (value.includes('category')) return 'Choose category'
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function base64ToArrayBuffer(base64) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  const clean = base64.replace(/=+$/, '')
  const bytes = []
  let buffer = 0
  let bits = 0

  for (let i = 0; i < clean.length; i++) {
    const value = chars.indexOf(clean[i])
    if (value < 0) continue
    buffer = (buffer << 6) | value
    bits += 6
    if (bits >= 8) {
      bits -= 8
      bytes.push((buffer >> bits) & 0xff)
    }
  }

  return new Uint8Array(bytes).buffer
}

export default function CreateServiceScreen({ navigation, route }) {
  const insets = useSafeAreaInsets()
  const editingService = route?.params?.service || null
  const isEditing = !!editingService?.id
  const [creationMode, setCreationMode] = useState(isEditing ? 'manual' : (route?.params?.startMode || 'choose'))
  const [sourcePhoto, setSourcePhoto] = useState(null)
  const [draftSource, setDraftSource] = useState(isEditing ? 'manual' : null)
  const [draftMissingFields, setDraftMissingFields] = useState([])
  const [draftConfidenceNotes, setDraftConfidenceNotes] = useState([])
  const [creatingDraft, setCreatingDraft] = useState(false)
  const [draftError, setDraftError] = useState('')
  const [step, setStep] = useState(1)

  const [title, setTitle] = useState(editingService?.title || '')
  const [category, setCategory] = useState(editingService?.category || '')
  const [description, setDescription] = useState(editingService?.description || '')
  const [photos, setPhotos] = useState(Array.isArray(editingService?.photos) ? editingService.photos : [])

  const [pricingType, setPricingType] = useState(editingService?.pricing_type || '')
  const [rate, setRate] = useState(editingService?.rate != null ? String(editingService.rate) : '')
  const [unitLabel, setUnitLabel] = useState(editingService?.unit_label || '')
  const [locationName, setLocationName] = useState(editingService?.location_name || '')
  const [travelRange, setTravelRange] = useState(editingService?.travel_range_km != null ? String(editingService.travel_range_km) : '')
  const [availableFrom,   setAvailableFrom]   = useState(toDateValue(editingService?.availability))
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [includesEquipment, setIncludesEquipment] = useState(!!editingService?.includes_equipment)
  const [serviceActive, setServiceActive] = useState(editingService?.is_active !== false)

  const [submitting, setSubmitting] = useState(false)
  const stepTranslateX = useRef(new Animated.Value(0)).current

  function animateStep(newStep, direction) {
    const outTo = direction === 'forward' ? -SCREEN_WIDTH : SCREEN_WIDTH
    const inFrom = direction === 'forward' ? SCREEN_WIDTH : -SCREEN_WIDTH
    Animated.timing(stepTranslateX, { toValue: outTo, duration: 180, useNativeDriver: true }).start(({ finished }) => {
      if (!finished) return
      setStep(newStep)
      stepTranslateX.setValue(inFrom)
      Animated.timing(stepTranslateX, { toValue: 0, duration: 180, useNativeDriver: true }).start()
    })
  }

  function canProceed() {
    if (step === 1) return !!(title.trim() && category)
    if (step === 2) return true
    if (step === 3) return !!(pricingType && (pricingType === 'quote_required' || rate.trim()))
    if (step === 4) return !!locationName.trim()
    if (step === 5) return true
    if (step === 6) return !!(title.trim() && category && pricingType && (pricingType === 'quote_required' || rate.trim()) && locationName.trim())
    return true
  }

  function formatRate() {
    if (pricingType === 'quote_required') return 'Quote required'
    if (pricingType === 'hourly') return `$${rate}/hr`
    if (pricingType === 'day_rate') return `$${rate}/day`
    if (pricingType === 'per_unit') return `$${rate}/${unitLabel || 'unit'}`
    return `$${rate} fixed`
  }

  function normalizeCategory(value) {
    if (!value) return ''
    const found = CATEGORIES.find(cat => cat.toLowerCase() === String(value).toLowerCase())
    return found || 'Other'
  }

  function normalizePricingType(value) {
    const v = String(value || '').toLowerCase()
    if (v === 'hourly') return 'hourly'
    if (v === 'fixed') return 'fixed'
    if (v === 'quote_required' || v === 'unknown') return 'quote_required'
    if (v === 'day_rate' || v === 'per_day') return 'day_rate'
    if (v === 'per_unit' || v === 'per_load' || v === 'per_job') return 'per_unit'
    return ''
  }

  function applyAiDraft(draft) {
    const nextTitle = draft?.title || ''
    const nextCategory = normalizeCategory(draft?.category)
    const nextDescription = draft?.full_description || draft?.description || draft?.short_description || ''
    const nextPricingType = normalizePricingType(draft?.pricing_type)
    const nextRate = draft?.price_amount != null ? String(draft.price_amount) : ''
    const nextLocation = draft?.service_area || draft?.location_name || ''
    const nextEquipment = Array.isArray(draft?.equipment) ? draft.equipment.length > 0 : !!draft?.includes_equipment

    setTitle(nextTitle)
    setCategory(nextCategory)
    setDescription(nextDescription)
    setPricingType(nextPricingType)
    setRate(nextPricingType === 'quote_required' ? '' : nextRate)
    setUnitLabel(nextPricingType === 'per_unit' ? (draft?.unit_label || 'job') : '')
    setLocationName(nextLocation)
    setTravelRange(draft?.travel_range_km != null ? String(draft.travel_range_km) : '')
    setIncludesEquipment(nextEquipment)
    setDraftMissingFields(Array.isArray(draft?.missing_fields) ? draft.missing_fields.map(formatMissingField).filter(Boolean) : [])
    setDraftConfidenceNotes(Array.isArray(draft?.confidence_notes) ? draft.confidence_notes : [])
    setDraftSource('photo')
    setCreationMode('manual')
    setStep(6)
  }

  async function chooseSourcePhoto(fromCamera) {
    setDraftError('')
    try {
      const permission = fromCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync()

      if (permission.status !== 'granted') {
        Alert.alert('Permission needed', `Please allow ${fromCamera ? 'camera' : 'photo'} access to create a draft from a photo.`)
        return
      }

      const result = fromCamera
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], base64: true, quality: 0.8, allowsEditing: true })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], base64: true, quality: 0.8, allowsEditing: true })

      if (!result.canceled) {
        const picked = normalizePickedAsset(result.assets[0])
        const prepared = await preparePhotoForDraft(picked)
        setSourcePhoto(prepared)
      }
    } catch (error) {
      Alert.alert('Photo unavailable', error?.message || 'Could not open the camera or photo library.')
    }
  }

  async function createDraftFromPhoto() {
    if (!sourcePhoto?.base64) {
      Alert.alert('Photo not ready', 'Please choose a photo with readable service details.')
      return
    }

    setCreatingDraft(true)
    setDraftError('')
    const approxBytes = Math.round((sourcePhoto.base64.length * 3) / 4)
    const { data, error } = await supabase.functions.invoke(AI_FUNCTION_NAME, {
      body: {
        image_base64: sourcePhoto.base64,
        mime_type: sourcePhoto.mimeType || 'image/jpeg',
        image_size_bytes: approxBytes,
      },
    })
    setCreatingDraft(false)

    if (error) {
      setDraftError(error.message || 'The draft assistant is not available yet.')
      setPhotos(prev => prev.length >= 4 ? prev : [...prev, sourcePhoto])
      setDraftMissingFields(['Add service title', 'Choose category', 'Add service area', 'Add pricing'])
      return
    }

    setPhotos(prev => prev.length >= 4 ? prev : [...prev, sourcePhoto])
    applyAiDraft(data?.draft || data)
  }

  function renderStartChoice() {
    return (
      <View style={styles.screen}>
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity
            style={styles.headerBackBtn}
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Cancel and go back">
            <Text style={styles.headerBackBtnText}>Back</Text>
          </TouchableOpacity>
          <Text style={styles.kicker}>DIFM Rural</Text>
          <Text style={styles.headerTitle} accessibilityRole="header">Advertise a service</Text>
          <Text style={styles.headerSub}>How would you like to start?</Text>
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.startContent}>
          <TouchableOpacity
            style={styles.startOption}
            onPress={() => setCreationMode('manual')}
            accessibilityRole="button"
            accessibilityLabel="Create service manually">
            <View style={styles.startIconWrap}>
              <Text style={styles.startIcon}>+</Text>
            </View>
            <View style={styles.startCopy}>
              <Text style={styles.startTitle}>Create manually</Text>
              <Text style={styles.startBody}>Build your listing step by step.</Text>
            </View>
            <Text style={styles.startArrow}>{'>'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.startOption}
            onPress={() => setCreationMode('photo')}
            accessibilityRole="button"
            accessibilityLabel="Create service from photo">
            <View style={styles.startIconWrap}>
              <Text style={styles.startIcon}>[]</Text>
            </View>
            <View style={styles.startCopy}>
              <Text style={styles.startTitle}>Create from photo</Text>
              <Text style={styles.startBody}>Use a flyer, business card, sign, screenshot, or note.</Text>
            </View>
            <Text style={styles.startArrow}>{'>'}</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    )
  }

  function renderPhotoDraft() {
    return (
      <View style={styles.screen}>
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity
            style={styles.headerBackBtn}
            onPress={() => sourcePhoto ? setSourcePhoto(null) : setCreationMode('choose')}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Go back">
            <Text style={styles.headerBackBtnText}>Back</Text>
          </TouchableOpacity>
          <Text style={styles.kicker}>Photo-to-draft</Text>
          <Text style={styles.headerTitle} accessibilityRole="header">Create from photo</Text>
          <Text style={styles.headerSub}>Take or upload a clear photo that shows your service details.</Text>
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.startContent}>
          {sourcePhoto ? (
            <>
              <Image source={{ uri: sourcePhoto.uri }} style={styles.sourcePreview} />
              <Text style={styles.photoHint}>Make sure the text is clear and not cut off.</Text>
              {creatingDraft && (
                <View style={styles.draftProgress}>
                  <ActivityIndicator color={colors.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.draftProgressTitle}>Creating your draft...</Text>
                    <Text style={styles.draftProgressBody}>Reading the photo and finding service details.</Text>
                  </View>
                </View>
              )}
              {!!draftError && (
                <View style={styles.warningBox}>
                  <Text style={styles.warningTitle}>Draft assistant unavailable</Text>
                  <Text style={styles.warningText}>{draftError}</Text>
                  <Text style={styles.warningText}>You can still use this photo and fill the service in manually.</Text>
                </View>
              )}
              <View style={styles.footerRow}>
                <TouchableOpacity
                  style={styles.backBtn}
                  onPress={() => setSourcePhoto(null)}
                  disabled={creatingDraft}
                  accessibilityRole="button"
                  accessibilityLabel="Retake or choose another photo">
                  <Text style={styles.backBtnText}>Retake</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.nextBtn, creatingDraft && styles.btnDisabled]}
                  onPress={draftError ? () => { setDraftSource('photo'); setCreationMode('manual'); setStep(1) } : createDraftFromPhoto}
                  disabled={creatingDraft}
                  accessibilityRole="button"
                  accessibilityLabel="Use photo">
                  <Text style={styles.nextBtnText}>{draftError ? 'Use manually' : 'Use photo'}</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              <TouchableOpacity
                style={styles.photoChoice}
                onPress={() => chooseSourcePhoto(true)}
                accessibilityRole="button"
                accessibilityLabel="Take photo">
                <Text style={styles.photoChoiceTitle}>Take photo</Text>
                <Text style={styles.photoChoiceBody}>Capture a flyer, business card, sign, or handwritten note.</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.photoChoice}
                onPress={() => chooseSourcePhoto(false)}
                accessibilityRole="button"
                accessibilityLabel="Upload photo">
                <Text style={styles.photoChoiceTitle}>Upload photo</Text>
                <Text style={styles.photoChoiceBody}>Use a saved screenshot, poster, or service image.</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </View>
    )
  }

  async function pickPhoto(fromCamera = false) {
    if (photos.length >= 4) return
    const permission = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync()
    const { status } = permission
    if (status !== 'granted') {
      Alert.alert('Permission needed', `Please allow ${fromCamera ? 'camera' : 'photo'} access to add service photos.`)
      return
    }
    try {
      const result = fromCamera
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], base64: true, quality: 0.7, allowsEditing: true })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], base64: true, quality: 0.7 })
      if (!result.canceled) setPhotos(prev => [...prev, normalizePickedAsset(result.assets[0])])
    } catch (error) {
      Alert.alert('Photo unavailable', error?.message || `Could not open the ${fromCamera ? 'camera' : 'photo library'}.`)
    }
  }

  async function uploadPhotos(serviceId) {
    const urls = []
    let failed = 0
    let firstError = ''

    for (let i = 0; i < photos.length; i++) {
      try {
        const photo = photos[i]
        if (typeof photo === 'string') {
          urls.push(photo)
          continue
        }
        const ext = (photo.fileName || photo.uri || 'jpg').split('.').pop()?.split('?')[0]?.toLowerCase() || 'jpg'
        const path = `${serviceId}/${Date.now()}_${i}.${ext}`
        const fileData = photo.base64
          ? base64ToArrayBuffer(photo.base64)
          : await (await fetch(photo.uri)).arrayBuffer()
        const { error } = await supabase.storage
          .from('service-photos')
          .upload(path, fileData, { contentType: photo.mimeType || 'image/jpeg', upsert: false })
        if (error) {
          failed += 1
          if (!firstError) firstError = error.message || 'Storage upload failed.'
        } else {
          const { data: { publicUrl } } = supabase.storage.from('service-photos').getPublicUrl(path)
          urls.push(publicUrl)
        }
      } catch (error) {
        failed += 1
        if (!firstError) firstError = error?.message || 'Could not read the selected photo.'
      }
    }

    return { urls, failed, firstError }
  }

  async function handlePublish() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      Alert.alert('Sign in required', 'Please sign in to list a service.')
      return
    }

    setSubmitting(true)
    const publishRate = pricingType === 'quote_required' ? 0 : parseFloat(rate)
    const payload = {
      provider_id: user.id,
      title: title.trim(),
      description: description.trim() || null,
      category,
      location_name: locationName.trim(),
      travel_range_km: travelRange ? parseFloat(travelRange) : null,
      pricing_type: pricingType,
      rate: publishRate,
      unit_label: pricingType === 'per_unit' ? unitLabel.trim() || null : null,
      minimum_units: 1,
      includes_equipment: includesEquipment,
      payment_timing: 'on_completion',
      availability: formatAvailabilityPayload(availableFrom),
      is_active: isEditing ? serviceActive : true,
      ...(isEditing && photos.length === 0 ? { photos: [] } : {}),
    }

    const query = isEditing
      ? supabase
        .from('services')
        .update(payload)
        .eq('id', editingService.id)
        .eq('provider_id', user.id)
      : supabase.from('services').insert(payload)

    const { data: createdService, error } = await query.select().single()

    if (error) {
      setSubmitting(false)
      Alert.alert('Error', error.message)
      return
    }

    let serviceForRoute = createdService
    if (photos.length > 0) {
      const { urls, failed, firstError } = await uploadPhotos(createdService.id)
      if (urls.length > 0) {
        const { data: updatedService } = await supabase
          .from('services')
          .update({ photos: urls })
          .eq('id', createdService.id)
          .select()
          .single()
        serviceForRoute = updatedService || { ...createdService, photos: urls }
      }
      if (failed > 0) {
        Alert.alert('Some photos did not upload', firstError || `${failed} photo${failed === 1 ? '' : 's'} could not be uploaded.`)
      }
    }

    function leavePublishScreen() {
      if (isEditing) {
        navigation.goBack()
        return
      }

      const routeNames = navigation.getState()?.routeNames || []
      if (routeNames.includes('MyServices') && typeof navigation.replace === 'function') {
        navigation.replace('MyServices', { createdService: serviceForRoute })
        return
      }

      if (routeNames.includes('MyServices')) {
        navigation.navigate('MyServices', { createdService: serviceForRoute })
        return
      }

      navigation.getParent()?.navigate('Account', {
        screen: 'MyServices',
        params: { createdService: serviceForRoute },
      })
    }

    setSubmitting(false)
    Alert.alert(isEditing ? 'Service updated!' : 'Service published!', isEditing ? 'Your service has been updated.' : 'Your service is now live.', [
      { text: 'OK', onPress: leavePublishScreen },
    ])
  }

  async function handleDeleteService() {
    if (!isEditing || !editingService?.id) return

    const { data: bookingsData, error: bookingError } = await supabase
      .from('bookings')
      .select('id')
      .eq('service_id', editingService.id)
      .limit(1)

    if (bookingError) {
      Alert.alert('Could not check bookings', bookingError.message)
      return
    }

    if (bookingsData?.length > 0) {
      Alert.alert(
        'Cannot delete this service',
        'This service has booking history. Pause advertising instead so it stops showing to requesters while existing jobs and records remain available.'
      )
      return
    }

    Alert.alert(
      'Delete service',
      `Delete "${title || 'this service'}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) {
              Alert.alert('Sign in required', 'Please sign in again to delete this service.')
              return
            }

            const { error } = await supabase
              .from('services')
              .delete()
              .eq('id', editingService.id)
              .eq('provider_id', user.id)

            if (error) {
              Alert.alert('Could not delete service', error.message)
              return
            }

            Alert.alert('Service deleted', 'This service has been removed.', [
              { text: 'OK', onPress: () => navigation.goBack() },
            ])
          },
        },
      ]
    )
  }

  function renderProgress() {
    return (
      <View style={styles.progressWrap}>
        {[1, 2, 3, 4, 5, 6].map(s => (
          <View key={s} style={[styles.progressPill, s <= step && styles.progressPillActive]} />
        ))}
      </View>
    )
  }

  function renderStep1() {
    return (
      <>
        <Text style={styles.stepHeading}>What service can you offer?</Text>

        <Text style={styles.fieldLabel}>Service title</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Tractor topping with operator"
          placeholderTextColor={colors.textMuted}
          value={title}
          onChangeText={setTitle}
          autoCapitalize="sentences"
          accessibilityLabel="Service title"
        />

        <Text style={styles.fieldLabel}>Category</Text>
        <View style={styles.chipWrap}>
          {CATEGORIES.map(cat => (
            <TouchableOpacity
              key={cat}
              style={[styles.chip, category === cat && styles.chipActive]}
              onPress={() => setCategory(cat)}
              accessibilityRole="button"
              accessibilityState={{ selected: category === cat }}>
              <Text style={[styles.chipText, category === cat && styles.chipTextActive]}>{cat}</Text>
            </TouchableOpacity>
          ))}
        </View>

      </>
    )
  }

  function renderStep2() {
    return (
      <>
        <Text style={styles.stepHeading}>Add a short description</Text>

        <Text style={styles.fieldLabel}>Description <Text style={styles.optional}>(optional)</Text></Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          placeholder="What is included, what gear you use, and what area you cover..."
          placeholderTextColor={colors.textMuted}
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
          autoCapitalize="sentences"
          accessibilityLabel="Service description"
        />

        <Text style={styles.fieldLabel}>Photos <Text style={styles.optional}>(optional)</Text></Text>
        <View style={styles.photoGrid}>
          {photos.map((photo, idx) => (
            <View key={`${getPhotoUri(photo)}-${idx}`} style={styles.photoThumb}>
              <Image source={{ uri: getPhotoUri(photo) }} style={styles.photoImg} />
              <TouchableOpacity
                style={styles.photoRemove}
                onPress={() => setPhotos(prev => prev.filter((_, i) => i !== idx))}
                accessibilityRole="button"
                accessibilityLabel={`Remove photo ${idx + 1}`}>
                <Text style={styles.photoRemoveText}>x</Text>
              </TouchableOpacity>
            </View>
          ))}
          {photos.length < 4 && (
            <View style={styles.photoActionWrap}>
              <TouchableOpacity
                style={styles.photoAdd}
                onPress={() => pickPhoto(true)}
                accessibilityRole="button"
                accessibilityLabel="Take service photo">
                <Text style={styles.photoAddText}>Take photo</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.photoAdd}
                onPress={() => pickPhoto(false)}
                accessibilityRole="button"
                accessibilityLabel="Choose service photo">
                <Text style={styles.photoAddText}>Choose photo</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </>
    )
  }

  function renderStep3() {
    return (
      <>
        <Text style={styles.stepHeading}>How is it priced?</Text>

        <Text style={styles.fieldLabel}>Pricing</Text>
        <View style={styles.segmentGrid}>
          {PRICING_TYPES.map(pt => (
            <TouchableOpacity
              key={pt.id}
              style={[styles.segmentBtn, pricingType === pt.id && styles.segmentBtnActive]}
              onPress={() => setPricingType(pt.id)}
              accessibilityRole="button"
              accessibilityState={{ selected: pricingType === pt.id }}>
              <Text style={[styles.segmentText, pricingType === pt.id && styles.segmentTextActive]}>{pt.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {pricingType === 'quote_required' ? (
          <View style={styles.helpBox}>
            <Text style={styles.helpBoxTitle}>Requester will ask for a quote</Text>
            <Text style={styles.helpBoxText}>Use this when price depends on distance, job size, materials, or conditions.</Text>
          </View>
        ) : (
          <View style={styles.inlineRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>Rate</Text>
              <TextInput
                style={styles.input}
                placeholder="120"
                placeholderTextColor={colors.textMuted}
                value={rate}
                onChangeText={setRate}
                keyboardType="numeric"
                accessibilityLabel="Rate in NZD"
              />
            </View>
            {pricingType === 'per_unit' && (
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Unit</Text>
                <TextInput
                  style={styles.input}
                  placeholder="trough"
                  placeholderTextColor={colors.textMuted}
                  value={unitLabel}
                  onChangeText={setUnitLabel}
                  autoCapitalize="none"
                  accessibilityLabel="Unit label"
                />
              </View>
            )}
          </View>
        )}

      </>
    )
  }

  function renderStep4() {
    return (
      <>
        <Text style={styles.stepHeading}>Where is it available?</Text>

        <Text style={styles.fieldLabel}>Location</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Hawke's Bay"
          placeholderTextColor={colors.textMuted}
          value={locationName}
          onChangeText={setLocationName}
          autoCapitalize="words"
          autoCorrect={false}
          accessibilityLabel="Location"
        />

        <Text style={styles.fieldLabel}>Travel range <Text style={styles.optional}>(optional)</Text></Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. 50 km"
          placeholderTextColor={colors.textMuted}
          value={travelRange}
          onChangeText={setTravelRange}
          keyboardType="numeric"
          accessibilityLabel="Travel range in kilometres"
        />

        <Text style={styles.fieldLabel}>Available from <Text style={styles.optional}>(optional)</Text></Text>
        <TouchableOpacity
          style={styles.datePickerBtn}
          onPress={() => setShowDatePicker(true)}
          accessibilityRole="button"
          accessibilityLabel="Select available from date">
          <Text style={availableFrom ? styles.datePickerValue : styles.datePickerPlaceholder}>
            {formatDisplayDate(availableFrom) || 'Available now'}
          </Text>
          <Text style={styles.datePickerIcon}>📅</Text>
        </TouchableOpacity>
        {availableFrom && (
          <TouchableOpacity onPress={() => setAvailableFrom(null)} style={styles.clearDateBtn}>
            <Text style={styles.clearDateText}>Clear date</Text>
          </TouchableOpacity>
        )}
        {showDatePicker && (
          <>
            {Platform.OS === 'ios' && (
              <TouchableOpacity style={styles.pickerDoneBtn} onPress={() => setShowDatePicker(false)}>
                <Text style={styles.pickerDoneText}>Done</Text>
              </TouchableOpacity>
            )}
            <DateTimePicker
              value={toDateValue(availableFrom) || new Date()}
              mode="date"
              minimumDate={new Date()}
              onValueChange={(selected) => {
                if (Platform.OS === 'android') setShowDatePicker(false)
                const nextDate = toDateValue(selected)
                if (nextDate) setAvailableFrom(nextDate)
              }}
              onDismiss={() => setShowDatePicker(false)}
            />
          </>
        )}

      </>
    )
  }

  function renderStep5() {
    return (
      <>
        <Text style={styles.stepHeading}>Is equipment included?</Text>

        <Text style={styles.fieldLabel}>Equipment</Text>
        <View style={styles.segmentGrid}>
          <TouchableOpacity
            style={[styles.segmentBtn, !includesEquipment && styles.segmentBtnActive]}
            onPress={() => setIncludesEquipment(false)}
            accessibilityRole="button"
            accessibilityState={{ selected: !includesEquipment }}>
            <Text style={[styles.segmentText, !includesEquipment && styles.segmentTextActive]}>Labour only</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.segmentBtn, includesEquipment && styles.segmentBtnActive]}
            onPress={() => setIncludesEquipment(true)}
            accessibilityRole="button"
            accessibilityState={{ selected: includesEquipment }}>
            <Text style={[styles.segmentText, includesEquipment && styles.segmentTextActive]}>Equipment included</Text>
          </TouchableOpacity>
        </View>
      </>
    )
  }

  function renderStep6() {
    const missingItems = [
      !title.trim() && 'Add service title',
      !category && 'Choose category',
      !pricingType && 'Choose pricing type',
      pricingType !== 'quote_required' && !rate.trim() && 'Add rate',
      !locationName.trim() && 'Add service area',
      ...draftMissingFields,
    ].filter(Boolean)
    const uniqueMissingItems = [...new Set(missingItems)]
    const rows = [
      { label: 'Service', value: title },
      { label: 'Category', value: category },
      { label: 'Rate', value: formatRate() },
      { label: 'Location', value: locationName },
      travelRange && { label: 'Travel', value: `${travelRange} km` },
      { label: 'Equipment', value: includesEquipment ? 'Included' : 'Not included' },
      formatDisplayDate(availableFrom) && { label: 'Available', value: formatDisplayDate(availableFrom) },
      photos.length > 0 && { label: 'Photos', value: `${photos.length} photo${photos.length === 1 ? '' : 's'}` },
    ].filter(Boolean)

    return (
      <>
        <Text style={styles.stepHeading}>{draftSource === 'photo' ? 'Review your draft' : 'Ready to publish?'}</Text>
        {draftSource === 'photo' && (
          <View style={styles.sourceNote}>
            <Text style={styles.sourceNoteTitle}>Draft created from your photo</Text>
            <Text style={styles.sourceNoteText}>Please check every detail before publishing.</Text>
          </View>
        )}
        {uniqueMissingItems.length > 0 && (
          <View style={styles.missingCard}>
            <Text style={styles.missingTitle}>Needs your review</Text>
            {uniqueMissingItems.map(item => (
              <Text key={item} style={styles.missingItem}>- {item}</Text>
            ))}
            <View style={styles.reviewActions}>
              <TouchableOpacity style={styles.reviewActionBtn} onPress={() => setStep(1)}>
                <Text style={styles.reviewActionText}>Edit basics</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.reviewActionBtn} onPress={() => setStep(3)}>
                <Text style={styles.reviewActionText}>Edit pricing</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.reviewActionBtn} onPress={() => setStep(4)}>
                <Text style={styles.reviewActionText}>Edit area</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        {uniqueMissingItems.length === 0 && (
          <View style={styles.reviewActionsTop}>
            <TouchableOpacity style={styles.reviewActionBtn} onPress={() => setStep(1)}>
              <Text style={styles.reviewActionText}>Edit basics</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.reviewActionBtn} onPress={() => setStep(3)}>
              <Text style={styles.reviewActionText}>Edit pricing</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.reviewActionBtn} onPress={() => setStep(4)}>
              <Text style={styles.reviewActionText}>Edit area</Text>
            </TouchableOpacity>
          </View>
        )}
        <View style={styles.reviewCard}>
          {rows.map((row, i) => (
            <View key={row.label} style={[styles.reviewRow, i < rows.length - 1 && styles.reviewRowBorder]}>
              <Text style={styles.reviewLabel}>{row.label}</Text>
              <Text style={styles.reviewValue} numberOfLines={2}>{row.value}</Text>
            </View>
          ))}
        </View>
        {isEditing && (
          <View style={styles.managementCard}>
            <Text style={styles.managementTitle}>Service advertising</Text>
            <Text style={styles.managementBody}>
              {serviceActive
                ? 'This service is visible to requesters. Pause advertising while you make adjustments.'
                : 'This service is hidden from requesters. Existing bookings and chats are not cancelled.'}
            </Text>
            <TouchableOpacity
              style={[styles.pauseBtn, !serviceActive && styles.resumeBtn]}
              onPress={() => setServiceActive(prev => !prev)}
              accessibilityRole="button"
              accessibilityLabel={serviceActive ? 'Pause service advertising' : 'Resume service advertising'}>
              <Text style={[styles.pauseBtnText, !serviceActive && styles.resumeBtnText]}>
                {serviceActive ? 'Pause advertising' : 'Resume advertising'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.deleteServiceBtn}
              onPress={handleDeleteService}
              accessibilityRole="button"
              accessibilityLabel="Delete service">
              <Text style={styles.deleteServiceText}>Delete service</Text>
            </TouchableOpacity>
          </View>
        )}
        {!!description && (
          <View style={styles.descCard}>
            <Text style={styles.reviewLabel}>Description</Text>
            <Text style={styles.descText}>{description}</Text>
          </View>
        )}
        {draftConfidenceNotes.length > 0 && (
          <View style={styles.descCard}>
            <Text style={styles.reviewLabel}>Notes</Text>
            {draftConfidenceNotes.map(note => (
              <Text key={note} style={styles.descText}>- {note}</Text>
            ))}
          </View>
        )}
      </>
    )
  }

  const RENDERERS = [renderStep1, renderStep2, renderStep3, renderStep4, renderStep5, renderStep6]

  if (creationMode === 'choose') return renderStartChoice()
  if (creationMode === 'photo') return renderPhotoDraft()

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity
          style={styles.headerBackBtn}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Cancel and go back">
          <Text style={styles.headerBackBtnText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.kicker}>DIFM Rural</Text>
        <Text style={styles.headerTitle} accessibilityRole="header">{isEditing ? 'Edit service' : 'Advertise a service'}</Text>
        <Text style={styles.headerSub}>{STEP_LABELS[step - 1]}</Text>
        {renderProgress()}
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}>
        <Animated.View style={[{ flex: 1 }, { transform: [{ translateX: stepTranslateX }] }]}>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 150 }]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive">
            {RENDERERS[step - 1]()}
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>

      <SafeAreaView edges={['bottom']} style={styles.footer}>
        {step === 1 ? (
          <TouchableOpacity
            style={[styles.nextBtnFull, !canProceed() && styles.btnDisabled]}
            onPress={() => animateStep(2, 'forward')}
            disabled={!canProceed()}
            accessibilityRole="button"
            accessibilityLabel="Next step">
            <Text style={styles.nextBtnText}>Next</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.footerRow}>
            <TouchableOpacity
              style={styles.backBtn}
              onPress={() => animateStep(step - 1, 'backward')}
              accessibilityRole="button"
              accessibilityLabel="Previous step">
              <Text style={styles.backBtnText}>Back</Text>
            </TouchableOpacity>
            {step < 6 ? (
              <TouchableOpacity
                style={[styles.nextBtn, !canProceed() && styles.btnDisabled]}
                onPress={() => animateStep(step + 1, 'forward')}
                disabled={!canProceed()}
                accessibilityRole="button"
                accessibilityLabel="Next step">
                <Text style={styles.nextBtnText}>Next</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.nextBtn, (submitting || !canProceed()) && styles.btnDisabled]}
                onPress={handlePublish}
                disabled={submitting || !canProceed()}
                accessibilityRole="button"
                accessibilityLabel="Publish service">
                <Text style={styles.nextBtnText}>{submitting ? 'Saving...' : isEditing ? 'Save' : 'Publish'}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </SafeAreaView>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: 20, paddingBottom: 14, backgroundColor: colors.background },
  headerBackBtn: { minHeight: 36, justifyContent: 'center', alignSelf: 'flex-start', marginBottom: 4 },
  headerBackBtnText: { color: colors.primary, fontSize: 15, fontWeight: '700' },
  kicker: { fontSize: 13, fontWeight: '700', color: colors.primary, marginBottom: 8 },
  headerTitle: { fontSize: 34, lineHeight: 38, fontWeight: '700', color: colors.textPrimary, letterSpacing: 0 },
  headerSub: { fontSize: 15, lineHeight: 22, color: colors.textSecondary, marginTop: 8, marginBottom: 14 },
  progressWrap: { flexDirection: 'row', gap: 8 },
  progressPill: { flex: 1, height: 6, borderRadius: 999, backgroundColor: colors.border },
  progressPillActive: { backgroundColor: colors.primary },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 28 },
  stepHeading: { fontSize: 24, lineHeight: 30, fontWeight: '700', color: colors.textPrimary, marginBottom: 16, letterSpacing: 0 },
  fieldLabel: { fontSize: 14, fontWeight: '700', color: colors.textPrimary, marginBottom: 8, marginTop: 14 },
  optional: { fontSize: 13, fontWeight: '400', color: colors.textMuted },
  input: {
    backgroundColor: colors.white,
    borderRadius: 14,
    padding: 15,
    fontSize: 16,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.textPrimary,
  },
  multiline: { minHeight: 96, textAlignVertical: 'top' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    minHeight: 44,
    justifyContent: 'center',
  },
  chipActive: { backgroundColor: colors.textPrimary, borderColor: colors.textPrimary },
  chipText: { color: colors.textSecondary, fontSize: 13, fontWeight: '700' },
  chipTextActive: { color: colors.white },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  photoActionWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, flex: 1, minWidth: 180 },
  photoThumb: { width: 82, height: 82, borderRadius: 12, position: 'relative' },
  photoImg: { width: 82, height: 82, borderRadius: 12, backgroundColor: colors.border },
  photoRemove: {
    position: 'absolute',
    top: -7,
    right: -7,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoRemoveText: { color: colors.white, fontSize: 14, fontWeight: '700', lineHeight: 16 },
  photoAdd: {
    width: 116,
    height: 82,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  photoAddText: { fontSize: 13, color: colors.primary, fontWeight: '700', textAlign: 'center' },
  segmentGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  segmentBtn: {
    flexGrow: 1,
    minWidth: '47%',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentBtnActive: { backgroundColor: colors.textPrimary, borderColor: colors.textPrimary },
  segmentText: { color: colors.textSecondary, fontSize: 13, fontWeight: '700' },
  segmentTextActive: { color: colors.white },
  inlineRow: { flexDirection: 'row', gap: 10 },
  reviewCard: { backgroundColor: colors.white, borderRadius: 16, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  reviewRow: { flexDirection: 'row', paddingVertical: 14, paddingHorizontal: 16, alignItems: 'flex-start' },
  reviewRowBorder: { borderBottomWidth: 1, borderBottomColor: '#f2f2f2' },
  reviewLabel: { fontSize: 13, color: colors.textMuted, fontWeight: '700', width: 88, flexShrink: 0 },
  reviewValue: { fontSize: 14, color: colors.textPrimary, flex: 1, fontWeight: '600', textAlign: 'right' },
  managementCard: {
    backgroundColor: colors.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginTop: 12,
    gap: 10,
  },
  managementTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  managementBody: { fontSize: 13, lineHeight: 20, color: colors.textSecondary },
  pauseBtn: {
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.primary,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 46,
  },
  resumeBtn: { backgroundColor: colors.primary },
  pauseBtnText: { fontSize: 14, fontWeight: '700', color: colors.primary },
  resumeBtnText: { color: colors.white },
  deleteServiceBtn: {
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.danger,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 46,
  },
  deleteServiceText: { fontSize: 14, fontWeight: '700', color: colors.danger },
  descCard: { backgroundColor: colors.white, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 16, marginTop: 12 },
  descText: { fontSize: 14, color: colors.textSecondary, lineHeight: 22, marginTop: 8 },
  footer: { backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.border, padding: 16 },
  footerRow: { flexDirection: 'row', gap: 12 },
  backBtn: { paddingVertical: 16, paddingHorizontal: 20, borderRadius: 12, borderWidth: 1, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center', minHeight: 52 },
  backBtnText: { color: colors.primary, fontSize: 15, fontWeight: '700' },
  nextBtn: { flex: 1, backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 16, alignItems: 'center', minHeight: 52, justifyContent: 'center' },
  nextBtnFull: { backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 16, alignItems: 'center', minHeight: 52, justifyContent: 'center' },
  nextBtnText: { color: colors.white, fontSize: 16, fontWeight: '700' },
  btnDisabled: { backgroundColor: '#a8cfc0' },
  datePickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.white,
    borderRadius: 14,
    padding: 15,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 52,
  },
  datePickerValue:       { fontSize: 16, color: colors.textPrimary, flex: 1 },
  datePickerPlaceholder: { fontSize: 16, color: colors.textMuted, flex: 1 },
  datePickerIcon:        { fontSize: 18, marginLeft: 8 },
  pickerDoneBtn:         { alignSelf: 'flex-end', paddingHorizontal: 16, paddingVertical: 8 },
  pickerDoneText:        { fontSize: 16, fontWeight: '600', color: colors.primary },
  clearDateBtn:          { marginTop: 6, paddingVertical: 4 },
  clearDateText:         { fontSize: 13, color: colors.textMuted, textDecorationLine: 'underline' },
  startContent: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 28, gap: 12 },
  startOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    minHeight: 92,
    gap: 12,
  },
  startIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  startIcon: { color: colors.primary, fontSize: 24, fontWeight: '700', lineHeight: 28 },
  startCopy: { flex: 1 },
  startTitle: { fontSize: 17, fontWeight: '700', color: colors.textPrimary, marginBottom: 4 },
  startBody: { fontSize: 14, lineHeight: 20, color: colors.textSecondary },
  startArrow: { fontSize: 22, color: colors.textMuted, fontWeight: '700' },
  photoChoice: {
    backgroundColor: colors.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
    minHeight: 96,
    justifyContent: 'center',
  },
  photoChoiceTitle: { fontSize: 17, fontWeight: '700', color: colors.textPrimary, marginBottom: 6 },
  photoChoiceBody: { fontSize: 14, lineHeight: 21, color: colors.textSecondary },
  sourcePreview: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: 14,
    backgroundColor: colors.border,
  },
  photoHint: { fontSize: 13, lineHeight: 19, color: colors.textMuted, marginTop: 10, marginBottom: 14 },
  draftProgress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.primaryLight,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  draftProgressTitle: { fontSize: 14, fontWeight: '700', color: colors.primaryDark, marginBottom: 2 },
  draftProgressBody: { fontSize: 13, lineHeight: 18, color: colors.textSecondary },
  warningBox: {
    backgroundColor: colors.warningLight,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#f2d2a2',
    padding: 14,
    marginBottom: 12,
  },
  warningTitle: { fontSize: 14, fontWeight: '700', color: colors.warning, marginBottom: 6 },
  warningText: { fontSize: 13, lineHeight: 19, color: colors.textSecondary, marginBottom: 4 },
  sourceNote: {
    backgroundColor: colors.infoLight,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  sourceNoteTitle: { fontSize: 14, fontWeight: '700', color: colors.info, marginBottom: 4 },
  sourceNoteText: { fontSize: 13, lineHeight: 19, color: colors.textSecondary },
  missingCard: {
    backgroundColor: colors.warningLight,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  missingTitle: { fontSize: 14, fontWeight: '700', color: colors.warning, marginBottom: 8 },
  missingItem: { fontSize: 13, lineHeight: 20, color: colors.textSecondary },
  helpBox: {
    backgroundColor: colors.primaryLight,
    borderRadius: 12,
    padding: 14,
    marginTop: 14,
  },
  helpBoxTitle: { fontSize: 14, fontWeight: '700', color: colors.primaryDark, marginBottom: 5 },
  helpBoxText: { fontSize: 13, lineHeight: 19, color: colors.textSecondary },
  reviewActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  reviewActionsTop: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  reviewActionBtn: {
    backgroundColor: colors.white,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 9,
    minHeight: 40,
    justifyContent: 'center',
  },
  reviewActionText: { color: colors.primary, fontSize: 13, fontWeight: '700' },
})
