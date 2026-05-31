import React, { useCallback, useState } from 'react'
import {
  Alert,
  FlatList,
  Keyboard,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Image,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../lib/supabase'
import { colors } from '../theme/tokens'

const CATEGORIES = ['All', 'Machinery', 'Labour', 'Water delivery', 'Animal care', 'Maintenance', 'Fencing', 'Other']

function getInitials(name) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0][0].toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function formatRate(service) {
  const { pricing_type, rate, unit_label } = service
  switch (pricing_type) {
    case 'hourly':   return `$${rate}/hr`
    case 'day_rate': return `$${rate}/day`
    case 'per_unit': return `$${rate}/${unit_label || 'unit'}`
    case 'fixed':    return `$${rate} fixed`
    default:         return `$${rate}`
  }
}

function ServiceCard({ service, onPress, isBooked }) {
  const profile = service.profile || {}
  const initials = getInitials(profile.full_name)

  const chips = []
  if (service.includes_equipment) chips.push('Incl. equipment')
  if (service.travel_range_km)    chips.push(`${service.travel_range_km}km range`)
  if ((service.pricing_type === 'hourly' || service.pricing_type === 'per_unit') && service.minimum_units > 1) {
    chips.push(`Min ${service.minimum_units} ${service.pricing_type === 'hourly' ? 'hrs' : (service.unit_label || 'units')}`)
  }

  return (
    <View style={[styles.card, isBooked && styles.cardBooked]}>
      {isBooked && (
        <View style={styles.bookedBadge}>
          <Text style={styles.bookedBadgeText}>Booked ✓</Text>
        </View>
      )}

      {/* Provider row */}
      <View style={styles.providerRow}>
        {profile.avatar_url ? (
          <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarFallback}>
            <Text style={styles.avatarInitials}>{initials}</Text>
          </View>
        )}
        <View style={styles.providerInfo}>
          <Text style={styles.providerName} numberOfLines={1}>{profile.full_name || 'Provider'}</Text>
          <Text style={styles.providerMeta}>⭐ New · 📍 {service.location_name || '—'}</Text>
        </View>
        <View style={styles.categoryBadge}>
          <Text style={styles.categoryBadgeText}>{service.category}</Text>
        </View>
      </View>

      {/* Title + description */}
      <Text style={styles.serviceTitle}>{service.title}</Text>
      {service.description ? (
        <Text style={styles.serviceDesc} numberOfLines={2}>{service.description}</Text>
      ) : null}

      {/* Detail chips */}
      {chips.length > 0 && (
        <View style={styles.chipRow}>
          {chips.map(c => (
            <View key={c} style={styles.chip}>
              <Text style={styles.chipText}>{c}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Footer */}
      <View style={styles.cardFooter}>
        <Text style={styles.rateText}>{formatRate(service)}</Text>
        <View style={styles.footerBtns}>
          <TouchableOpacity
            style={styles.viewBtn}
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel={`View ${service.title}`}>
            <Text style={styles.viewBtnText}>View</Text>
          </TouchableOpacity>
          {isBooked ? (
            <TouchableOpacity
              style={styles.viewBookingBtn}
              onPress={onPress}
              accessibilityRole="button"
              accessibilityLabel={`View booking for ${service.title}`}>
              <Text style={styles.viewBookingBtnText}>View booking</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.bookBtn}
              onPress={onPress}
              accessibilityRole="button"
              accessibilityLabel={`Book ${service.title}`}>
              <Text style={styles.bookBtnText}>Book</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  )
}

export default function ServicesListScreen({ navigation }) {
  const insets = useSafeAreaInsets()
  const [services, setServices] = useState([])
  const [bookedServiceIds, setBookedServiceIds] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [search, setSearch] = useState('')

  useFocusEffect(useCallback(() => { fetchServices() }, []))

  async function fetchServices() {
    const { data: servicesData } = await supabase
      .from('services')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false })

    const raw = servicesData || []
    if (raw.length === 0) {
      setServices([])
      setBookedServiceIds(new Set())
      setLoading(false)
      setRefreshing(false)
      return
    }

    const providerIds = [...new Set(raw.map(s => s.provider_id))]
    const { data: profilesData } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url')
      .in('id', providerIds)

    const profileMap = {}
    profilesData?.forEach(p => { profileMap[p.id] = p })

    setServices(raw.map(s => ({ ...s, profile: profileMap[s.provider_id] || null })))

    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: bookingsData } = await supabase
        .from('bookings')
        .select('service_id')
        .eq('requester_id', user.id)
        .in('status', ['pending', 'confirmed', 'in_progress', 'awaiting_completion'])
      setBookedServiceIds(new Set((bookingsData || []).map(b => b.service_id)))
    } else {
      setBookedServiceIds(new Set())
    }

    setLoading(false)
    setRefreshing(false)
  }

  function onRefresh() {
    setRefreshing(true)
    fetchServices()
  }

  function serviceMatchesSearch(service, query) {
    if (!query.trim()) return true
    const q = query.trim().toLowerCase()
    return [
      service.title,
      service.description,
      service.category,
      service.location_name,
      service.unit_label,
      service.profile?.full_name,
    ].some(value => String(value || '').toLowerCase().includes(q))
  }

  const filtered = services.filter(s => {
    const catMatch = selectedCategory === 'All' || s.category === selectedCategory
    const searchMatch = serviceMatchesSearch(s, search)
    return catMatch && searchMatch
  })

  return (
    <View style={styles.screen}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Go back">
          <Text style={styles.backBtnText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} accessibilityRole="header">Services</Text>
        <Text style={styles.headerSub}>Book a rural service provider near you</Text>
        <View style={styles.searchWrap}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search services..."
            placeholderTextColor="rgba(255,255,255,0.6)"
            value={search}
            onChangeText={setSearch}
            onSubmitEditing={Keyboard.dismiss}
            returnKeyType="done"
            blurOnSubmit
            accessibilityLabel="Search services"
          />
        </View>
      </View>

      {/* Category filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterBar}
        contentContainerStyle={styles.filterBarContent}>
        {CATEGORIES.map(cat => (
          <TouchableOpacity
            key={cat}
            style={[styles.filterChip, selectedCategory === cat && styles.filterChipActive]}
            onPress={() => setSelectedCategory(cat)}
            accessibilityRole="button"
            accessibilityLabel={cat}
            accessibilityState={{ selected: selectedCategory === cat }}>
            <Text style={[styles.filterChipText, selectedCategory === cat && styles.filterChipTextActive]}>
              {cat}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* List */}
      {loading ? (
        <View style={styles.center}>
          <Text style={styles.loadingText}>Loading services...</Text>
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>No services found</Text>
          <Text style={styles.emptyBody}>Try a different category or search term</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <ServiceCard
              service={item}
              isBooked={bookedServiceIds.has(item.id)}
              onPress={() => navigation.navigate('ServiceDetail', { service: item })}
            />
          )}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 16 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },

  header: {
    backgroundColor: colors.primary,
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  backBtn:     { marginBottom: 8, minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  backBtnText: { color: 'rgba(255,255,255,0.85)', fontSize: 16, fontWeight: '600' },
  headerTitle: { fontSize: 26, fontWeight: 'bold', color: colors.white, marginBottom: 4 },
  headerSub:   { fontSize: 14, color: 'rgba(255,255,255,0.75)', marginBottom: 14 },
  searchWrap:  {},
  searchInput: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.white,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },

  filterBar: { maxHeight: 52, flexGrow: 0 },
  filterBarContent: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive:     { backgroundColor: colors.primary, borderColor: colors.primary },
  filterChipText:       { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  filterChipTextActive: { color: colors.white },

  center:      { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  loadingText: { color: colors.textMuted, fontSize: 15 },
  emptyTitle:  { fontSize: 16, fontWeight: '700', color: colors.textSecondary, marginBottom: 6 },
  emptyBody:   { fontSize: 14, color: colors.textMuted, textAlign: 'center' },

  card: {
    backgroundColor: colors.white,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 0.5,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  cardBooked: { borderLeftWidth: 3, borderLeftColor: colors.primary },

  bookedBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    zIndex: 1,
  },
  bookedBadgeText: { fontSize: 11, fontWeight: '700', color: colors.white },

  providerRow:   { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 10 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  avatarFallback: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primaryLight,
    borderWidth: 1.5,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: { fontSize: 14, fontWeight: '700', color: colors.primary },
  providerInfo:   { flex: 1 },
  providerName:   { fontSize: 13, fontWeight: '700', color: colors.textPrimary },
  providerMeta:   { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  categoryBadge:  { backgroundColor: colors.primaryLight, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  categoryBadgeText: { fontSize: 11, fontWeight: '700', color: colors.primary },

  serviceTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary, marginBottom: 4 },
  serviceDesc:  { fontSize: 13, color: colors.textSecondary, lineHeight: 19, marginBottom: 10 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  chip:     { backgroundColor: '#f0f0f0', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  chipText: { fontSize: 12, color: colors.textSecondary, fontWeight: '500' },

  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingTop: 12,
    marginTop: 2,
  },
  rateText:   { fontSize: 16, fontWeight: '700', color: colors.primary },
  footerBtns: { flexDirection: 'row', gap: 8 },
  viewBtn: {
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minHeight: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewBtnText: { fontSize: 13, fontWeight: '700', color: colors.primary },
  bookBtn: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minHeight: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bookBtnText: { fontSize: 13, fontWeight: '700', color: colors.white },
  viewBookingBtn: {
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minHeight: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewBookingBtnText: { fontSize: 13, fontWeight: '700', color: colors.primary },
})
