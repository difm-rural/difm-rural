import React, { useCallback, useRef, useState } from 'react'
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
import { useFocusEffect } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../../lib/supabase'
import { colors } from '../../theme/tokens'
import { useUser } from '../../context/UserContext'
import { JOB_CATEGORIES } from '../../lib/categories'
import { canProvide } from '../../lib/roles'
import { getCurrentLocation, haversineDistance } from '../../lib/location'
import { fetchWatchlistIds, addToWatchlist, removeFromWatchlist } from '../../lib/watchlist'
import JobCard from '../../components/JobCard'
import JobServiceCard, { CARD_GAP, SNAP_INTERVAL } from '../../components/JobServiceCard'
import SkeletonCard from '../../components/SkeletonCard'

const FILTERS = ['All', ...JOB_CATEGORIES]

function jobMatchesSearch(job, query) {
  if (!query.trim()) return true
  const q = query.trim().toLowerCase()
  return [job.title, job.description, job.category, job.location_name].some(
    v => String(v || '').toLowerCase().includes(q)
  )
}

export default function JobsTabScreen({ navigation }) {
  const insets = useSafeAreaInsets()
  const { profile } = useUser()
  const isRequester = true
  const isProvider  = canProvide(profile)

  const [userId, setUserId]           = useState(null)
  const [boardJobs, setBoardJobs]     = useState([])
  const [myOpenJobs, setMyOpenJobs]   = useState([])
  const [myBidJobs, setMyBidJobs]     = useState([])
  const [watchedIds, setWatchedIds]   = useState(new Set())
  const [coords, setCoords]           = useState(null)
  const [loading, setLoading]         = useState(true)
  const [refreshing, setRefreshing]   = useState(false)
  const [filter, setFilter]           = useState('All')
  const [search, setSearch]           = useState('')
  const userIdRef = useRef(null)

  useFocusEffect(useCallback(() => { load() }, []))

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    userIdRef.current = user?.id || null
    setUserId(user?.id || null)

    try {
      const loc = await getCurrentLocation()
      if (loc) setCoords(loc)
    } catch { /* distance is optional */ }

    await Promise.all([
      fetchBoard(user?.id),
      user?.id && isRequester ? fetchMyOpenJobs(user.id) : Promise.resolve(),
      user?.id && isProvider ? fetchMyBids(user.id) : Promise.resolve(),
      user?.id ? fetchWatchlistIds(user.id).then(setWatchedIds) : Promise.resolve(),
    ])
    setLoading(false)
    setRefreshing(false)
  }

  async function fetchBoard(uid) {
    const { data: jobsData } = await supabase
      .from('jobs')
      .select('*')
      .eq('status', 'open')
      .order('created_at', { ascending: false })

    const raw = (jobsData || []).filter(j => j.requester_id !== uid)
    if (raw.length === 0) { setBoardJobs([]); return }

    const requesterIds = [...new Set(raw.map(j => j.requester_id))]
    const [{ data: profilesData }, { data: bidsData }] = await Promise.all([
      supabase.from('profiles').select('id, full_name, avatar_url').in('id', requesterIds),
      supabase.from('bids').select('job_id').in('job_id', raw.map(j => j.id)).eq('status', 'pending'),
    ])

    const bidCountMap = {}
    bidsData?.forEach(b => { bidCountMap[b.job_id] = (bidCountMap[b.job_id] || 0) + 1 })

    setBoardJobs(raw.map(job => ({
      ...job,
      profiles: profilesData?.find(p => p.id === job.requester_id) || null,
      bidCount: bidCountMap[job.id] || 0,
    })))
  }

  async function fetchMyOpenJobs(uid) {
    const { data: jobsData } = await supabase
      .from('jobs')
      .select('*')
      .eq('requester_id', uid)
      .eq('status', 'open')
      .order('created_at', { ascending: false })

    const jobs = jobsData || []
    if (jobs.length === 0) { setMyOpenJobs([]); return }

    const { data: bidsData } = await supabase
      .from('bids')
      .select('job_id')
      .in('job_id', jobs.map(j => j.id))
      .eq('status', 'pending')
    const bidCountMap = {}
    bidsData?.forEach(b => { bidCountMap[b.job_id] = (bidCountMap[b.job_id] || 0) + 1 })

    setMyOpenJobs(jobs.map(j => ({ ...j, bidCount: bidCountMap[j.id] || 0 })))
  }

  async function fetchMyBids(uid) {
    const { data: bidsData } = await supabase
      .from('bids')
      .select('*, jobs(*)')
      .eq('provider_id', uid)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })

    setMyBidJobs((bidsData || []).filter(b => b.jobs?.status === 'open'))
  }

  async function handleWatchToggle(jobId, currentlyWatched) {
    if (!userIdRef.current) return
    setWatchedIds(prev => {
      const next = new Set(prev)
      if (currentlyWatched) next.delete(jobId)
      else next.add(jobId)
      return next
    })
    if (currentlyWatched) await removeFromWatchlist(userIdRef.current, jobId)
    else await addToWatchlist(userIdRef.current, jobId)
  }

  function onRefresh() {
    setRefreshing(true)
    load()
  }

  // Filter, annotate with distance, sort nearest-first when GPS is available
  const visibleJobs = (() => {
    let items = boardJobs
    if (filter !== 'All') items = items.filter(j => j.category === filter)
    if (search.trim())    items = items.filter(j => jobMatchesSearch(j, search))

    if (coords) {
      items = items.map(j => {
        if (j.latitude == null || j.longitude == null) return { ...j, _distanceKm: null }
        const d = haversineDistance(
          coords.latitude, coords.longitude,
          parseFloat(j.latitude), parseFloat(j.longitude)
        )
        return { ...j, _distanceKm: Math.round(d * 10) / 10 }
      })
      items = [...items].sort((a, b) => {
        if (a._distanceKm == null && b._distanceKm == null) return new Date(b.created_at) - new Date(a.created_at)
        if (a._distanceKm == null) return 1
        if (b._distanceKm == null) return -1
        return a._distanceKm - b._distanceKm
      })
    }
    return items
  })()

  const listHeader = (
    <View>
      {/* Requester: post CTA + open jobs awaiting bids */}
      {isRequester && (
        <TouchableOpacity
          style={styles.postCta}
          onPress={() => navigation.navigate('PostJob', { origin: 'Jobs' })}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Post a job">
          <View style={{ flex: 1 }}>
            <Text style={styles.postCtaTitle}>Post a job</Text>
            <Text style={styles.postCtaSub}>Describe the work and get bids from local providers</Text>
          </View>
          <Text style={styles.postCtaArrow}>→</Text>
        </TouchableOpacity>
      )}

      {isRequester && myOpenJobs.length > 0 && (
        <View style={styles.railSection}>
          <Text style={styles.railTitle}>Your open jobs</Text>
          <FlatList
            horizontal
            data={myOpenJobs}
            keyExtractor={job => `mine-${job.id}`}
            renderItem={({ item: job }) => (
              <JobServiceCard
                item={job}
                showStatusBadge
                status="open"
                onPress={() => navigation.navigate('ManageTask', { job, bidCount: job.bidCount || 0 })}
              />
            )}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.railContent}
            ItemSeparatorComponent={() => <View style={{ width: CARD_GAP }} />}
            ListFooterComponent={<View style={{ width: 40 }} />}
            snapToInterval={SNAP_INTERVAL}
            decelerationRate="fast"
          />
        </View>
      )}

      {/* Provider: bids awaiting an answer */}
      {isProvider && myBidJobs.length > 0 && (
        <View style={styles.railSection}>
          <Text style={styles.railTitle}>Your bids</Text>
          <FlatList
            horizontal
            data={myBidJobs}
            keyExtractor={bid => `bid-${bid.id}`}
            renderItem={({ item: bid }) => (
              <View>
                <JobServiceCard
                  item={bid.jobs}
                  onPress={() => navigation.navigate('JobDetail', { job: bid.jobs })}
                />
                <Text style={styles.bidLabel}>Bid sent: ${bid.amount} NZD</Text>
              </View>
            )}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.railContent}
            ItemSeparatorComponent={() => <View style={{ width: CARD_GAP }} />}
            ListFooterComponent={<View style={{ width: 40 }} />}
            snapToInterval={SNAP_INTERVAL}
            decelerationRate="fast"
          />
        </View>
      )}

      {/* Board heading + filters */}
      <View style={styles.boardHeader}>
        <Text style={styles.boardTitle}>
          {isProvider ? 'Open jobs' : 'What others need'}
        </Text>
        {coords && <Text style={styles.localNote}>Nearest first</Text>}
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterBar}
        contentContainerStyle={styles.filterContent}>
        {FILTERS.map(f => (
          <TouchableOpacity
            key={f}
            style={[styles.chip, filter === f && styles.chipActive]}
            onPress={() => setFilter(f)}
            accessibilityRole="button"
            accessibilityState={{ selected: filter === f }}>
            <Text style={[styles.chipText, filter === f && styles.chipTextActive]}>{f}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  )

  if (loading) {
    return (
      <View style={styles.screen}>
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <Text style={styles.brandLabel}>RURAL SERVICES</Text>
          <Text style={styles.headerTitle} accessibilityRole="header">Jobs</Text>
        </View>
        <View style={{ padding: 16 }}>
          {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
        </View>
      </View>
    )
  }

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.brandLabel}>RURAL SERVICES</Text>
        <Text style={styles.headerTitle} accessibilityRole="header">Jobs</Text>
        <Text style={styles.headerSub}>The community job board</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search fencing, water, animal care..."
          placeholderTextColor="rgba(255,255,255,0.6)"
          value={search}
          onChangeText={setSearch}
          onSubmitEditing={Keyboard.dismiss}
          returnKeyType="done"
          blurOnSubmit
          accessibilityLabel="Search jobs"
        />
      </View>

      <FlatList
        data={visibleJobs}
        keyExtractor={job => job.id}
        ListHeaderComponent={listHeader}
        renderItem={({ item: job }) => (
          <View style={styles.boardCardWrap}>
            <JobCard
              job={job}
              bidCount={job.bidCount || 0}
              distanceKm={job._distanceKm}
              isWatched={watchedIds.has(job.id)}
              onWatchToggle={userId ? handleWatchToggle : undefined}
              onPress={() => navigation.navigate('JobDetail', { job })}
            />
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyTitle}>
              {filter !== 'All' || search.trim() ? 'No jobs match' : 'No open jobs right now'}
            </Text>
            <Text style={styles.emptyBody}>
              {filter !== 'All' || search.trim()
                ? 'Try a different category or search term.'
                : 'Check back soon — new jobs appear here as neighbours post them.'}
            </Text>
          </View>
        }
        contentContainerStyle={{ paddingBottom: insets.bottom + 88 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },

  header: {
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  brandLabel:  { color: '#95d5b2', fontSize: 10, letterSpacing: 2, fontWeight: '700', marginBottom: 4 },
  headerTitle: { color: colors.white, fontSize: 28, fontWeight: '700' },
  headerSub:   { color: 'rgba(255,255,255,0.85)', fontSize: 14, marginTop: 2, marginBottom: 12 },
  searchInput: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.white,
  },

  postCta: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 14,
    padding: 16,
    marginHorizontal: 16,
    marginTop: 16,
  },
  postCtaTitle: { color: colors.white, fontSize: 17, fontWeight: '700' },
  postCtaSub:   { color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: 2, lineHeight: 18 },
  postCtaArrow: { color: colors.white, fontSize: 22, fontWeight: '700', marginLeft: 10 },

  railSection: { marginTop: 18 },
  railTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  railContent: { paddingHorizontal: 16 },
  bidLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
    marginTop: 6,
    paddingHorizontal: 4,
  },

  boardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginTop: 22,
    marginBottom: 10,
  },
  boardTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  localNote: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '600',
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },

  filterBar:     { marginBottom: 12, flexGrow: 0 },
  filterContent: { paddingHorizontal: 16, gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive:     { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText:       { fontSize: 13, color: colors.textSecondary, fontWeight: '600' },
  chipTextActive: { color: colors.white },

  boardCardWrap: { paddingHorizontal: 16 },

  emptyWrap:  { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: colors.textPrimary, marginBottom: 6 },
  emptyBody:  { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 21 },
})
