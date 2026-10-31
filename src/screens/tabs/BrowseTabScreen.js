import React, { useCallback, useRef, useState } from 'react'
import {
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
import Icon from '../../components/Icon'
import ServiceListCard from '../../components/ServiceListCard'
import EmptyState from '../../components/EmptyState'
import { SkeletonList } from '../../components/SkeletonCard'
import useNearbyBrowsing from '../../hooks/useNearbyBrowsing'
import NearbyControls from '../../components/NearbyControls'
import { filterNearby } from '../../lib/nearbyBrowsing'
import { availabilityDisplay } from '../../lib/providerAvailability'

function itemMatchesSearch(item, query) {
  if (!query.trim()) return true
  const q = query.trim().toLowerCase()
  return [item.title, item.description, item.category, item.location_name].some(
    v => String(v || '').toLowerCase().includes(q)
  )
}

function ServiceSection({ title, items, onPressItem }) {
  if (!items.length) return null
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      <View style={styles.vList}>
        {items.map(item => (
          <ServiceListCard
            key={`service-${item.id}`}
            item={item}
            onPress={() => onPressItem(item)}
          />
        ))}
      </View>
    </View>
  )
}

export default function BrowseTabScreen({ navigation }) {
  const insets = useSafeAreaInsets()
  const [currentUserId, setCurrentUserId] = useState(null)
  const [services,    setServices]    = useState([])
  const nearby = useNearbyBrowsing()
  const [loading,     setLoading]     = useState(true)
  const [refreshing,  setRefreshing]  = useState(false)
  const [search,      setSearch]      = useState('')
  const [loadError, setLoadError] = useState(false)
  const loadingRef = useRef(false)

  useFocusEffect(useCallback(() => { load() }, []))

  async function load() {
    if (loadingRef.current) return
    loadingRef.current = true
    try {
    const { data: { user } } = await supabase.auth.getUser()
    setCurrentUserId(user?.id || null)

    await fetchServices()
    setLoadError(false)
    } catch {
      setLoadError(true)
    } finally {
      loadingRef.current = false
      setLoading(false)
      setRefreshing(false)
    }
  }

  async function fetchServices() {
    const { data: servicesData, error } = await supabase
      .from('services')
      .select('*')
      .eq('is_active', true)
      .is('closed_at', null)
      .order('created_at', { ascending: false })

    if (error) throw error
    const raw = servicesData || []

    if (raw.length === 0) { setServices([]); return }

    const providerIds = [...new Set(raw.map(s => s.provider_id).filter(Boolean))]
    const [{ data: profilesData }, { data: reviewsData }] = providerIds.length > 0
      ? await Promise.all([
        supabase.from('profiles_public').select('id, full_name, avatar_url, availability_status, availability_until, availability_updated_at').in('id', providerIds),
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
      const provider = profileMap[s.provider_id] || null
      const availability = availabilityDisplay(
        provider?.availability_status,
        provider?.availability_until,
        provider?.availability_updated_at,
      )
      return {
        ...s,
        _type: 'service',
        profile: provider,
        _availabilityRank: availability.tone === 'positive' ? 0 : availability.tone === 'limited' ? 1 : availability.stale ? 3 : 2,
        ratingAverage: summary.count > 0 ? summary.total / summary.count : 0,
        ratingCount:   summary.count,
      }
    }))
  }

  function onRefresh() {
    if (loadingRef.current) return
    setRefreshing(true)
    load()
  }

  function handlePress(item) {
    // Tapping any card — including your own listings — opens the requester-facing
    // preview. Editing happens via the secondary "My listings" action.
    navigation.navigate('ServiceDetail', { service: item })
  }

  const result = filterNearby(services.filter(item => itemMatchesSearch(item, search)), nearby)
  const filtered = result.items
  const isEmpty = filtered.length === 0

  return (
    <View style={styles.screen}>

      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={styles.brandRow}>
          <Text style={styles.brandLabel}>RURAL CONNECTIONS</Text>
          <TouchableOpacity
            style={styles.helpBtn}
            onPress={() => navigation.navigate('HowItWorks')}
            accessibilityRole="button"
            accessibilityLabel="How it works">
            <Text style={styles.helpText}>How it works</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.title}>Listings</Text>
        <Text style={styles.subtitle}>Services, grazing, hire and local goods</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search fencing, water, machinery..."
          placeholderTextColor={colors.textMuted}
          value={search}
          onChangeText={setSearch}
          onSubmitEditing={Keyboard.dismiss}
          returnKeyType="done"
          blurOnSubmit
          accessibilityLabel="Search listings"
        />
      </View>

      {currentUserId && (
        <TouchableOpacity
          style={styles.manageBanner}
          onPress={() => navigation.navigate('MyServices')}
          accessibilityRole="button"
          accessibilityLabel="My listings">
          <Text style={styles.manageBannerTitle}>My listings</Text>
          <Text style={styles.manageBannerText}>Manage live, paused and closed listings</Text>
        </TouchableOpacity>
      )}

      <ScrollView
        style={{ flex: 1 }}
        alwaysBounceVertical
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: insets.bottom + 80 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}>
      <NearbyControls nearby={nearby} unlocated={result.unlocated} />
      {loading ? (
        <SkeletonList count={3} style={{ paddingHorizontal: 16, paddingTop: 16 }} />
      ) : loadError ? (
        <EmptyState icon="cloud-offline-outline"
          title="Couldn't load listings"
          body="Check your connection and try again."
          actionLabel="Retry" onAction={onRefresh} />
      ) : isEmpty && result.active ? (
        <EmptyState icon="location-outline" title={search.trim() ? `No nearby listings match “${search.trim()}”` : `No listings within ${nearby.radius} km`}
          body="Try a wider distance or browse All New Zealand." actionLabel="All New Zealand" onAction={() => nearby.setRadius(null)} />
      ) : isEmpty && search.trim() ? (
        <EmptyState icon="search-outline"
          title={`No listings match “${search.trim()}”`}
          body="Try another word or clear your search."
          actionLabel="Clear search" onAction={() => setSearch('')} />
      ) : isEmpty ? (
          <EmptyState
            icon="pricetags-outline"
            title="No listings available yet"
            body="Check back soon, or post a job to get offers from locals."
            actionLabel="Post a job"
            actionIcon="arrow-forward"
            onAction={() => {
              if (!currentUserId) navigation.navigate('GuestPostJob')
              else navigation.getParent()?.navigate('Jobs', { screen: 'PostJob', params: { origin: 'Browse' } })
            }}
          />
      ) : (
        <>
          <ServiceSection title={result.active ? 'Near you' : 'All listings'} items={filtered} onPressItem={handlePress} />
        </>
      )}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },

  header: {
    backgroundColor: colors.background,
    paddingHorizontal: 20,
    paddingBottom: 18,
  },
  brandRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', columnGap: 12 },
  helpBtn: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  helpText: { color: colors.primary, fontSize: 13, fontWeight: '700' },
  brandLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.accent,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 2,
    lineHeight: 32,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 14,
  },
  searchInput: {
    backgroundColor: colors.white,
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 11,
    fontSize: 14,
    color: colors.textPrimary,
    minHeight: 46,
    borderWidth: 1,
    borderColor: colors.border,
  },

  manageBanner: {
    backgroundColor: colors.primary,
    marginHorizontal: 14,
    marginTop: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.primary,
    padding: 12,
  },
  manageBannerTitle: { fontSize: 14, color: colors.white, fontWeight: '600', marginBottom: 3 },
  manageBannerText: { fontSize: 12, color: colors.white, opacity: 0.85, lineHeight: 16 },


  section: { marginTop: 20 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
  vList: { paddingHorizontal: 16, gap: 10 },

  noMore:     { paddingVertical: 20, alignItems: 'center' },
  noMoreText: { fontSize: 13, color: colors.textMuted },
})
