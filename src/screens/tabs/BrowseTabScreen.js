import React, { useCallback, useState } from 'react'
import {
  FlatList,
  Keyboard,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../../lib/supabase'
import { colors } from '../../theme/tokens'
import { useUser } from '../../context/UserContext'
import JobServiceCard, { CARD_GAP, CARD_WIDTH, SNAP_INTERVAL } from '../../components/JobServiceCard'
import { getCurrentLocation, haversineDistance } from '../../lib/location'

const FILTERS = [
  { id: 'All',         label: 'All' },
  { id: 'Machinery',   label: 'Machinery' },
  { id: 'Labour',      label: 'Labour' },
  { id: 'Fencing',     label: 'Fencing' },
  { id: 'Water',       label: 'Water' },
  { id: 'Animal care', label: 'Animal care' },
  { id: 'Maintenance', label: 'Maintenance' },
  { id: 'Landscaping', label: 'Landscaping' },
  { id: 'Spraying',    label: 'Spraying' },
  { id: 'Other',       label: 'Other' },
]

function itemMatchesSearch(item, query) {
  if (!query.trim()) return true
  const q = query.trim().toLowerCase()
  return [item.title, item.description, item.category, item.location_name].some(
    v => String(v || '').toLowerCase().includes(q)
  )
}

function isNearUser(item, userRegion) {
  if (!userRegion || !item.location_name) return false
  const regionWords = userRegion.toLowerCase().split(/[\s,]+/).filter(w => w.length > 2)
  const loc = (item.location_name || '').toLowerCase()
  return regionWords.some(word => loc.includes(word))
}

function getServiceCoords(item) {
  const lat = item.service_latitude ?? null
  const lng = item.service_longitude ?? null
  if (lat == null || lng == null) return null
  return { lat: parseFloat(lat), lng: parseFloat(lng) }
}

function HorizontalSection({ title, items, onPressItem }) {
  if (!items.length) return null
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      <FlatList
        horizontal
        data={items}
        keyExtractor={item => `service-${item.id}`}
        renderItem={({ item }) => (
          <View style={styles.serviceCardWrap}>
            <JobServiceCard
              item={item}
              onPress={() => onPressItem(item)}
            />
            {item.is_active === false && (
              <View style={styles.pausedBadge}>
                <Text style={styles.pausedBadgeText}>Advertising paused</Text>
              </View>
            )}
          </View>
        )}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.hListContent}
        ItemSeparatorComponent={() => <View style={{ width: CARD_GAP }} />}
        ListFooterComponent={<View style={{ width: 40 }} />}
        snapToInterval={SNAP_INTERVAL}
        decelerationRate="fast"
      />
    </View>
  )
}

