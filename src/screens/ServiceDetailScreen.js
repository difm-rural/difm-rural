import React, { useEffect, useState } from 'react'
import {
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../lib/supabase'
import { colors } from '../theme/tokens'

function getInitials(name) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0][0].toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function formatPricingType(type) {
  switch (type) {
    case 'hourly':   return 'Hourly rate'
    case 'per_unit': return 'Per unit'
    case 'fixed':    return 'Fixed price'
    case 'day_rate': return 'Day rate'
    default:         return type
  }
}

function DetailRow({ label, value, last }) {
  return (
    <View style={[styles.detailRow, !last && styles.detailRowBorder]}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  )
}

function asNumber(value, fallback = 0) {
  const next = Number(value)
  return Number.isFinite(next) ? next : fallback
}

function formatCurrency(value) {
  return asNumber(value).toFixed(2)
}

export default function ServiceDetailScreen({ route, navigation }) {
  const insets = useSafeAreaInsets()
  const { service: initialService } = route.params
  const [service, setService] = useState(initialService)
  const [profile, setProfile] = useState(initialService.profile || null)
  const [quantity, setQuantity] = useState(initialService.minimum_units || 1)
  const [isBooked, setIsBooked] = useState(false)

  const rate = asNumber(service.rate)
  const isEstimatable = ['hourly', 'per_unit', 'day_rate'].includes(service.pricing_type)
  const total = isEstimatable ? formatCurrency(quantity * rate) : formatCurrency(rate)

  useEffect(() => {
    fetchService()
    if (!profile) fetchProfile()
    fetchBookingStatus()
  }, [])

  async function fetchService() {
    if (!initialService?.id) return
    const { data } = await supabase
      .from('services')
      .select('*')
      .eq('id', initialService.id)
      .single()
    if (data) setService(prev => ({ ...prev, ...data }))
  }

  async function fetchBookingStatus() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase
      .from('bookings')
      .select('id')
      .eq('service_id', service.id)
      .eq('requester_id', user.id)
      .in('status', ['pending', 'confirmed', 'in_progress', 'awaiting_completion'])
      .limit(1)
    setIsBooked((data || []).length > 0)
  }

  async function fetchProfile() {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url')
      .eq('id', service.provider_id)
      .single()
    if (data) setProfile(data)
  }

  const initials = getInitials(profile?.full_name)
  const unitLabel = service.pricing_type === 'hourly' ? 'hour'
    : service.pricing_type === 'day_rate' ? 'day'
    : (service.unit_label || 'unit')

  const availabilityText = service.availability?.length
    ? service.availability.join(', ')
    : 'Flexible'
  const photos = Array.isArray(service.photos) ? service.photos : []

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 18 }]}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Go back">
          <Text style={styles.backBtnText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.kicker}>Service</Text>
        <Text style={styles.headerTitle} numberOfLines={2} accessibilityRole="header">{service.title}</Text>
        {profile?.full_name ? (
          <Text style={styles.headerSub}>by {profile.full_name}</Text>
        ) : null}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 80 }]}
        showsVerticalScrollIndicator={false}>

        {photos.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.photoStrip}
            style={styles.photoStripWrap}>
            {photos.map((url, i) => (
              <Image key={`${url}-${i}`} source={{ uri: url }} style={styles.servicePhoto} />
            ))}
          </ScrollView>
        )}

        {/* Provider section */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Provider</Text>
          <TouchableOpacity
            style={styles.providerRow}
            onPress={() => navigation.navigate('ProviderProfile', { providerId: service.provider_id })}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel={`View ${profile?.full_name || 'provider'}'s profile`}>
            {profile?.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarInitials}>{initials}</Text>
              </View>
            )}
            <View style={styles.providerInfo}>
              <Text style={styles.providerName}>{profile?.full_name || 'Provider'}</Text>
              <Text style={styles.providerMeta}>⭐ New provider</Text>
              {service.location_name ? (
                <Text style={styles.providerMeta}>📍 {service.location_name}</Text>
              ) : null}
            </View>
            <Text style={styles.providerChevron}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Service details */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Service details</Text>
          <DetailRow label="Pricing type" value={formatPricingType(service.pricing_type)} />
          <DetailRow
              label="Rate"
              value={service.pricing_type === 'hourly'
              ? `$${rate}/hr`
              : service.pricing_type === 'day_rate'
              ? `$${rate}/day`
              : service.pricing_type === 'per_unit'
              ? `$${rate}/${service.unit_label || 'unit'}`
              : `$${rate} fixed`}
          />
          {service.minimum_units > 1 && (
            <DetailRow
              label={`Minimum ${unitLabel}s`}
              value={`${service.minimum_units}`}
            />
          )}
          <DetailRow label="Equipment" value={service.includes_equipment ? 'Included' : 'Not included'} />
          {service.travel_range_km ? (
            <DetailRow label="Travel range" value={`${service.travel_range_km} km`} />
          ) : null}
          <DetailRow label="Availability" value={availabilityText} />
          <DetailRow
            label="Payment"
            value={service.payment_timing === 'upfront' ? 'Upfront' : 'On completion'}
            last
          />
        </View>

        {/* Description */}
        {service.description ? (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>About this service</Text>
            <Text style={styles.descText}>{service.description}</Text>
          </View>
        ) : null}

        {isBooked && (
          <View style={styles.bookedInfoBox}>
            <Text style={styles.bookedInfoIcon}>✓</Text>
            <Text style={styles.bookedInfoText}>You have an active booking for this service.</Text>
          </View>
        )}

        {/* Cost estimator */}
        {isEstimatable && (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Estimate your cost</Text>
            <View style={styles.estimatorRow}>
              <TouchableOpacity
                style={styles.qtyBtn}
                onPress={() => setQuantity(q => Math.max(service.minimum_units || 1, q - 1))}
                accessibilityRole="button"
                accessibilityLabel="Decrease quantity">
                <Text style={styles.qtyBtnText}>−</Text>
              </TouchableOpacity>
              <View style={styles.qtyDisplay}>
                <Text style={styles.qtyNum}>{quantity}</Text>
                <Text style={styles.qtyUnit}>{unitLabel}{quantity !== 1 ? 's' : ''}</Text>
              </View>
              <TouchableOpacity
                style={styles.qtyBtn}
                onPress={() => setQuantity(q => q + 1)}
                accessibilityRole="button"
                accessibilityLabel="Increase quantity">
                <Text style={styles.qtyBtnText}>+</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.estimateResult}>
              <Text style={styles.estimateLabel}>Estimated total</Text>
              <Text style={styles.estimateTotal}>${total} NZD</Text>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Book button */}
      <View style={[styles.bookFooter, { paddingBottom: insets.bottom + 12 }]}>
        <TouchableOpacity
          style={isBooked ? styles.viewBookingBtn : styles.bookBtn}
          onPress={isBooked
            ? () => Alert.alert('Your booking', 'Status: Pending confirmation.\nThe provider will be in touch soon.', [{ text: 'OK' }])
            : () => navigation.navigate('BookingConfirm', { service, quantity })}
          accessibilityRole="button"
          accessibilityLabel={isBooked ? 'View your booking' : 'Book this service'}>
          <Text style={isBooked ? styles.viewBookingBtnText : styles.bookBtnText}>
            {isBooked ? 'View booking →' : `Book now · $${total} NZD`}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },

  header: {
    backgroundColor: colors.background,
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  backBtn:      { marginBottom: 4, minHeight: 36, justifyContent: 'center', alignSelf: 'flex-start' },
  backBtnText:  { color: colors.primary, fontSize: 15, fontWeight: '700' },
  kicker: { fontSize: 13, fontWeight: '700', color: colors.primary, marginBottom: 8 },
  headerTitle: {
    fontSize: 32,
    lineHeight: 37,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 6,
    letterSpacing: 0,
  },
  headerSub: { fontSize: 15, lineHeight: 22, color: colors.textSecondary },

  scroll:       { flex: 1 },
  scrollContent: { padding: 16 },
  photoStripWrap: { marginBottom: 14 },
  photoStrip: { gap: 10 },
  servicePhoto: {
    width: 260,
    height: 160,
    borderRadius: 16,
    backgroundColor: colors.border,
  },

  card: {
    backgroundColor: colors.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    marginBottom: 14,
    paddingTop: 14,
  },
  cardLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: 16,
    marginBottom: 12,
  },

  providerRow:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 16, gap: 14 },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  avatarFallback: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primaryLight,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: { fontSize: 20, fontWeight: '700', color: colors.primary },
  providerInfo:    { flex: 1 },
  providerName:    { fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginBottom: 3 },
  providerMeta:    { fontSize: 13, color: colors.textMuted, marginTop: 1 },
  providerChevron: { fontSize: 22, color: colors.textMuted, fontWeight: '300' },

  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 44,
  },
  detailRowBorder: { borderBottomWidth: 1, borderBottomColor: '#f2f2f2' },
  detailLabel: { fontSize: 14, color: colors.textMuted, fontWeight: '600', flex: 1 },
  detailValue: { fontSize: 14, color: colors.textPrimary, fontWeight: '500', textAlign: 'right', flex: 1 },

  descText: { fontSize: 14, color: colors.textSecondary, lineHeight: 22, paddingHorizontal: 16, paddingBottom: 16 },

  estimatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  qtyBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  qtyBtnText:  { fontSize: 22, fontWeight: '700', color: colors.primary, lineHeight: 26 },
  qtyDisplay:  { alignItems: 'center', minWidth: 80 },
  qtyNum:      { fontSize: 32, fontWeight: 'bold', color: colors.primary },
  qtyUnit:     { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  estimateResult: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#f2f2f2',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  estimateLabel: { fontSize: 14, fontWeight: '600', color: colors.textMuted },
  estimateTotal: { fontSize: 20, fontWeight: 'bold', color: colors.primary },

  bookedInfoBox: {
    backgroundColor: colors.primaryLight,
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  bookedInfoIcon: { fontSize: 18, color: colors.primary },
  bookedInfoText: { fontSize: 14, color: colors.primary, fontWeight: '600', flex: 1 },
  viewBookingBtn: {
    backgroundColor: colors.white,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    minHeight: 52,
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.primary,
  },
  viewBookingBtnText: { color: colors.primary, fontSize: 16, fontWeight: 'bold' },

  bookFooter: {
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  bookBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    minHeight: 52,
    justifyContent: 'center',
  },
  bookBtnText: { color: colors.white, fontSize: 16, fontWeight: 'bold' },
})
