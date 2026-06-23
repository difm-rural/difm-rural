import React, { useCallback, useEffect, useState } from 'react'
import {
  Alert,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../lib/supabase'
import { colors } from '../theme/tokens'

function formatRate(service) {
  const { pricing_type, rate, unit_label } = service
  switch (pricing_type) {
    case 'quote_required': return 'Quote required'
    case 'hourly':   return `$${rate}/hr`
    case 'day_rate': return `$${rate}/day`
    case 'per_unit': return `$${rate}/${unit_label || 'unit'}`
    case 'fixed':    return `$${rate} fixed`
    default:         return `$${rate}`
  }
}

function listedAgo(createdAt) {
  if (!createdAt) return 'Listed recently'
  const created = new Date(createdAt)
  if (Number.isNaN(created.getTime())) return 'Listed recently'
  const days = Math.floor((Date.now() - created.getTime()) / (1000 * 60 * 60 * 24))
  if (days <= 0) return 'Listed today'
  if (days === 1) return 'Listed 1 day ago'
  if (days < 30) return `Listed ${days} days ago`
  const months = Math.floor(days / 30)
  return months === 1 ? 'Listed 1 month ago' : `Listed ${months} months ago`
}

function ServiceRow({ service, onToggleActive, onEdit, onDelete }) {
  const photoUrl = Array.isArray(service.photos) && service.photos.length > 0 ? service.photos[0] : null

  return (
    <View style={[styles.row, !service.is_active && styles.rowInactive]}>
      {photoUrl && <Image source={{ uri: photoUrl }} style={styles.rowPhoto} />}

      <View style={styles.rowTop}>
        <View style={styles.rowTitleWrap}>
          <Text style={styles.rowTitle} numberOfLines={2}>{service.title}</Text>
          <View style={[styles.pricingBadge, !service.is_active && styles.pricingBadgeInactive]}>
            <Text style={[styles.pricingBadgeText, !service.is_active && styles.pricingBadgeTextInactive]}>
              {formatRate(service)}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={[styles.toggleSwitch, service.is_active && styles.toggleSwitchOn]}
          onPress={() => onToggleActive(service)}
          accessibilityRole="switch"
          accessibilityLabel={service.is_active ? 'Pause service advertising' : 'Resume service advertising'}
          accessibilityState={{ checked: service.is_active }}>
          <View style={[styles.toggleThumb, service.is_active && styles.toggleThumbOn]} />
        </TouchableOpacity>
      </View>

      <Text style={[styles.statusText, !service.is_active && styles.statusTextPaused]}>
        {service.is_active ? 'Advertising live' : 'Advertising paused'}
      </Text>

      <Text style={styles.rowMeta}>
        {service.category}  ·  📍 {service.location_name || '—'}
      </Text>
      <Text style={styles.rowDate}>{listedAgo(service.created_at)}</Text>
      <Text style={styles.rowRate}>{formatRate(service)}</Text>

      {service.bookingCount > 0 && (
        <View style={styles.bookingCountWrap}>
          <Text style={styles.bookingCountText}>{service.bookingCount} booking{service.bookingCount !== 1 ? 's' : ''}</Text>
        </View>
      )}

      <View style={styles.rowActions}>
        <TouchableOpacity
          style={styles.editBtn}
          onPress={() => onEdit(service)}
          accessibilityRole="button"
          accessibilityLabel="Edit service">
          <Text style={styles.editBtnText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.deleteBtn}
          onPress={() => onDelete(service)}
          accessibilityRole="button"
          accessibilityLabel="Delete service">
          <Text style={styles.deleteBtnText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

export default function MyServicesScreen({ navigation, route }) {
  const insets = useSafeAreaInsets()
  const [services, setServices] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [userId, setUserId] = useState(null)

  useFocusEffect(useCallback(() => { fetchData() }, []))

  useEffect(() => {
    const createdService = route?.params?.createdService
    if (!createdService?.id) return

    setServices(prev => {
      if (prev.some(service => service.id === createdService.id)) return prev
      return [{ ...createdService, bookingCount: 0 }, ...prev]
    })
    setLoading(false)
    navigation.setParams({ createdService: null })
  }, [route?.params?.createdService])

  async function fetchData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    setUserId(user.id)

    const { data: servicesData, error: servicesError } = await supabase
      .from('services')
      .select('*')
      .eq('provider_id', user.id)
      .order('created_at', { ascending: false })

    if (servicesError) {
      Alert.alert('Could not load services', servicesError.message)
      setLoading(false)
      setRefreshing(false)
      return
    }

    const raw = servicesData || []
    if (raw.length === 0) {
      setServices([])
      setLoading(false)
      setRefreshing(false)
      return
    }

    const serviceIds = raw.map(s => s.id)
    const { data: bookingsData } = await supabase
      .from('bookings')
      .select('service_id')
      .in('service_id', serviceIds)

    const countMap = {}
    bookingsData?.forEach(b => { countMap[b.service_id] = (countMap[b.service_id] || 0) + 1 })

    setServices(raw.map(s => ({ ...s, bookingCount: countMap[s.id] || 0 })))
    setLoading(false)
    setRefreshing(false)
  }

  function onRefresh() {
    setRefreshing(true)
    fetchData()
  }

  async function handleToggleActive(service) {
    const { data: { user } } = await supabase.auth.getUser()
    const providerId = user?.id || userId
    if (!providerId) {
      Alert.alert('Sign in required', 'Please sign in again to update this service.')
      return
    }

    if (service.provider_id && service.provider_id !== providerId) {
      Alert.alert('Cannot update service', 'Only the provider who owns this service can change its advertising status.')
      return
    }

    const newVal = !service.is_active
    setServices(prev => prev.map(s => s.id === service.id ? { ...s, is_active: newVal } : s))
    const { error } = await supabase
      .from('services')
      .update({ is_active: newVal })
      .eq('id', service.id)
      .eq('provider_id', providerId)
    if (error) {
      setServices(prev => prev.map(s => s.id === service.id ? { ...s, is_active: !newVal } : s))
      Alert.alert('Error', error.message)
    }
  }

  function handleEdit(service) {
    navigation.navigate('CreateService', { service })
  }

  async function handleDelete(service) {
    const { data: bookingsData, error: bookingError } = await supabase
      .from('bookings')
      .select('id')
      .eq('service_id', service.id)
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
      `Delete "${service.title}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.from('services').delete().eq('id', service.id)
            if (error) {
              Alert.alert('Error', error.message)
            } else {
              setServices(prev => prev.filter(s => s.id !== service.id))
            }
          },
        },
      ]
    )
  }

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Go back">
          <Text style={styles.backBtnText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.kicker}>Services</Text>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle} accessibilityRole="header">My services</Text>
            <Text style={styles.headerSub}>{services.length} listed</Text>
          </View>
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => navigation.navigate('CreateService')}
            accessibilityRole="button"
            accessibilityLabel="Add new service">
            <Text style={styles.addBtnText}>+ Add</Text>
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      ) : services.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyIcon}>🔧</Text>
          <Text style={styles.emptyTitle}>No services listed yet</Text>
          <Text style={styles.emptyBody}>Create your first service to start receiving bookings</Text>
          <TouchableOpacity
            style={styles.createBtn}
            onPress={() => navigation.navigate('CreateService')}
            accessibilityRole="button"
            accessibilityLabel="Create your first service">
            <Text style={styles.createBtnText}>Create your first service →</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={services}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <ServiceRow
              service={item}
              onToggleActive={handleToggleActive}
              onEdit={handleEdit}
              onDelete={handleDelete}
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
    backgroundColor: colors.background,
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  backBtn:     { marginBottom: 12, minHeight: 36, justifyContent: 'center', alignSelf: 'flex-start' },
  backBtnText: { color: colors.primary, fontSize: 15, fontWeight: '600' },
  kicker:      { fontSize: 13, fontWeight: '700', color: colors.accent, marginBottom: 8 },
  headerRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  headerTitle: { fontSize: 34, lineHeight: 38, fontWeight: '700', color: colors.textPrimary },
  headerSub:   { fontSize: 15, lineHeight: 22, color: colors.textSecondary, marginTop: 8 },
  addBtn: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    minHeight: 44,
    justifyContent: 'center',
  },
  addBtnText: { color: colors.white, fontSize: 14, fontWeight: '700' },

  center:      { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  loadingText: { color: colors.textMuted, fontSize: 15 },
  emptyIcon:   { fontSize: 40, marginBottom: 12 },
  emptyTitle:  { fontSize: 17, fontWeight: '700', color: colors.textSecondary, marginBottom: 6 },
  emptyBody:   { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 21, marginBottom: 24 },
  createBtn:   { backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 14, minHeight: 48, justifyContent: 'center' },
  createBtnText: { color: colors.white, fontSize: 15, fontWeight: '700' },

  row: {
    backgroundColor: colors.white,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 0.5,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  rowInactive: { opacity: 0.6 },
  rowPhoto: {
    width: '100%',
    height: 138,
    borderRadius: 12,
    backgroundColor: colors.background,
    marginBottom: 12,
  },

  rowTop:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8, gap: 10 },
  rowTitleWrap: { flex: 1 },
  rowTitle:    { fontSize: 15, fontWeight: '700', color: colors.textPrimary, marginBottom: 6 },
  pricingBadge: { alignSelf: 'flex-start', backgroundColor: colors.primaryLight, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  pricingBadgeInactive: { backgroundColor: '#efefef' },
  pricingBadgeText:     { fontSize: 12, fontWeight: '700', color: colors.primary },
  pricingBadgeTextInactive: { color: colors.textMuted },

  toggleSwitch: {
    width: 48,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#ccc',
    padding: 2,
    justifyContent: 'center',
    flexShrink: 0,
  },
  toggleSwitchOn:  { backgroundColor: colors.primary },
  toggleThumb:     { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.white, alignSelf: 'flex-start' },
  toggleThumbOn:   { alignSelf: 'flex-end' },

  rowMeta:  { fontSize: 13, color: colors.textMuted, marginBottom: 4 },
  statusText: { fontSize: 12, color: colors.primary, fontWeight: '700', marginBottom: 6 },
  statusTextPaused: { color: colors.textMuted },
  rowDate:  { fontSize: 12, color: colors.textMuted, marginBottom: 4 },
  rowRate:  { fontSize: 14, fontWeight: '600', color: colors.primary, marginBottom: 8 },

  bookingCountWrap: { backgroundColor: colors.infoLight, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, alignSelf: 'flex-start', marginBottom: 10 },
  bookingCountText: { fontSize: 12, fontWeight: '700', color: colors.info },

  rowActions: { flexDirection: 'row', gap: 10 },
  editBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    minHeight: 40,
    justifyContent: 'center',
  },
  editBtnText:   { fontSize: 13, fontWeight: '700', color: colors.primary },
  deleteBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: colors.danger,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    minHeight: 40,
    justifyContent: 'center',
  },
  deleteBtnText: { fontSize: 13, fontWeight: '700', color: colors.danger },
})
