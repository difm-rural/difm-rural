import { resolvePublicJobLocations } from '../lib/jobDiscovery'
import React, { useEffect, useRef, useState } from 'react'
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
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import useNearbyBrowsing from '../hooks/useNearbyBrowsing'
import NearbyControls from '../components/NearbyControls'
import { filterNearby } from '../lib/nearbyBrowsing'
import { supabase } from '../lib/supabase'
import { colors } from '../theme/tokens'
import Icon from '../components/Icon'
import EmptyState from '../components/EmptyState'
import { SkeletonList } from '../components/SkeletonCard'
import JobServiceCard, { CARD_GAP, SNAP_INTERVAL } from '../components/JobServiceCard'
import { CATEGORY_FILTERS } from '../lib/categories'

const FILTERS = CATEGORY_FILTERS

function HorizontalSection({ title, items, onPressItem, onGuestHeartPress }) {
  if (!items.length) return null
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <FlatList
        horizontal
        data={items}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <JobServiceCard
            item={item}
            isGuest
            onGuestAction={onGuestHeartPress}
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

export default function GuestJobFeedScreen({ navigation }) {
  const insets = useSafeAreaInsets()
  const nearby = useNearbyBrowsing()
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [filter, setFilter] = useState('All')
  const [search, setSearch] = useState('')
  const loadingRef = useRef(false)

  useEffect(() => { init() }, [])

  async function init() {
    if (loadingRef.current) return
    loadingRef.current = true
    try { await fetchJobs(); setLoadError(false) }
    catch { setLoadError(true) }
    finally { loadingRef.current = false; setLoading(false); setRefreshing(false) }
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
    if (raw.length === 0) { setJobs([]); setLoading(false); setRefreshing(false); return }

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
    setLoading(false)
    setRefreshing(false)
  }

  function onRefresh() {
    setRefreshing(true)
    init()
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

  const filtered = (() => {
    let items = [...jobs]
    if (filter !== 'All') items = items.filter(i => i.category === filter)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      items = items.filter(i =>
        [i.title, i.description, i.category, i.location_area, i.location_name].some(v => String(v || '').toLowerCase().includes(q))
      )
    }
    return items
  })()

  const result = filterNearby(filtered, nearby)
  const bothEmpty = result.items.length === 0

  return (
    <View style={styles.screen}>

      {/* Green header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Go back">
          <Text style={styles.backBtnText}><Icon name="chevron-back" size={14} color={colors.primary} /> Back</Text>
        </TouchableOpacity>
        <Text style={styles.brandLabel}>RURAL CONNECTIONS</Text>
        <Text style={styles.title}>Available jobs</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search fencing, water, tractor..."
          placeholderTextColor="rgba(255,255,255,0.6)"
          value={search}
          onChangeText={setSearch}
          onSubmitEditing={Keyboard.dismiss}
          returnKeyType="done"
          blurOnSubmit
          accessibilityLabel="Search jobs"
        />
      </View>

      {/* Filter chips */}
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

      <ScrollView alwaysBounceVertical keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: insets.bottom + 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}>
        <NearbyControls nearby={nearby} unlocated={result.unlocated} />
        {loading ? <SkeletonList count={3} style={{ paddingHorizontal: 16, paddingTop: 16 }} />
          : loadError ? <EmptyState icon="cloud-offline-outline" title="Couldn't load jobs" body="Check your connection and try again." actionLabel="Retry" onAction={onRefresh} />
          : bothEmpty ? <EmptyState icon="search-outline" title={result.active ? `No matching jobs within ${nearby.radius} km` : filter !== 'All' || search.trim() ? 'No jobs match' : 'No open jobs yet'}
            body={result.active ? 'Try a wider distance or browse All New Zealand.' : 'Try another search, or pull down to refresh.'}
            actionLabel={result.active ? 'All New Zealand' : 'Clear search'} onAction={result.active ? () => nearby.setRadius(null) : () => { setSearch(''); setFilter('All') }} />
          : <HorizontalSection title={result.active ? 'Near you' : 'Open jobs'} items={result.items}
              onPressItem={item => navigation.navigate('GuestJobDetail', { job: item })} onGuestHeartPress={handleGuestAction} />}
      </ScrollView>
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
  backBtn: { marginBottom: 10, alignSelf: 'flex-start', minHeight: 32, justifyContent: 'center' },
  backBtnText: { color: 'rgba(255,255,255,0.85)', fontSize: 15, fontWeight: '600' },
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
    marginBottom: 14,
    lineHeight: 30,
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
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.textPrimary,
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  hListContent: { paddingLeft: 14 },

  noMore:     { paddingVertical: 20, alignItems: 'center' },
  noMoreText: { fontSize: 13, color: colors.textMuted },
})