export default function BrowseTabScreen({ navigation }) {
  const insets = useSafeAreaInsets()
  const { profile } = useUser()
  const isProvider = profile?.primary_role === 'provider' || profile?.primary_role === 'both'
  const [currentUserId, setCurrentUserId] = useState(null)
  const [services,    setServices]    = useState([])
  const [userRegion,  setUserRegion]  = useState('')
  const [userLat,     setUserLat]     = useState(null)
  const [userLng,     setUserLng]     = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [refreshing,  setRefreshing]  = useState(false)
  const [filter,      setFilter]      = useState('All')
  const [search,      setSearch]      = useState('')

  useFocusEffect(useCallback(() => { load() }, []))

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    setCurrentUserId(user?.id || null)

    if (user?.id) {
      const { data: prof } = await supabase
        .from('profiles')
        .select('region')
        .eq('id', user.id)
        .single()
      setUserRegion(prof?.region || '')
    } else {
      setUserRegion('')
    }

    try {
      const coords = await getCurrentLocation()
      if (coords) {
        setUserLat(coords.latitude)
        setUserLng(coords.longitude)
      }
    } catch { /* location denied — fall back to region text matching */ }

    await fetchServices(user?.id || null)
    setLoading(false)
    setRefreshing(false)
  }

  async function fetchServices(userId = currentUserId) {
    const { data: servicesData } = await supabase
      .from('services')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false })

    let raw = servicesData || []
    if (userId) {
      const { data: ownServicesData } = await supabase
        .from('services')
        .select('*')
        .eq('provider_id', userId)
        .order('created_at', { ascending: false })

      const byId = {}
      raw.forEach(service => { byId[service.id] = service })
      ownServicesData?.forEach(service => { byId[service.id] = service })
      raw = Object.values(byId)
    }

    if (raw.length === 0) { setServices([]); return }

    const providerIds = [...new Set(raw.map(s => s.provider_id).filter(Boolean))]
    const [{ data: profilesData }, { data: reviewsData }] = providerIds.length > 0
      ? await Promise.all([
        supabase.from('profiles').select('id, full_name, avatar_url').in('id', providerIds),
        supabase.from('reviews').select('reviewee_id, rating').in('reviewee_id', providerIds),
      ])
      : [{ data: [] }, { data: [] }]

    const profileMap = {}
    const ratingMap  = {}
    profilesData?.forEach(p => { profileMap[p.id] = p })
    reviewsData?.forEach(r => {
      if (!ratingMap[r.reviewee_id]) ratingMap[r.reviewee_id] = { total: 0, count: 0 }
      ratingMap[r.reviewee_id].total += r.rating || 0
      ratingMap[r.reviewee_id].count += 1
    })

    setServices(raw.map(s => {
      const summary = ratingMap[s.provider_id] || { total: 0, count: 0 }
      return {
        ...s,
        _type: 'service',
        profile: profileMap[s.provider_id] || null,
        ratingAverage: summary.count > 0 ? summary.total / summary.count : 0,
        ratingCount:   summary.count,
      }
    }))
  }

  function onRefresh() {
    setRefreshing(true)
    load()
  }

  function handlePress(item) {
    if (item.provider_id === currentUserId) {
      navigation.navigate('CreateService', { service: item })
      return
    }
    navigation.navigate('ServiceDetail', { service: item })
  }

  // Filter and annotate with GPS distance
  const filtered = (() => {
    let items = [...services]
    if (filter !== 'All') items = items.filter(i => i.category === filter)
    if (search.trim())    items = items.filter(i => itemMatchesSearch(i, search))
    items = items.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

    if (userLat != null && userLng != null) {
      items = items.map(i => {
        const coords = getServiceCoords(i)
        if (!coords) return { ...i, _distanceKm: null }
        const d = haversineDistance(userLat, userLng, coords.lat, coords.lng)
        return { ...i, _distanceKm: d.toFixed(1) }
      })
    }
    return items
  })()

  const nearYou = filtered.filter(i => {
    if (userLat != null && i._distanceKm != null) return parseFloat(i._distanceKm) <= 50
    return isNearUser(i, userRegion)
  })
  const allServices = filtered.filter(i => {
    if (userLat != null && i._distanceKm != null) return parseFloat(i._distanceKm) > 50
    return !isNearUser(i, userRegion)
  })
  const yourServices = isProvider && currentUserId
    ? filtered.filter(i => i.provider_id === currentUserId)
    : []
  const otherServices = isProvider && currentUserId
    ? filtered.filter(i => i.provider_id !== currentUserId)
    : []
  const isEmpty = isProvider
    ? yourServices.length === 0 && otherServices.length === 0
    : nearYou.length === 0 && allServices.length === 0

  return (
    <View style={styles.screen}>

      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.brandLabel}>RURAL SERVICES</Text>
        <Text style={styles.title}>Services</Text>
        <Text style={styles.subtitle}>Book rural service providers</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search fencing, water, machinery..."
          placeholderTextColor="rgba(255,255,255,0.6)"
          value={search}
          onChangeText={setSearch}
          onSubmitEditing={Keyboard.dismiss}
          returnKeyType="done"
          blurOnSubmit
          accessibilityLabel="Search services"
        />
      </View>

      {isProvider && (
        <TouchableOpacity
          style={styles.manageBanner}
          onPress={() => navigation.navigate('MyServices')}
          accessibilityRole="button"
          accessibilityLabel="Manage your advertised services">
          <Text style={styles.manageBannerTitle}>Manage your services</Text>
          <Text style={styles.manageBannerText}>Edit, pause advertising, or delete a listing</Text>
        </TouchableOpacity>
      )}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterBar}
        contentContainerStyle={styles.filterContent}>
        {FILTERS.map(f => (
          <TouchableOpacity
            key={f.id}
            style={[styles.chip, filter === f.id && styles.chipActive]}
            onPress={() => setFilter(f.id)}
            accessibilityRole="button"
            accessibilityState={{ selected: filter === f.id }}>
            <Text style={[styles.chipText, filter === f.id && styles.chipTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <View style={styles.center}>
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      ) : isEmpty ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>No services available yet</Text>
          <Text style={styles.emptyBody}>Check back soon or post a job to get quotes.</Text>
          <TouchableOpacity
            style={styles.emptyBtn}
            onPress={() => navigation.getParent()?.navigate('Jobs', { screen: 'PostJob' })}
            accessibilityRole="button"
            accessibilityLabel="Post a job">
            <Text style={styles.emptyBtnText}>Post a job →</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }>

          {isProvider ? (
            <>
              <HorizontalSection
                title="Your services"
                items={yourServices}
                onPressItem={handlePress}
              />

              <HorizontalSection
                title="Other services"
                items={otherServices}
                onPressItem={handlePress}
              />
            </>
          ) : (
            <>
              <HorizontalSection
                title="Near you"
                items={nearYou}
                onPressItem={handlePress}
              />

              <HorizontalSection
                title="All services"
                items={allServices}
                onPressItem={handlePress}
              />

              {allServices.length === 0 && nearYou.length > 0 && (
                <View style={styles.noMore}>
                  <Text style={styles.noMoreText}>All available services shown above</Text>
                </View>
              )}
            </>
          )}
        </ScrollView>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },

  header: {
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingBottom: 18,
  },
  brandLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#95d5b2',
    letterSpacing: 3,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: colors.white,
    marginBottom: 2,
    lineHeight: 30,
  },
  subtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.75)',
    marginBottom: 14,
  },
  searchInput: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 11,
    fontSize: 14,
    color: colors.white,
    minHeight: 46,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },

  manageBanner: {
    backgroundColor: colors.white,
    marginHorizontal: 14,
    marginTop: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.primary,
    padding: 12,
  },
  manageBannerTitle: { fontSize: 14, color: colors.primary, fontWeight: '800', marginBottom: 3 },
  manageBannerText: { fontSize: 12, color: colors.textSecondary, lineHeight: 16 },

  filterBar: { flexGrow: 0, backgroundColor: colors.background },
  filterContent: { paddingHorizontal: 14, paddingVertical: 12, gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chipActive:     { backgroundColor: colors.textPrimary, borderColor: colors.textPrimary },
  chipText:       { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  chipTextActive: { color: colors.white },

  section: { marginTop: 20 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
  hListContent: { paddingLeft: 14 },
  serviceCardWrap: { width: CARD_WIDTH },
  pausedBadge: {
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    marginTop: 6,
  },
  pausedBadgeText: { fontSize: 11, fontWeight: '700', color: colors.textMuted, textAlign: 'center' },

  center:      { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  loadingText: { color: colors.textMuted, fontSize: 15 },
  emptyTitle:  { fontSize: 18, fontWeight: '700', color: colors.textPrimary, marginBottom: 8, textAlign: 'center' },
  emptyBody:   { fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginBottom: 20 },
  emptyBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 13,
  },
  emptyBtnText: { color: colors.white, fontSize: 15, fontWeight: '700' },

  noMore:     { paddingVertical: 20, alignItems: 'center' },
  noMoreText: { fontSize: 13, color: colors.textMuted },
})
