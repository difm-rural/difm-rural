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
import Icon from '../components/Icon'
import Button from '../components/Button'
import { CATEGORIES } from '../lib/categories'
import { categoryImage } from '../lib/categoryImages'

const { width: SCREEN_WIDTH } = Dimensions.get('window')

const PRICING_TYPES = [
  { id: 'fixed', label: 'Fixed price' },
  { id: 'hourly', label: 'Hourly rate' },
  { id: 'per_unit', label: 'Per load/unit' },
  { id: 'quote_required', label: 'Estimate / quote' },
]
const PAYMENT_OPTIONS = [
  { id: 'upfront', label: 'Pay upfront' },
  { id: 'on_completion', label: 'On completion' },
]
const MATERIALS_OPTIONS = [
  { id: 'included', label: 'Included' },
  { id: 'estimate', label: 'Extra estimate' },
  { id: 'requester_supplies', label: 'Requester supplies' },
]
const materialsLabel = (id) => MATERIALS_OPTIONS.find(o => o.id === id)?.label || '—'
const STEP_LABELS = ['Service', 'Details', 'Price', 'Location', 'Review']
const CARD_TREATMENTS = [
  { id: 'bold', label: 'Bold overlay' },
  { id: 'bottom', label: 'Bottom band' },
  { id: 'clean', label: 'Clean panel' },
]
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
    listingPhoto: asset,
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

function buildWebsiteCardOptions(draft) {
  const supplied = Array.isArray(draft?.card_options) ? draft.card_options : []
  const styles = ['bold', 'bottom', 'clean']
  const labels = ['Bold headline', 'Practical', 'Warm & direct']
  const fallbacks = [
    { headline: draft?.short_description || draft?.title || 'Local rural service', supporting_text: draft?.full_description || '' },
    { headline: draft?.title || 'Ready when you need a hand', supporting_text: draft?.short_description || draft?.full_description || '' },
    { headline: `Need help with ${String(draft?.title || 'your property').toLowerCase()}?`, supporting_text: draft?.short_description || '' },
  ]
  return styles.map((style, index) => {
    const option = supplied[index] || fallbacks[index]
    return {
      label: option?.label || labels[index],
      headline: String(option?.headline || fallbacks[index].headline).slice(0, 55),
      supporting_text: String(option?.supporting_text || fallbacks[index].supporting_text).slice(0, 125),
      style,
    }
  })
}

async function edgeFunctionErrorMessage(error, fallback) {
  try {
    const body = await error?.context?.clone?.().json()
    return body?.error || error?.message || fallback
  } catch {
    return error?.message || fallback
  }
}

