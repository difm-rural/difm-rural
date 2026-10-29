import DevelopmentBadge from '../components/DevelopmentBadge'
import { resolvePublicJobLocations } from '../lib/jobDiscovery'
import React, { useEffect, useRef, useState } from 'react'
import {
  Alert,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../lib/supabase'
import { colors } from '../theme/tokens'
import Icon from '../components/Icon'
import useNearbyBrowsing from '../hooks/useNearbyBrowsing'
import NearbyControls from '../components/NearbyControls'
import { filterNearby } from '../lib/nearbyBrowsing'
import EmptyState from '../components/EmptyState'
import { SkeletonList } from '../components/SkeletonCard'
import JobServiceCard, { CARD_GAP, SNAP_INTERVAL } from '../components/JobServiceCard'

function HorizontalSection({ title, items, onPressItem, onGuestAction }) {
  if (!items.length) return null
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <FlatList
        horizontal
        data={items}
        keyExtractor={item => `${item._type}-${item.id}`}
        renderItem={({ item }) => (
          <JobServiceCard
            item={item}
            isGuest
            onGuestAction={onGuestAction}
            onPress={() => onPressItem(item)}
          />
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

export default function LandingScreen({ navigation }) {
  const insets = useSafeAreaInsets()
  const nearby = useNearbyBrowsing()
  const [jobs, setJobs] = useState([])
  const [services, setServices] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [mode, setMode] = useState('home')
  const [search, setSearch] = useState('')
  const [loadErrors, setLoadErrors] = useState({ jobs: false, listings: false })
  const loadingRef = useRef(false)

  useEffect(() => { load() }, [])

  async function load() {
    if (loadingRef.current) return
    loadingRef.current = true
    try {
      const results = await Promise.allSettled([fetchJobs(), fetchServices()])
      setLoadErrors({ jobs: results[0].status === 'rejected', listings: results[1].status === 'rejected' })
    } finally {
      loadingRef.current = false
      setLoading(false)
      setRefreshing(false)
    }
  }

  async function fetchJobs() {
    const { data: jobsData, error } = await supabase
      .from('jobs_public')
      .select('*')
      .eq('status', 'open')
      .eq('visibility', 'public')
      .order('created_at', { ascending: false })

    if (error) throw error
    const raw = await resolvePublicJobLocations(jobsData || [])
    if (raw.length === 0) { setJobs([]); return }

    const requesterIds = [...new Set(raw.map(j => j.requester_id).filter(Boolean))]
    // Offers are private — no bid counts on the public board.
    const { data: profilesData } = requesterIds.length > 0
      ? await supabase.from('profiles_public').select('id, full_name, avatar_url').in('id', requesterIds)
      : { data: [] }

    setJobs(raw.map(j => ({
      ...j,
      _type: 'job',
      profiles: profilesData?.find(p => p.id === j.requester_id) || null,
    })))
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
    const { data: profilesData } = providerIds.length > 0
      ? await supabase.from('profiles_public').select('id, full_name, avatar_url').in('id', providerIds)
      : { data: [] }
    const profileMap = {}
    profilesData?.forEach(p => { profileMap[p.id] = p })

    setServices(raw.map(s => ({ ...s, _type: 'service', profile: profileMap[s.provider_id] || null })))
  }

  function onRefresh() {
    if (loadingRef.current) return
    setRefreshing(true)
    load()
  }

  function handleGuestAction() {
    Alert.alert(
      'Sign in required',
      'Sign in to save this to your watchlist.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign in', onPress: () => navigation.navigate('Login') },
      ]
    )
  }

  const q = search.trim().toLowerCase()
  const searchedJobs = q
    ? jobs.filter(j => [j.title, j.description, j.category, j.location_area, j.location_name]
        .some(v => String(v || '').toLowerCase().includes(q)))
    : jobs
  const searchedServices = q
    ? services.filter(s => [s.title, s.description, s.category, s.location_name]
        .some(v => String(v || '').toLowerCase().includes(q)))
    : services

  const jobResult = filterNearby(searchedJobs, nearby)
  const listingResult = filterNearby(searchedServices, nearby)
  const filteredJobs = jobResult.items, filteredServices = listingResult.items
  const showJobs = mode !== 'services'
  const isEmpty = (showJobs ? filteredJobs.length === 0 : true) && filteredServices.length === 0
  const hasError = loadErrors.listings || (showJobs && loadErrors.jobs)
  const failedContent = loadErrors.listings && showJobs && loadErrors.jobs ? 'jobs and listings'
    : loadErrors.listings ? 'listings' : 'jobs'

  return (
    <View style={styles.screen}>
      <View style={[styles.topBar, { paddingTop: insets.top }]}>
        <View style={styles.topBarInner}>
          <Text style={styles.wordmark}>Rural Connections <DevelopmentBadge/></Text>
          <Text style={styles.tagline}>GET JOBS DONE</Text>
        </View>
      </View>

      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">Find rural help</Text>
        <Text style={styles.subtitle}>Find nearby people with the practical skills your property needs — or turn your rural know-how into work in your community.</Text>
        <Text style={styles.hint}>New here? Tap Account below to log in or sign up.</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search water, fencing, tractor..."
          placeholderTextColor={colors.textMuted}
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
          accessibilityLabel="Search jobs and listings"
        />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        alwaysBounceVertical
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ flexGrow: 1, paddingBottom: insets.bottom + 80 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}>
      <NearbyControls nearby={nearby} unlocated={listingResult.unlocated + (showJobs ? jobResult.unlocated : 0)} />
      {loading ? (
        <SkeletonList count={3} style={{ paddingHorizontal: 16, paddingTop: 16 }} />
      ) : <>
      {hasError && <EmptyState
        icon="cloud-offline-outline"
        title={`Couldn't load ${failedContent}`}
        body="Check your connection and try again."
        actionLabel="Retry"
        onAction={onRefresh}
      />}
      {isEmpty && !hasError ? (
        <EmptyState
          icon="map-outline"
          title={search.trim() ? `No ${showJobs ? 'jobs or listings' : 'listings'} match your search` : jobResult.active ? `No ${showJobs ? 'jobs or listings' : 'listings'} within ${nearby.radius} km` : 'Nothing listed yet'}
          body={jobResult.active ? 'Try a wider distance or browse All New Zealand.' : search.trim() ? `Nothing matches “${search.trim()}”. Try another word or clear your search.`
            : 'Be the first in your area — check back soon, or post a job to get started.'}
          actionLabel={jobResult.active ? 'All New Zealand' : search.trim() ? 'Clear search' : 'Post a job'}
          onAction={jobResult.active ? () => nearby.setRadius(null) : search.trim() ? () => setSearch('') : () => navigation.navigate('GuestPostJob')}
        />
      ) : (
        <>
          {showJobs && (
            <HorizontalSection
              title="Open jobs"
              items={filteredJobs}
              onPressItem={item => navigation.navigate('GuestJobDetail', { job: item })}
              onGuestAction={handleGuestAction}
            />
          )}
          <HorizontalSection
            title="Available listings"
            items={filteredServices}
            onPressItem={item => navigation.navigate('ServiceDetail', { service: item })}
            onGuestAction={handleGuestAction}
          />
        </>
      )}
      </>}
      </ScrollView>

      <View style={[styles.tabBar, { paddingBottom: insets.bottom || 10 }]}>
        <TouchableOpacity
          style={styles.tab}
          onPress={() => setMode('home')}
          accessibilityRole="button"
          accessibilityState={{ selected: mode === 'home' }}>
          <Icon name="home-outline" size={22} color={mode === 'home' ? colors.primary : colors.textMuted} />
          <Text style={[styles.tabLabel, mode === 'home' && styles.tabActive]}>Home</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.tab}
          onPress={() => setMode('services')}
          accessibilityRole="button"
          accessibilityState={{ selected: mode === 'services' }}>
          <Icon name="construct-outline" size={22} color={mode === 'services' ? colors.primary : colors.textMuted} />
          <Text style={[styles.tabLabel, mode === 'services' && styles.tabActive]}>Listings</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.tab}
          onPress={() => navigation.navigate('GuestPostJob')}
          accessibilityRole="button">
          <Icon name="add-circle-outline" size={22} color={colors.textMuted} />
          <Text style={styles.tabLabel}>Post</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.tab}
          onPress={() => navigation.navigate('Login')}
          accessibilityRole="button">
          <Icon name="person-circle-outline" size={22} color={colors.textMuted} />
          <Text style={styles.tabLabel}>Account</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  screen:      { flex: 1, backgroundColor: colors.background },
  topBar:      { backgroundColor: '#2d6a4f' },
  topBarInner: { height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20 },
  wordmark:    { color: '#ffffff', fontSize: 16, fontWeight: '500', letterSpacing: 1 },
  tagline:     { color: '#95d5b2', fontSize: 9, letterSpacing: 3, textTransform: 'uppercase' },
  header: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    backgroundColor: colors.background,
  },
  title: {
    fontSize: 34,
    lineHeight: 38,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  subtitle: { fontSize: 15, lineHeight: 22, color: colors.textSecondary, marginTop: 8, marginBottom: 8 },
  hint: { fontSize: 14, lineHeight: 20, color: colors.textMuted, marginBottom: 16 },
  searchInput: {
    backgroundColor: colors.white,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 15,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 48,
  },

  section: { marginTop: 20 },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.textPrimary,
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  hListContent: { paddingLeft: 14 },


  tabBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 8,
  },
  tab:      { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 54 },
  tabIcon:  { fontSize: 20, color: colors.textMuted, lineHeight: 24 },
  tabLabel: { fontSize: 11, fontWeight: '600', color: colors.textMuted, marginTop: 2 },
  tabActive: { color: colors.primary },
})
