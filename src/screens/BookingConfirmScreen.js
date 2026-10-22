import React, { useEffect, useState } from 'react'
import { CommonActions } from '@react-navigation/native'
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Animated,
  Dimensions,
} from 'react-native'
import DateTimePicker from '@react-native-community/datetimepicker'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../lib/supabase'
import { colors } from '../theme/tokens'
import Icon from '../components/Icon'
import Button from '../components/Button'
import AddressAutocomplete from '../components/AddressAutocomplete'
import { bookingRequestCopy } from '../lib/bookingRequestCopy'
import { listingEstimate, formatExtraCharge, BASE_ESTIMATE_EXPLANATION, EXTRA_CHARGES_EXPLANATION } from '../lib/listingEstimate'

function formatDisplayDate(d) {
  return d.toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

const { height: SCREEN_HEIGHT } = Dimensions.get('window')

const SCHEDULE_OPTIONS = [
  { id: 'asap',     label: 'As soon as possible', icon: 'flash-outline' },
  { id: 'specific', label: 'On a specific date',   icon: 'calendar-outline' },
  { id: 'flexible', label: "I'm flexible",          icon: 'happy-outline' },
]

function SummaryRow({ label, value, last }) {
  return (
    <View style={[styles.summaryRow, !last && styles.summaryRowBorder]}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  )
}

const MATERIALS_LABELS = {
  included:           'Included in price',
  estimate:           'Estimated, billed extra',
  requester_supplies: 'You supply',
}


function AuthSheet({ onDismiss, onLogin, onRegister, copy }) {
  return (
    <View style={StyleSheet.absoluteFill}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onDismiss} />
      <View style={styles.sheet}>
        <Text style={styles.sheetTitle}>{copy.authTitle}</Text>
        <Text style={styles.sheetMessage}>{copy.authMessage}</Text>
        <TouchableOpacity
          style={styles.sheetPrimary}
          onPress={onRegister}
          accessibilityRole="button"
          accessibilityLabel="Create account">
          <Text style={styles.sheetPrimaryText}>Create account</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.sheetSecondary}
          onPress={onLogin}
          accessibilityRole="button"
          accessibilityLabel="Sign in">
          <Text style={styles.sheetSecondaryText}>I already have an account</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

export default function BookingConfirmScreen({ route, navigation }) {
  const insets = useSafeAreaInsets()
  const { service, quantity: initialQty, selectedOption } = route.params || {}
  const option = selectedOption || null
  const isGrazing = service?.kind === 'grazing'
  const estimate = listingEstimate(service, option, initialQty)
  const qty = estimate.quantity
  const effectivePricingType = estimate.pricingType
  const isQuoteRequired = effectivePricingType === 'quote_required'
  const requestCopy = bookingRequestCopy(isQuoteRequired)
  const total = estimate.baseAmount?.toFixed(2)

  const unitLabel = effectivePricingType === 'hourly' ? 'hour'
    : effectivePricingType === 'day_rate' ? 'day'
    : (option ? (option.unit_label || 'unit') : (service?.unit_label || 'unit'))

  const [scheduleType,   setScheduleType]   = useState('asap')
  const [date,           setDate]           = useState(null)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [location, setLocation] = useState(isGrazing ? service.location_name || '' : '')
  const [latitude, setLatitude] = useState(isGrazing ? service.latitude ?? null : null)
  const [longitude, setLongitude] = useState(isGrazing ? service.longitude ?? null : null)
  const [locationNote, setLocationNote] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showAuthSheet, setShowAuthSheet] = useState(false)

  const basePaymentExplanation = isGrazing
    ? 'Agree the grazing duration and payment schedule with the provider. You arrange payment directly with them — Rural Connections doesn\'t handle payments.'
    : isQuoteRequired
    ? 'You arrange payment directly with the provider — Rural Connections doesn\'t handle payments.'
    : service?.payment_timing === 'upfront'
    ? 'This provider asks for payment upfront. You arrange payment directly with them — Rural Connections doesn\'t handle payments.'
    : 'You arrange payment directly with the provider once the work is complete — Rural Connections doesn\'t handle payments.'
  const paymentExplanation = service?.materials === 'estimate'
    ? `${basePaymentExplanation} Materials are estimated and settled at actual cost on completion.`
    : basePaymentExplanation

  useEffect(() => {
    const result = route.params?.locationResult
    if (!result) return
    if (result.address) setLocation(result.address)
    if (result.latitude != null) setLatitude(result.latitude)
    if (result.longitude != null) setLongitude(result.longitude)
    if (result.locationNote != null) setLocationNote(result.locationNote)
    navigation.setParams({ locationResult: null })
  }, [route.params?.locationResult])

  function buildBookingPayload(requesterId) {
    return {
      service_id:     service.id,
      requester_id:   requesterId,
      provider_id:    service.provider_id,
      quantity:       qty,
      total_amount:   estimate.baseAmount ?? 0,
      payment_timing: service.payment_timing,
      status:         'pending',
      scheduled_date: scheduleType === 'specific' ? (date ? date.toISOString().split('T')[0] : null) : scheduleType,
      location_name:  location.trim(),
      latitude,
      longitude,
      location_note: locationNote.trim() || null,
      notes:          notes.trim() || null,
    }
  }

  function openPinPicker() {
    if (!location.trim()) {
      Alert.alert('Add address first', 'Start with an address or property location, then place the exact pin.')
      return
    }
    navigation.navigate('LocationPicker', {
      returnTo: 'BookingConfirm',
      returnParams: { service, quantity: qty, selectedOption: option },
      title: 'Pin service location',
      subtitle: 'Tap the map or drag the pin to the exact spot for this service',
      initialLatitude: latitude,
      initialLongitude: longitude,
      initialLocationNote: locationNote,
    })
  }

  if (!service) {
    return (
      <View style={styles.screen}>
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Go back">
            <Text style={styles.backBtnText}>Back</Text>
          </TouchableOpacity>
          <Text style={styles.kicker}>Booking</Text>
          <Text style={styles.headerTitle} accessibilityRole="header">Booking unavailable</Text>
        </View>
        <View style={styles.centerState}>
          <Text style={styles.centerTitle}>We couldn't reload this booking.</Text>
          <Text style={styles.centerBody}>Please go back to the service and start the booking again.</Text>
        </View>
      </View>
    )
  }

  async function savePendingBooking() {
    await AsyncStorage.setItem('pendingBooking', JSON.stringify({
      serviceTitle: service.title,
      providerName: service.profile?.full_name || 'The provider',
      isQuoteRequired,
      booking: buildBookingPayload(null),
    }))
  }

  async function requireAuth(intent) {
    if (!location.trim()) {
      Alert.alert('Location required', 'Please enter your location or property address.')
      return
    }
    await savePendingBooking()
    setShowAuthSheet(false)
    // Passwordless email-code login auto-creates the account, so both
    // "Create account" and "Sign in" go to the Login screen.
    navigation.navigate('Login', { intent })
  }

  function navigateToServices() {
    const routeNames = navigation.getState()?.routeNames || []
    if (routeNames.includes('BrowseMain')) {
      navigation.dispatch(CommonActions.reset({
        index: 0,
        routes: [{ name: 'BrowseMain', params: { refresh: true } }],
      }))
      return
    }
    if (routeNames.includes('ServicesList')) {
      navigation.dispatch(CommonActions.reset({
        index: 0,
        routes: [{ name: 'ServicesList', params: { refresh: true } }],
      }))
      return
    }
    navigation.getParent()?.navigate('Browse', {
      screen: 'BrowseMain',
      params: { refresh: true },
    })
  }

  async function handleConfirm() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!location.trim()) {
      Alert.alert('Location required', 'Please enter your location or property address.')
      return
    }
    if (!user) {
      setShowAuthSheet(true)
      return
    }

    setSubmitting(true)
    const { error } = await supabase.from('bookings').insert(buildBookingPayload(user.id))

    setSubmitting(false)

    if (error) {
      Alert.alert('Error', error.message)
      return
    }

    Alert.alert(
      requestCopy.successTitle,
      requestCopy.nextStep,
      [{ text: 'OK', onPress: navigateToServices }]
    )
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
      enabled={Platform.OS === 'android'}>

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Go back">
          <Text style={styles.backBtnText}><Icon name="chevron-back" size={14} color={colors.primary} /> Back</Text>
        </TouchableOpacity>
        <Text style={styles.kicker}>{isQuoteRequired ? 'Quote request' : 'Booking request'}</Text>
        <Text style={styles.headerTitle} accessibilityRole="header">Review your request</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 170 }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets={true}>

        {/* Booking summary */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Request summary</Text>
          <SummaryRow label="Listing" value={service.title} />
          <SummaryRow label="Provider" value={service.profile?.full_name || 'Provider'} />
          {option?.label ? <SummaryRow label="Rate option" value={option.label} /> : null}
          {effectivePricingType !== 'fixed' && !isQuoteRequired && (
            <SummaryRow label="Quantity" value={`${qty} ${unitLabel}${qty !== 1 ? 's' : ''}`} />
          )}
          <SummaryRow label={isQuoteRequired ? 'Price' : 'Base estimate'} value={isQuoteRequired ? 'Awaiting quote' : `$${total}`} />
          {isGrazing && !isQuoteRequired && /\/(week|month)$/.test(unitLabel) && (
            <SummaryRow label="Estimate period" value={`One ${unitLabel.endsWith('/week') ? 'week' : 'month'}; agree the full duration with the provider`} />
          )}
          {!isQuoteRequired && estimate.minimumCharge > 0 && (
            <SummaryRow label="Minimum charge included" value={`$${estimate.minimumCharge.toFixed(2)}`} />
          )}
          {service.materials ? (
            <SummaryRow label="Materials" value={MATERIALS_LABELS[service.materials] || service.materials} />
          ) : null}
          <SummaryRow
            label="Payment"
            value={isGrazing ? 'Agree with provider' : service.payment_timing === 'upfront' ? 'Upfront' : 'On completion'}
            last
          />
        </View>

        {Array.isArray(service.pricing_add_ons) && service.pricing_add_ons.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Extra charges</Text>
            <Text style={styles.paymentInfoText}>{EXTRA_CHARGES_EXPLANATION}</Text>
            {service.pricing_add_ons.map((charge, index) => (
              <SummaryRow key={index}
                label={`${charge.label || 'Extra'}${charge.optional ? ' (optional)' : ''}`}
                value={formatExtraCharge(charge)} last={index === service.pricing_add_ons.length - 1} />
            ))}
          </View>
        )}
        {service.pricing_terms ? (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Terms &amp; conditions</Text>
            <Text style={styles.paymentInfoText}>{service.pricing_terms}</Text>
          </View>
        ) : null}

        {/* Scheduling */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>When do you need this?</Text>
          {SCHEDULE_OPTIONS.map(opt => (
            <TouchableOpacity
              key={opt.id}
              style={[styles.scheduleOption, scheduleType === opt.id && styles.scheduleOptionActive]}
              onPress={() => setScheduleType(opt.id)}
              accessibilityRole="button"
              accessibilityLabel={opt.label}
              accessibilityState={{ selected: scheduleType === opt.id }}>
              <Icon name={opt.icon} size={18} color={colors.primary} />
              <Text style={[styles.scheduleLabel, scheduleType === opt.id && styles.scheduleLabelActive]}>
                {opt.label}
              </Text>
              <View style={[styles.radio, scheduleType === opt.id && styles.radioActive]}>
                {scheduleType === opt.id && <View style={styles.radioDot} />}
              </View>
            </TouchableOpacity>
          ))}
          {scheduleType === 'specific' && (
            <View style={styles.dateInputWrap}>
              <TouchableOpacity
                style={styles.datePickerBtn}
                onPress={() => setShowDatePicker(true)}
                accessibilityRole="button"
                accessibilityLabel="Select date">
                <Text style={date ? styles.datePickerValue : styles.datePickerPlaceholder}>
                  {date ? formatDisplayDate(date) : 'Select a date'}
                </Text>
                <Icon name="calendar-outline" size={18} color={colors.textMuted} />
              </TouchableOpacity>
              {showDatePicker && (
                <>
                  {Platform.OS === 'ios' && (
                    <TouchableOpacity style={styles.pickerDoneBtn} onPress={() => setShowDatePicker(false)}>
                      <Text style={styles.pickerDoneText}>Done</Text>
                    </TouchableOpacity>
                  )}
                  <DateTimePicker
                    value={date || new Date()}
                    mode="date"
                    minimumDate={new Date()}
                    onChange={(event, selected) => {
                      if (Platform.OS === 'android') setShowDatePicker(false)
                      if (event?.type !== 'dismissed' && selected) setDate(selected)
                    }}
                  />
                </>
              )}
            </View>
          )}
        </View>

        {/* Location */}
        <View style={[styles.card, styles.locationCard]}>
          <Text style={styles.cardLabel}>{isGrazing ? 'Grazing location' : 'Where?'}</Text>
          <View style={styles.inputWrap}>
            <AddressAutocomplete
              value={location}
              placeholder={isGrazing ? 'Grazing property location' : 'Your address or property location'}
              onChangeText={(text) => {
                setLocation(text)
                setLatitude(null)
                setLongitude(null)
              }}
              onSelect={({ address, latitude: lat, longitude: lng }) => {
                setLocation(address || '')
                setLatitude(lat || null)
                setLongitude(lng || null)
              }}
            />
          </View>
          <View style={styles.pinBox}>
            <View style={{ flex: 1 }}>
              <Text style={styles.pinTitle}>{latitude && longitude ? 'Exact pin set' : 'Add exact pin'}</Text>
              <Text style={styles.pinBody}>
                {latitude && longitude
                  ? `${Number(latitude).toFixed(5)}, ${Number(longitude).toFixed(5)}`
                  : 'Mark the gate, shed, tank, paddock, or work area.'}
              </Text>
              {!!locationNote && <Text style={styles.pinNote} numberOfLines={2}>{locationNote}</Text>}
            </View>
            <TouchableOpacity
              style={styles.pinBtn}
              onPress={openPinPicker}
              accessibilityRole="button"
              accessibilityLabel={latitude && longitude ? 'Edit exact pin' : 'Drop exact pin'}>
              <Text style={styles.pinBtnText}>{latitude && longitude ? 'Edit pin' : 'Drop pin'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Notes */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Notes for provider <Text style={styles.optional}>(optional)</Text></Text>
          <View style={styles.inputWrap}>
            <TextInput
              style={[styles.input, styles.multiline]}
              placeholder={isGrazing ? 'Livestock type, number of head, grazing duration and any requirements...' : 'Any specific requirements or details...'}
              placeholderTextColor={colors.textMuted}
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              autoCapitalize="sentences"
              accessibilityLabel="Notes for provider, optional"
            />
          </View>
        </View>

        {/* Total + payment explanation */}
        <View style={styles.totalCard}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>{isQuoteRequired ? 'Price' : 'Base estimate'}</Text>
            <Text style={styles.totalAmount}>{isQuoteRequired ? 'Quote' : `$${total}`}</Text>
          </View>
          <View style={styles.paymentInfoBox}>
            <Text style={[styles.paymentInfoText, { marginBottom: 8 }]}>{requestCopy.nextStep}</Text>
            <Text style={[styles.paymentInfoText, { marginBottom: 8 }]}>{BASE_ESTIMATE_EXPLANATION}</Text>
            <Text style={styles.paymentInfoText}>{paymentExplanation}</Text>
          </View>
        </View>

      </ScrollView>

      {/* Send request */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Button
          title={requestCopy.action}
          onPress={handleConfirm}
          loading={submitting}
          accessibilityLabel={requestCopy.action}
        />
      </View>

      {/* Auth wall */}
      <Modal
        visible={showAuthSheet}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAuthSheet(false)}>
        <AuthSheet
          copy={requestCopy}
          onDismiss={() => setShowAuthSheet(false)}
          onLogin={() => requireAuth('login')}
          onRegister={() => requireAuth('register')}
        />
      </Modal>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },

  header: {
    backgroundColor: colors.background,
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  backBtn:     { marginBottom: 12, minHeight: 36, justifyContent: 'center', alignSelf: 'flex-start' },
  backBtnText: { color: colors.primary, fontSize: 15, fontWeight: '600' },
  kicker:      { fontSize: 13, fontWeight: '700', color: colors.accent, marginBottom: 8 },
  headerTitle: { fontSize: 34, lineHeight: 38, fontWeight: '700', color: colors.textPrimary },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  centerTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary, textAlign: 'center', marginBottom: 8 },
  centerBody: { fontSize: 14, lineHeight: 21, color: colors.textSecondary, textAlign: 'center' },

  scroll:        { flex: 1 },
  scrollContent: { padding: 16 },

  card: {
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    marginBottom: 14,
    paddingTop: 14,
  },
  locationCard: { overflow: 'visible', zIndex: 20, elevation: 20 },
  cardLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  optional: { fontSize: 11, fontWeight: '400', color: colors.textMuted, textTransform: 'none' },

  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 44,
  },
  summaryRowBorder: { borderBottomWidth: 1, borderBottomColor: '#f2f2f2' },
  summaryLabel: { fontSize: 14, color: colors.textMuted, fontWeight: '500' },
  summaryValue: { fontSize: 14, color: colors.textPrimary, fontWeight: '600', textAlign: 'right', flex: 1, marginLeft: 12 },

  scheduleOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f2f2f2',
    gap: 12,
    minHeight: 52,
  },
  scheduleOptionActive: { backgroundColor: '#f0faf5' },
  scheduleIcon:        { fontSize: 20 },
  scheduleLabel:       { flex: 1, fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  scheduleLabelActive: { color: colors.primary },
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
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },

  dateInputWrap: { paddingHorizontal: 16, paddingBottom: 14, paddingTop: 10 },
  datePickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.background,
    borderRadius: 10,
    padding: 13,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 48,
  },
  datePickerValue:       { fontSize: 15, color: colors.textPrimary, flex: 1 },
  datePickerPlaceholder: { fontSize: 15, color: colors.textMuted, flex: 1 },
  datePickerIcon:        { fontSize: 18, marginLeft: 8 },
  pickerDoneBtn:         { alignSelf: 'flex-end', paddingHorizontal: 16, paddingVertical: 8 },
  pickerDoneText:        { fontSize: 16, fontWeight: '600', color: colors.primary },

  inputWrap:     { paddingHorizontal: 16, paddingBottom: 14 },
  input: {
    backgroundColor: colors.background,
    borderRadius: 10,
    padding: 13,
    fontSize: 15,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.textPrimary,
  },
  multiline: { height: 100, textAlignVertical: 'top' },
  pinBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#f2f2f2',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  pinTitle: { fontSize: 14, fontWeight: '700', color: colors.textPrimary, marginBottom: 3 },
  pinBody: { fontSize: 13, lineHeight: 18, color: colors.textSecondary },
  pinNote: { fontSize: 12, lineHeight: 17, color: colors.textMuted, marginTop: 5 },
  pinBtn: {
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 42,
    justifyContent: 'center',
  },
  pinBtnText: { color: colors.primary, fontSize: 13, fontWeight: '700' },

  totalCard: {
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    marginBottom: 14,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  totalLabel:  { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  totalAmount: { fontSize: 22, fontWeight: 'bold', color: colors.primary },
  paymentInfoBox: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  paymentInfoText: { fontSize: 13, color: colors.primary, lineHeight: 20 },

  footer: {
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
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
  sheetTitle:        { fontSize: 22, fontWeight: 'bold', color: colors.primary, textAlign: 'center', marginBottom: 10 },
  sheetMessage:      { fontSize: 15, color: colors.textSecondary, textAlign: 'center', marginBottom: 28, lineHeight: 24 },
  sheetPrimary:      { backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 16, alignItems: 'center', marginBottom: 12, minHeight: 52, justifyContent: 'center' },
  sheetPrimaryText:  { color: colors.white, fontSize: 16, fontWeight: 'bold' },
  sheetSecondary:    { borderRadius: 10, paddingVertical: 16, alignItems: 'center', borderWidth: 2, borderColor: colors.primary, minHeight: 52, justifyContent: 'center' },
  sheetSecondaryText: { color: colors.primary, fontSize: 16, fontWeight: '600' },
})