export default function CreateServiceScreen({ navigation, route }) {
  const insets = useSafeAreaInsets()
  const editingService = route?.params?.service || null
  const isEditing = !!editingService?.id
  const [creationMode, setCreationMode] = useState(isEditing ? 'manual' : (route?.params?.startMode || 'choose'))
  const [sourcePhoto, setSourcePhoto] = useState(null)
  const [useSourceAsPhoto, setUseSourceAsPhoto] = useState(false)
  const [websiteInput, setWebsiteInput] = useState('')
  const [websiteError, setWebsiteError] = useState('')
  const [websiteDraftPreview, setWebsiteDraftPreview] = useState(null)
  const [useWebsiteImage, setUseWebsiteImage] = useState(false)
  const [websiteImageError, setWebsiteImageError] = useState(false)
  const [websiteCardOptions, setWebsiteCardOptions] = useState([])
  const [selectedWebsiteCard, setSelectedWebsiteCard] = useState(0)
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
  const [cardHeadline, setCardHeadline] = useState(editingService?.card_headline || '')
  const [cardSupportingText, setCardSupportingText] = useState(editingService?.card_supporting_text || '')
  const [cardStyle, setCardStyle] = useState(editingService?.card_style || null)

  const [pricingType, setPricingType] = useState(normalizePricingType(editingService?.pricing_type))
  const [rate, setRate] = useState(editingService?.rate != null ? String(editingService.rate) : '')
  const [unitLabel, setUnitLabel] = useState(editingService?.unit_label || '')
  const [paymentTiming, setPaymentTiming] = useState(editingService?.payment_timing || 'on_completion')
  const [materials, setMaterials] = useState(editingService?.materials || 'included')
  const [locationName, setLocationName] = useState(editingService?.location_name || '')
  const [travelRange, setTravelRange] = useState(editingService?.travel_range_km != null ? String(editingService.travel_range_km) : '')
  const [availableFrom,   setAvailableFrom]   = useState(toDateValue(editingService?.availability))
  const [showDatePicker, setShowDatePicker] = useState(false)
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
    if (step === 5) return !!(title.trim() && category && pricingType && (pricingType === 'quote_required' || rate.trim()) && locationName.trim())
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
    if (v === 'day_rate' || v === 'per_day') return 'fixed'   // day rate folded into fixed for preview
    if (v === 'per_unit' || v === 'per_load' || v === 'per_job') return 'per_unit'
    return ''
  }

  function applyAiDraft(draft, source = 'photo') {
    const nextTitle = draft?.title || ''
    const nextCategory = normalizeCategory(draft?.category)
    const nextDescription = draft?.full_description || draft?.description || draft?.short_description || ''
    const nextPricingType = normalizePricingType(draft?.pricing_type)
    const nextRate = draft?.price_amount != null ? String(draft.price_amount) : ''
    const nextLocation = draft?.service_area || draft?.location_name || ''

    setTitle(nextTitle)
    setCategory(nextCategory)
    setDescription(nextDescription)
    setPricingType(nextPricingType)
    setRate(nextPricingType === 'quote_required' ? '' : nextRate)
    setUnitLabel(nextPricingType === 'per_unit' ? (draft?.unit_label || 'job') : '')
    setLocationName(nextLocation)
    setTravelRange(draft?.travel_range_km != null ? String(draft.travel_range_km) : '')
    setDraftMissingFields(Array.isArray(draft?.missing_fields)
      ? draft.missing_fields.map(formatMissingField).filter(item => item && !/equipment/i.test(item))
      : [])
    setDraftConfidenceNotes(Array.isArray(draft?.confidence_notes) ? draft.confidence_notes : [])
    setCardHeadline(draft?.card_headline || '')
    setCardSupportingText(draft?.card_supporting_text || '')
    setCardStyle(draft?.card_style || null)
    setDraftSource(source)
    setCreationMode('manual')
    setStep(1)
  }

  function cancelCreation() {
    const hasChanges = isEditing || !!(
      title.trim() || category || description.trim() || photos.length || sourcePhoto ||
      websiteInput.trim() || pricingType || locationName.trim() || draftSource
    )
    if (!hasChanges) {
      navigation.goBack()
      return
    }
    Alert.alert(
      isEditing ? 'Discard your changes?' : 'Discard this service?',
      isEditing
        ? 'Any changes made on this screen will be lost.'
        : 'The service has not been published. Any details, photos, or generated draft will be lost.',
      [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => navigation.goBack() },
      ]
    )
  }

  function includeSourcePhotoIfSelected() {
    if (!useSourceAsPhoto || !sourcePhoto) return
    const listingPhoto = sourcePhoto.listingPhoto || sourcePhoto
    setPhotos(prev => prev.length >= 4 || prev.some(photo => getPhotoUri(photo) === listingPhoto.uri)
      ? prev
      : [...prev, listingPhoto])
  }

  function finishPhotoDraft(draft) {
    includeSourcePhotoIfSelected()
    applyAiDraft(draft, 'photo')
  }

  async function enrichDraftFromWebsite(draft, websiteUrl) {
    setCreatingDraft(true)
    setDraftError('')
    const { data, error } = await supabase.functions.invoke(AI_FUNCTION_NAME, {
      body: {
        website_url: websiteUrl,
        allow_website_scan: true,
        current_draft: draft,
      },
    })
    setCreatingDraft(false)

    if (error) {
      const message = await edgeFunctionErrorMessage(error, 'The website could not be read.')
      Alert.alert('Website scan unavailable', `${message}\n\nThe photo draft is still ready, so you can review and complete it manually.`)
      finishPhotoDraft(draft)
      return
    }

    finishPhotoDraft(data?.draft || data)
  }

  async function createDraftFromWebsite() {
    const websiteUrl = websiteInput.trim()
    if (!websiteUrl || !websiteUrl.includes('.')) {
      setWebsiteError('Enter a complete public website address, such as example.co.nz.')
      return
    }

    setCreatingDraft(true)
    setWebsiteError('')
    setWebsiteDraftPreview(null)
    setUseWebsiteImage(false)
    setWebsiteImageError(false)
    const { data, error } = await supabase.functions.invoke(AI_FUNCTION_NAME, {
      body: {
        website_url: websiteUrl,
        allow_website_scan: true,
        current_draft: {},
      },
    })
    setCreatingDraft(false)

    if (error) {
      setWebsiteError(await edgeFunctionErrorMessage(error, 'The website could not be read. Check the address or create the service manually.'))
      return
    }

    const draft = data?.draft || data
    setWebsiteDraftPreview(draft)
    setWebsiteCardOptions(buildWebsiteCardOptions(draft))
    setSelectedWebsiteCard(0)
    setUseWebsiteImage(!!draft?.website_image_url)
  }

  function continueWebsiteDraft() {
    if (!websiteDraftPreview) return
    const selectedOption = websiteCardOptions[selectedWebsiteCard]
    if (useWebsiteImage && websiteDraftPreview.website_image_url) {
      setPhotos(prev => prev.length >= 4 || prev.some(photo => getPhotoUri(photo) === websiteDraftPreview.website_image_url)
        ? prev
        : [...prev, {
          uri: websiteDraftPreview.website_image_url,
          mimeType: null,
          fileName: `website-service-${Date.now()}.jpg`,
          fromWebsite: true,
        }])
    }
    applyAiDraft({
      ...websiteDraftPreview,
      card_headline: selectedOption?.headline || '',
      card_supporting_text: selectedOption?.supporting_text || '',
      card_style: selectedOption?.style || null,
    }, 'website')
    setWebsiteDraftPreview(null)
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
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], base64: true, quality: 0.8, allowsEditing: false })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], base64: true, quality: 0.8, allowsEditing: false })

      if (!result.canceled) {
        const picked = normalizePickedAsset(result.assets[0])
        const prepared = await preparePhotoForDraft(picked)
        setSourcePhoto(prepared)
        setUseSourceAsPhoto(false)
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
      setDraftError(await edgeFunctionErrorMessage(error, 'The draft assistant is not available yet.'))
      setDraftMissingFields(['Add service title', 'Choose category', 'Add service area', 'Add pricing'])
      return
    }

    const draft = data?.draft || data
    const websiteUrl = draft?.website_url
    if (!websiteUrl) {
      finishPhotoDraft(draft)
      return
    }

    Alert.alert(
      'Website found',
      `The photo includes ${websiteUrl}. Would you like Rural Connections to scan that public website for more service details?`,
      [
        { text: 'Not now', style: 'cancel', onPress: () => finishPhotoDraft(draft) },
        { text: 'Scan website', onPress: () => enrichDraftFromWebsite(draft, websiteUrl) },
      ],
      { cancelable: false }
    )
  }

  function renderStartChoice() {
    return (
      <View style={styles.screen}>
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <View style={styles.headerActions}>
            <View />
            <TouchableOpacity
              style={styles.headerActionBtn}
              onPress={cancelCreation}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Cancel creating service">
              <Text style={styles.headerCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.kicker}>Rural Connections</Text>
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
              <Icon name="create-outline" size={23} color={colors.primary} />
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
              <Icon name="camera-outline" size={23} color={colors.primary} />
            </View>
            <View style={styles.startCopy}>
              <Text style={styles.startTitle}>Create from photo</Text>
              <Text style={styles.startBody}>Use a flyer, business card, sign, screenshot, or note.</Text>
            </View>
            <Text style={styles.startArrow}>{'>'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.startOption}
            onPress={() => { setWebsiteError(''); setCreationMode('website') }}
            accessibilityRole="button"
            accessibilityLabel="Create service from website">
            <View style={styles.startIconWrap}>
              <Icon name="globe-outline" size={23} color={colors.primary} />
            </View>
            <View style={styles.startCopy}>
              <Text style={styles.startTitle}>Create from website</Text>
              <Text style={styles.startBody}>Enter your public website and review the service details we find.</Text>
            </View>
            <Text style={styles.startArrow}>{'>'}</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    )
  }

  function renderWebsiteDraft() {
    return (
      <View style={styles.screen}>
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.headerActionBtn}
              onPress={() => {
                setWebsiteDraftPreview(null)
                setUseWebsiteImage(false)
                setWebsiteImageError(false)
                setCreationMode('choose')
              }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Go back">
              <Text style={styles.headerBackBtnText}>Back</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerActionBtn}
              onPress={cancelCreation}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Cancel creating service">
              <Text style={styles.headerCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.kicker}>Website-to-draft</Text>
          <Text style={styles.headerTitle} accessibilityRole="header">Create from website</Text>
          <Text style={styles.headerSub}>Use your existing public website to create a service draft.</Text>
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.startContent} keyboardShouldPersistTaps="handled">
          <Text style={styles.fieldLabel}>Website address</Text>
          <TextInput
            style={styles.input}
            placeholder="example.co.nz"
            placeholderTextColor={colors.textMuted}
            value={websiteInput}
            onChangeText={value => {
              setWebsiteInput(value)
              setWebsiteError('')
              setWebsiteDraftPreview(null)
              setUseWebsiteImage(false)
              setWebsiteImageError(false)
            }}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            accessibilityLabel="Public website address"
          />

          <View style={styles.helpBox}>
            <Text style={styles.helpBoxTitle}>You stay in control</Text>
            <Text style={styles.helpBoxText}>We will read public service information only. Contact details and instructions to book outside Rural Connections will not be added to the listing.</Text>
          </View>

          {!!websiteError && (
            <View style={styles.warningBox}>
              <Text style={styles.warningTitle}>Website unavailable</Text>
              <Text style={styles.warningText}>{websiteError}</Text>
            </View>
          )}

          {!!websiteDraftPreview && (
            <View style={styles.websiteImageCard}>
              <Text style={styles.websiteImageTitle}>Choose your card message</Text>
              <Text style={styles.websiteChoiceIntro}>We found three ways to present your service. Choose the one that suits you best.</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.websiteOptionRow}>
                {websiteCardOptions.map((option, index) => {
                  const selected = selectedWebsiteCard === index
                  const clean = option.style === 'clean'
                  return (
                    <TouchableOpacity
                      key={`${option.style}-${index}`}
                      style={[styles.creativeOption, selected && styles.creativeOptionSelected]}
                      onPress={() => setSelectedWebsiteCard(index)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      accessibilityLabel={`${option.label}: ${option.headline}`}>
                      <View style={styles.creativeImageWrap}>
                        {!!websiteDraftPreview.website_image_url && !websiteImageError ? (
                          <Image
                            source={{ uri: websiteDraftPreview.website_image_url }}
                            style={styles.creativeImage}
                            resizeMode="cover"
                            onError={() => {
                              setWebsiteImageError(true)
                              setUseWebsiteImage(false)
                            }}
                          />
                        ) : (
                          <View style={[styles.creativeImage, styles.creativeFallback]} />
                        )}
                        <View style={[
                          styles.creativeOverlay,
                          option.style === 'bold' && styles.creativeOverlayBold,
                          option.style === 'bottom' && styles.creativeOverlayBottom,
                          clean && styles.creativeOverlayClean,
                        ]}>
                          <Text style={[styles.creativeHeadline, clean && styles.creativeTextClean]} numberOfLines={3}>{option.headline}</Text>
                          {!!option.supporting_text && (
                            <Text style={[styles.creativeSupporting, clean && styles.creativeTextClean]} numberOfLines={3}>{option.supporting_text}</Text>
                          )}
                        </View>
                      </View>
                      <View style={styles.creativeOptionFooter}>
                        <Text style={styles.creativeOptionLabel}>{option.label}</Text>
                        <Icon name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={18} color={selected ? colors.primary : colors.textMuted} />
                      </View>
                    </TouchableOpacity>
                  )
                })}
              </ScrollView>

              {websiteImageError ? (
                <View style={[styles.warningBox, styles.websiteImageOption]}>
                  <Text style={styles.warningTitle}>Image unavailable</Text>
                  <Text style={styles.warningText}>The website image could not be loaded. You can continue without it and add a photo later.</Text>
                </View>
              ) : !!websiteDraftPreview.website_image_url ? (
                <TouchableOpacity
                  style={[styles.sourcePhotoOption, styles.websiteImageOption]}
                  onPress={() => setUseWebsiteImage(value => !value)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: useWebsiteImage }}>
                  <Icon name={useWebsiteImage ? 'checkbox' : 'square-outline'} size={22} color={colors.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sourcePhotoOptionTitle}>Include the website image</Text>
                    <Text style={styles.sourcePhotoOptionBody}>Included with your selected card. Leave this on only if you own the image or have permission to publish it. We will copy it into Rural Connections.</Text>
                  </View>
                </TouchableOpacity>
              ) : null}
              <Button
                title="Continue with draft"
                onPress={continueWebsiteDraft}
                accessibilityLabel="Continue with website service draft"
              />
            </View>
          )}

          {creatingDraft && (
            <View style={styles.draftProgress}>
              <ActivityIndicator color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.draftProgressTitle}>Reading your website...</Text>
                <Text style={styles.draftProgressBody}>Finding service, pricing and coverage details.</Text>
              </View>
            </View>
          )}

          {!websiteDraftPreview && (
            <Button
              title="Scan website"
              onPress={createDraftFromWebsite}
              loading={creatingDraft}
              disabled={!websiteInput.trim()}
              accessibilityLabel="Scan website and create service draft"
            />
          )}
        </ScrollView>
      </View>
    )
  }

  function renderPhotoDraft() {
    return (
      <View style={styles.screen}>
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.headerActionBtn}
              onPress={() => sourcePhoto ? setSourcePhoto(null) : setCreationMode('choose')}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Go back">
              <Text style={styles.headerBackBtnText}>Back</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerActionBtn}
              onPress={cancelCreation}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Cancel creating service">
              <Text style={styles.headerCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.kicker}>Photo-to-draft</Text>
          <Text style={styles.headerTitle} accessibilityRole="header">Create from photo</Text>
          <Text style={styles.headerSub}>Take or upload a clear photo that shows your service details.</Text>
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.startContent}>
          {sourcePhoto ? (
            <>
              <Image source={{ uri: sourcePhoto.uri }} style={styles.sourcePreview} resizeMode="contain" />
              <Text style={styles.photoHint}>Make sure the text is clear and not cut off.</Text>
              <TouchableOpacity
                style={styles.sourcePhotoOption}
                onPress={() => setUseSourceAsPhoto(value => !value)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: useSourceAsPhoto }}
                accessibilityLabel="Also use the source image as a public service photo">
                <Icon name={useSourceAsPhoto ? 'checkbox' : 'square-outline'} size={22} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.sourcePhotoOptionTitle}>Use as a service photo</Text>
                  <Text style={styles.sourcePhotoOptionBody}>Off by default. Flyers and business cards are usually better used only to create the draft.</Text>
                </View>
              </TouchableOpacity>
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
                <Button
                  variant="secondary"
                  title="Retake"
                  onPress={() => { setSourcePhoto(null); setUseSourceAsPhoto(false) }}
                  disabled={creatingDraft}
                  accessibilityLabel="Retake or choose another photo"
                />
                <Button
                  title={draftError ? 'Use manually' : 'Use photo'}
                  onPress={draftError ? () => { includeSourcePhotoIfSelected(); setDraftSource('photo'); setCreationMode('manual'); setStep(1) } : createDraftFromPhoto}
                  loading={creatingDraft}
                  style={{ flex: 1 }}
                  accessibilityLabel="Use photo"
                />
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
        let contentType = photo.mimeType || 'image/jpeg'
        let fileData
        if (photo.fromWebsite) {
          const { data, error } = await supabase.functions.invoke(AI_FUNCTION_NAME, {
            body: {
              copy_website_image: true,
              service_id: serviceId,
              website_image_url: photo.uri,
            },
          })
          if (error) throw new Error(await edgeFunctionErrorMessage(error, 'Could not copy the website image.'))
          if (!data?.photo_url) throw new Error('The website image copy did not return a stored photo.')
          urls.push(data.photo_url)
          continue
        } else {
          fileData = photo.base64
            ? base64ToArrayBuffer(photo.base64)
            : await (await fetch(photo.uri)).arrayBuffer()
        }
        const extensionByType = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }
        const ext = extensionByType[contentType] || (photo.fileName || photo.uri || 'jpg').split('.').pop()?.split('?')[0]?.toLowerCase() || 'jpg'
        const path = `${serviceId}/${Date.now()}_${i}.${ext}`
        const { error } = await supabase.storage
          .from('service-photos')
          .upload(path, fileData, { contentType, upsert: false })
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
      card_headline: cardHeadline.trim() || null,
      card_supporting_text: cardSupportingText.trim() || null,
      card_style: cardStyle || null,
      payment_timing: paymentTiming,
      materials,
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
        {STEP_LABELS.map((_, index) => index + 1).map(s => (
          <View key={s} style={[styles.progressPill, s <= step && styles.progressPillActive]} />
        ))}
      </View>
    )
  }

  function renderStep1() {
    return (
      <>
        <Text style={styles.stepHeading}>What service can you offer?</Text>

        {!!draftSource && (
          <View style={styles.sourceNote}>
            <Text style={styles.sourceNoteTitle}>Draft created from your {draftSource === 'website' ? 'website' : 'photo'}</Text>
            <Text style={styles.sourceNoteText}>Start here and check each pre-filled step before publishing.</Text>
          </View>
        )}

        <Text style={styles.fieldLabel}>Service title</Text>
        <TextInput
          style={[styles.input, styles.titleInput]}
          placeholder="e.g. Tractor topping with operator"
          placeholderTextColor={colors.textMuted}
          value={title}
          onChangeText={setTitle}
          multiline
          numberOfLines={2}
          textAlignVertical="top"
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
    const manualPreviewImage = photos.length > 0
      ? { uri: getPhotoUri(photos[0]) }
      : categoryImage(category)
    const selectedTreatment = cardStyle || 'bottom'

    return (
      <>
        <Text style={styles.stepHeading}>Describe your Service</Text>

        <Text style={styles.fieldLabel}>Description <Text style={styles.optional}>(optional)</Text></Text>
        <TextInput
          style={[styles.input, styles.descriptionInput]}
          placeholder="What is included, what gear you use, and what area you cover..."
          placeholderTextColor={colors.textMuted}
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={8}
          textAlignVertical="top"
          autoCapitalize="sentences"
          accessibilityLabel="Service description"
        />

        <Text style={styles.fieldLabel}>Service photo <Text style={styles.optional}>(optional)</Text></Text>
        <Text style={styles.fieldHelp}>Add a photo to make your card more recognisable. You can take one now or choose one from your phone.</Text>
        <View style={styles.photoGrid}>
          {photos.map((photo, idx) => (
            <View key={`${getPhotoUri(photo)}-${idx}`} style={styles.photoThumb}>
              <Image source={{ uri: getPhotoUri(photo) }} style={styles.photoImg} resizeMode="cover" />
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
                <Icon name="camera-outline" size={21} color={colors.primary} />
                <Text style={styles.photoAddText}>Take photo</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.photoAdd}
                onPress={() => pickPhoto(false)}
                accessibilityRole="button"
                accessibilityLabel="Choose service photo">
                <Icon name="images-outline" size={21} color={colors.primary} />
                <Text style={styles.photoAddText}>Choose photo</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <Text style={styles.fieldLabel}>Tagline / card headline <Text style={styles.optional}>(optional)</Text></Text>
        <TextInput
          style={[styles.input, styles.cardHeadlineInput]}
          placeholder="e.g. Too much garden, not enough time?"
          placeholderTextColor={colors.textMuted}
          value={cardHeadline}
          onChangeText={value => {
            const nextValue = value.slice(0, 55)
            setCardHeadline(nextValue)
            if (nextValue.trim() && !cardStyle) setCardStyle('bottom')
          }}
          maxLength={55}
          multiline
          numberOfLines={2}
          textAlignVertical="top"
          accessibilityLabel="Service card headline"
        />

        <Text style={styles.fieldLabel}>Supporting line <Text style={styles.optional}>(optional)</Text></Text>
        <TextInput
          style={[styles.input, styles.supportingInput]}
          placeholder="Tell customers how you can help in one concise sentence"
          placeholderTextColor={colors.textMuted}
          value={cardSupportingText}
          onChangeText={value => setCardSupportingText(value.slice(0, 125))}
          maxLength={125}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
          accessibilityLabel="Service card supporting line"
        />

        {!!cardHeadline && (
          <>
            <Text style={styles.fieldLabel}>Choose how your message appears</Text>
            <Text style={styles.fieldHelp}>Select the card treatment that best suits your service.</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.websiteOptionRow}>
              {CARD_TREATMENTS.map(option => {
                const selected = selectedTreatment === option.id
                const clean = option.id === 'clean'
                return (
                <TouchableOpacity
                  key={option.id}
                  style={[styles.creativeOption, selected && styles.creativeOptionSelected]}
                  onPress={() => setCardStyle(option.id)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${option.label}: ${cardHeadline}`}>
                  <View style={styles.creativeImageWrap}>
                    {manualPreviewImage ? (
                      <Image source={manualPreviewImage} style={styles.creativeImage} resizeMode="cover" />
                    ) : (
                      <View style={[styles.creativeImage, styles.creativeFallback]} />
                    )}
                    <View style={[
                      styles.creativeOverlay,
                      option.id === 'bold' && styles.creativeOverlayBold,
                      option.id === 'bottom' && styles.creativeOverlayBottom,
                      clean && styles.creativeOverlayClean,
                    ]}>
                      <Text style={[styles.creativeHeadline, clean && styles.creativeTextClean]} numberOfLines={3}>{cardHeadline}</Text>
                      {!!cardSupportingText && (
                        <Text style={[styles.creativeSupporting, clean && styles.creativeTextClean]} numberOfLines={3}>{cardSupportingText}</Text>
                      )}
                    </View>
                  </View>
                  <View style={styles.creativeOptionFooter}>
                    <Text style={styles.creativeOptionLabel}>{option.label}</Text>
                    <Icon name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={18} color={selected ? colors.primary : colors.textMuted} />
                  </View>
                </TouchableOpacity>
                )
              })}
            </ScrollView>
          </>
        )}
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

        <Text style={styles.fieldLabel}>When is payment due?</Text>
        <View style={styles.segmentGrid}>
          {PAYMENT_OPTIONS.map(o => (
            <TouchableOpacity
              key={o.id}
              style={[styles.segmentBtn, paymentTiming === o.id && styles.segmentBtnActive]}
              onPress={() => setPaymentTiming(o.id)}
              accessibilityRole="button"
              accessibilityState={{ selected: paymentTiming === o.id }}>
              <Text style={[styles.segmentText, paymentTiming === o.id && styles.segmentTextActive]}>{o.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.fieldLabel}>Are materials included?</Text>
        <View style={styles.segmentGrid}>
          {MATERIALS_OPTIONS.map(o => (
            <TouchableOpacity
              key={o.id}
              style={[styles.segmentBtn, materials === o.id && styles.segmentBtnActive]}
              onPress={() => setMaterials(o.id)}
              accessibilityRole="button"
              accessibilityState={{ selected: materials === o.id }}>
              <Text style={[styles.segmentText, materials === o.id && styles.segmentTextActive]}>{o.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

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
          <Icon name="calendar-outline" size={18} color={colors.textMuted} />
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
              onChange={(event, selected) => {
                if (Platform.OS === 'android') setShowDatePicker(false)
                if (event?.type !== 'dismissed') {
                  const nextDate = toDateValue(selected)
                  if (nextDate) setAvailableFrom(nextDate)
                }
              }}
            />
          </>
        )}

      </>
    )
  }

  function renderStep5() {
    const missingItems = [
      !title.trim() && 'Add service title',
      !category && 'Choose category',
      !pricingType && 'Choose pricing type',
      pricingType !== 'quote_required' && !rate.trim() && 'Add rate',
      !locationName.trim() && 'Add service area',
      ...draftMissingFields,
    ].filter(Boolean)
    const uniqueMissingItems = [...new Set(missingItems)]
    const previewImage = photos.length > 0
      ? { uri: getPhotoUri(photos[0]) }
      : categoryImage(category)
    const previewCardStyle = cardStyle || 'bottom'

    return (
      <>
        <Text style={styles.stepHeading}>Review your service</Text>
        {!!draftSource && (
          <View style={styles.sourceNote}>
            <Text style={styles.sourceNoteTitle}>Draft created from your {draftSource === 'website' ? 'website' : 'photo'}</Text>
            <Text style={styles.sourceNoteText}>This is how your service card will appear. Use Back to change anything before publishing.</Text>
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
              <TouchableOpacity style={styles.reviewActionBtn} onPress={() => setStep(2)}>
                <Text style={styles.reviewActionText}>Edit details</Text>
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
            <TouchableOpacity style={styles.reviewActionBtn} onPress={() => setStep(2)}>
              <Text style={styles.reviewActionText}>Edit details</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.reviewActionBtn} onPress={() => setStep(3)}>
              <Text style={styles.reviewActionText}>Edit pricing</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.reviewActionBtn} onPress={() => setStep(4)}>
              <Text style={styles.reviewActionText}>Edit area</Text>
            </TouchableOpacity>
          </View>
        )}
        <View style={styles.finalCard}>
          <View style={styles.finalCardImageWrap}>
            {previewImage ? (
              <Image source={previewImage} style={styles.finalCardImage} resizeMode="cover" />
            ) : (
              <View style={styles.finalCardPlaceholder}>
                <Icon name="construct-outline" size={38} color={colors.primary} />
              </View>
            )}
            {!!cardHeadline && (
              <View style={[
                styles.finalCardMessage,
                previewCardStyle === 'bold' && styles.finalCardMessageBold,
                previewCardStyle === 'clean' && styles.finalCardMessageClean,
              ]}>
                <Text style={[
                  styles.finalCardHeadline,
                  previewCardStyle === 'clean' && styles.finalCardTextClean,
                ]}>{cardHeadline}</Text>
                {!!cardSupportingText && (
                  <Text
                    style={[
                      styles.finalCardSupporting,
                      previewCardStyle === 'clean' && styles.finalCardSupportingClean,
                    ]}
                    numberOfLines={3}>
                    {cardSupportingText}
                  </Text>
                )}
              </View>
            )}
          </View>
          <View style={styles.finalCardBody}>
            <Text style={styles.finalCardTitle}>{title || 'Your service title'}</Text>
            <View style={styles.finalCardPriceBadge}>
              <Text style={styles.finalCardPriceText}>{formatRate()}</Text>
            </View>
            <Text style={styles.finalCardStatus}>{serviceActive ? 'Advertising live' : 'Advertising paused'}</Text>
            <Text style={styles.finalCardMeta}>{category}{locationName ? `  ·  ${locationName}` : ''}</Text>
            {!!description && <Text style={styles.finalCardDescription}>{description}</Text>}
            <Text style={styles.finalCardPublishNote}>{isEditing ? 'Ready to save' : 'Ready to publish'}</Text>
          </View>
        </View>
        {isEditing && (
          <View style={styles.managementCard}>
            <Text style={styles.managementTitle}>Service advertising</Text>
            <Text style={styles.managementBody}>
              {serviceActive
                ? 'This service is visible to requesters. Pause advertising while you make adjustments.'
                : 'This service is hidden from requesters. Existing bookings and chats are not cancelled.'}
            </Text>
            <Button
              variant={serviceActive ? 'secondary' : 'primary'}
              title={serviceActive ? 'Pause advertising' : 'Resume advertising'}
              onPress={() => setServiceActive(prev => !prev)}
              style={{ marginBottom: 10 }}
              accessibilityLabel={serviceActive ? 'Pause service advertising' : 'Resume service advertising'}
            />
            <Button
              variant="destructive"
              title="Delete service"
              onPress={handleDeleteService}
              accessibilityLabel="Delete service"
            />
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

  const RENDERERS = [renderStep1, renderStep2, renderStep3, renderStep4, renderStep5]

  if (creationMode === 'choose') return renderStartChoice()
  if (creationMode === 'photo') return renderPhotoDraft()
  if (creationMode === 'website') return renderWebsiteDraft()

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={styles.headerActions}>
          <View />
          <TouchableOpacity
            style={styles.headerActionBtn}
            onPress={cancelCreation}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel={isEditing ? 'Cancel editing service' : 'Cancel creating service'}>
            <Text style={styles.headerCancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.kicker}>Rural Connections</Text>
        <Text style={styles.headerTitle} accessibilityRole="header">{isEditing ? 'Edit service' : 'Advertise a service'}</Text>
        <Text style={styles.headerSub}>{STEP_LABELS[step - 1]}</Text>
        {renderProgress()}
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
        enabled={Platform.OS === 'android'}>
        <Animated.View style={[{ flex: 1 }, { transform: [{ translateX: stepTranslateX }] }]}>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 150 }]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            automaticallyAdjustKeyboardInsets={true}>
            {RENDERERS[step - 1]()}
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>

      <SafeAreaView edges={['bottom']} style={styles.footer}>
        {step === 1 ? (
          <Button
            title="Next"
            onPress={() => animateStep(2, 'forward')}
            disabled={!canProceed()}
            accessibilityLabel="Next step"
          />
        ) : (
          <View style={styles.footerRow}>
            <Button
              variant="secondary"
              title="Back"
              onPress={() => animateStep(step - 1, 'backward')}
              accessibilityLabel="Previous step"
            />
            {step < 5 ? (
              <Button
                title="Next"
                onPress={() => animateStep(step + 1, 'forward')}
                disabled={!canProceed()}
                style={{ flex: 1 }}
                accessibilityLabel="Next step"
              />
            ) : (
              <Button
                title={isEditing ? 'Save' : 'Publish'}
                onPress={handlePublish}
                loading={submitting}
                disabled={!canProceed()}
                style={{ flex: 1 }}
                accessibilityLabel="Publish service"
              />
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
  headerBackBtnText: { color: colors.primary, fontSize: 15, fontWeight: '700' },
  headerActions: { minHeight: 36, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  headerActionBtn: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 2 },
  headerCancelText: { color: colors.danger, fontSize: 15, fontWeight: '700' },
  kicker: { fontSize: 13, fontWeight: '700', color: colors.accent, marginBottom: 8 },
  headerTitle: { fontSize: 34, lineHeight: 38, fontWeight: '700', color: colors.textPrimary, letterSpacing: 0 },
  headerSub: { fontSize: 15, lineHeight: 22, color: colors.textSecondary, marginTop: 8, marginBottom: 14 },
  progressWrap: { flexDirection: 'row', gap: 8 },
  progressPill: { flex: 1, height: 6, borderRadius: 999, backgroundColor: colors.border },
  progressPillActive: { backgroundColor: colors.primary },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 28 },
  stepHeading: { fontSize: 24, lineHeight: 30, fontWeight: '700', color: colors.textPrimary, marginBottom: 16, letterSpacing: 0 },
  fieldLabel: { fontSize: 14, fontWeight: '700', color: colors.textPrimary, marginBottom: 8, marginTop: 14 },
  fieldHelp: { fontSize: 13, lineHeight: 19, color: colors.textSecondary, marginTop: -2, marginBottom: 10 },
  optional: { fontSize: 13, fontWeight: '400', color: colors.textMuted },
  input: {
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 15,
    fontSize: 16,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.textPrimary,
  },
  titleInput: { minHeight: 76, textAlignVertical: 'top' },
  multiline: { minHeight: 96, textAlignVertical: 'top' },
  descriptionInput: { minHeight: 180, textAlignVertical: 'top' },
  cardHeadlineInput: { minHeight: 76, textAlignVertical: 'top' },
  supportingInput: { minHeight: 112, textAlignVertical: 'top' },
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
    gap: 6,
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
  reviewCard: { backgroundColor: colors.white, borderRadius: 12, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  reviewRow: { flexDirection: 'row', paddingVertical: 14, paddingHorizontal: 16, alignItems: 'flex-start' },
  reviewRowBorder: { borderBottomWidth: 1, borderBottomColor: '#f2f2f2' },
  reviewLabel: { fontSize: 13, color: colors.textMuted, fontWeight: '700', width: 88, flexShrink: 0 },
  reviewValue: { fontSize: 14, color: colors.textPrimary, flex: 1, fontWeight: '600', textAlign: 'right' },
  finalCard: {
    backgroundColor: colors.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  finalCardImageWrap: { height: 224, backgroundColor: colors.primaryLight, position: 'relative' },
  finalCardImage: { width: '100%', height: '100%' },
  finalCardPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primaryLight },
  finalCardMessage: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(8, 80, 65, 0.92)',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  finalCardMessageBold: {
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 0,
    backgroundColor: 'rgba(8, 80, 65, 0.66)',
    justifyContent: 'center',
    paddingHorizontal: 22,
  },
  finalCardMessageClean: { backgroundColor: 'rgba(255, 255, 255, 0.92)' },
  finalCardHeadline: { color: colors.white, fontSize: 20, lineHeight: 24, fontWeight: '800' },
  finalCardSupporting: { color: 'rgba(255, 255, 255, 0.9)', fontSize: 13, lineHeight: 18, marginTop: 5 },
  finalCardTextClean: { color: colors.primaryDark },
  finalCardSupportingClean: { color: colors.textSecondary },
  finalCardBody: { padding: 16 },
  finalCardTitle: { color: colors.textPrimary, fontSize: 19, lineHeight: 24, fontWeight: '800' },
  finalCardPriceBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primaryLight,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginTop: 10,
  },
  finalCardPriceText: { color: colors.primary, fontSize: 13, fontWeight: '800' },
  finalCardStatus: { color: colors.primary, fontSize: 13, fontWeight: '800', marginTop: 10 },
  finalCardMeta: { color: colors.textMuted, fontSize: 13, lineHeight: 19, marginTop: 5 },
  finalCardDescription: { color: colors.textSecondary, fontSize: 14, lineHeight: 21, marginTop: 12 },
  finalCardPublishNote: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  managementCard: {
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginTop: 12,
    gap: 10,
  },
  managementTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  managementBody: { fontSize: 13, lineHeight: 20, color: colors.textSecondary },
  descCard: { backgroundColor: colors.white, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 16, marginTop: 12 },
  descText: { fontSize: 14, color: colors.textSecondary, lineHeight: 22, marginTop: 8 },
  footer: { backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.border, padding: 16 },
  footerRow: { flexDirection: 'row', gap: 12 },
  datePickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.white,
    borderRadius: 12,
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
    borderRadius: 12,
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
    borderRadius: 12,
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
  sourcePhotoOption: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 11,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.white,
  },
  sourcePhotoOptionTitle: { fontSize: 14, fontWeight: '700', color: colors.textPrimary, marginBottom: 3 },
  sourcePhotoOptionBody: { fontSize: 12, lineHeight: 18, color: colors.textSecondary },
  websiteImageCard: {
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 12,
  },
  websiteImageTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  websiteImagePreview: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 10,
    backgroundColor: colors.background,
  },
  websiteImageOption: { marginBottom: 0 },
  websiteChoiceIntro: { fontSize: 13, lineHeight: 19, color: colors.textSecondary },
  websiteOptionRow: { gap: 12, paddingVertical: 2 },
  creativeOption: {
    width: 252,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.white,
  },
  creativeOptionSelected: { borderColor: colors.primary },
  creativeImageWrap: { width: '100%', height: 168, position: 'relative', backgroundColor: colors.primaryLight },
  creativeImage: { ...StyleSheet.absoluteFillObject },
  creativeFallback: { backgroundColor: colors.primaryDark },
  creativeOverlay: { position: 'absolute', left: 0, right: 0, padding: 14 },
  creativeOverlayBold: { top: 0, bottom: 0, justifyContent: 'center', backgroundColor: 'rgba(15,45,33,0.62)' },
  creativeOverlayBottom: { bottom: 0, backgroundColor: 'rgba(15,45,33,0.78)' },
  creativeOverlayClean: { left: 10, right: 10, bottom: 10, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.90)' },
  creativeHeadline: { color: colors.white, fontSize: 18, lineHeight: 22, fontWeight: '800' },
  creativeSupporting: { color: colors.white, fontSize: 11, lineHeight: 15, marginTop: 6 },
  creativeTextClean: { color: colors.primaryDark },
  creativeOptionFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 10 },
  creativeOptionLabel: { fontSize: 13, fontWeight: '700', color: colors.textPrimary },
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
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 9,
    minHeight: 40,
    justifyContent: 'center',
  },
  reviewActionText: { color: colors.primary, fontSize: 13, fontWeight: '700' },
})
