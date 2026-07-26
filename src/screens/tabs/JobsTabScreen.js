import React, { useCallback, useRef, useState } from 'react'
import {
  Alert,
  FlatList,
  Keyboard,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
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
import { coarseSuburb, getCurrentLocation, haversineDistance, reverseGeocode } from '../../lib/location'
import { fetchWatchlistIds, addToWatchlist, removeFromWatchlist } from '../../lib/watchlist'
import { saveJobSearch, SAVED_INTEREST_FREQUENCIES } from '../../lib/savedInterests'
import JobCard from '../../components/JobCard'
import JobServiceCard, { CARD_GAP, SNAP_INTERVAL } from '../../components/JobServiceCard'
import SkeletonCard from '../../components/SkeletonCard'
import EmptyState from '../../components/EmptyState'
import Button from '../../components/Button'
import Icon from '../../components/Icon'

const FILTERS = ['All', ...JOB_CATEGORIES]

const SORT_OPTIONS = [
  { value: 'nearest', label: 'Nearest first' },
  { value: 'newest',  label: 'Newest first' },
]
const RADIUS_OPTIONS = [
  { value: 'any', label: 'Any distance' },
  { value: 10,    label: 'Within 10 km' },
  { value: 25,    label: 'Within 25 km' },
  { value: 50,    label: 'Within 50 km' },
  { value: 100,   label: 'Within 100 km' },
]

function jobMatchesSearch(job, query) {
  if (!query.trim()) return true
  const q = query.trim().toLowerCase()
  return [job.title, job.description, job.category, job.location_name].some(
    v => String(v || '').toLowerCase().includes(q)
  )
}

// A compact pill that opens a small option sheet — used for sort + distance.
function OptionPill({ label, icon, options, value, onChange }) {
  const [open, setOpen] = useState(false)
  const current = options.find(o => o.value === value)
  return (
    <>
      <TouchableOpacity
        style={styles.pill}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${current?.label || ''}`}>
        {!!icon && <Icon name={icon} size={13} color={colors.primary} />}
        <Text style={styles.pillText} numberOfLines={1}>{current?.label || label}</Text>
        <Icon name="chevron-down" size={14} color={colors.textMuted} />
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={styles.pickerBackdrop} activeOpacity={1} onPress={() => setOpen(false)}>
          <View style={styles.pickerSheet}>
            <Text style={styles.pickerTitle}>{label}</Text>
            {options.map(o => (
              <TouchableOpacity
                key={String(o.value)}
                style={styles.pickerRow}
                onPress={() => { onChange(o.value); setOpen(false) }}
                accessibilityRole="button"
                accessibilityState={{ selected: o.value === value }}>
                <Text style={[styles.pickerRowText, o.value === value && styles.pickerRowTextActive]}>{o.label}</Text>
                {o.value === value && <Icon name="checkmark" size={18} color={colors.primary} />}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </>
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
  const [sort, setSort]               = useState('nearest')
  const [radius, setRadius]           = useState('any')
  const [saveOpen, setSaveOpen]       = useState(false)
  const [saveName, setSaveName]       = useState('')
  const [saveLocation, setSaveLocation] = useState('')
  const [saveFrequency, setSaveFrequency] = useState('instant')
  const [savePush, setSavePush]       = useState(true)
  const [saveEmail, setSaveEmail]     = useState(false)
  const [saving, setSaving]           = useState(false)
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
      // Anyone (not just providers) can place an offer, so anyone may have offers
      // to track — fetch regardless of the provider flag.
      user?.id ? fetchMyBids(user.id) : Promise.resolve(),
      user?.id ? fetchWatchlistIds(user.id).then(setWatchedIds) : Promise.resolve(),
    ])
    setLoading(false)
    setRefreshing(false)
  }

  async function fetchBoard(uid) {
    const { data: jobsData } = await supabase
      .from('jobs_public')
      .select('*')
      .eq('status', 'open')
      .eq('visibility', 'public')
      .order('created_at', { ascending: false })

    const raw = (jobsData || []).filter(j => j.requester_id !== uid)
    if (raw.length === 0) { setBoardJobs([]); return }

    const requesterIds = [...new Set(raw.map(j => j.requester_id))]
    // Offers are private — the board never shows counts.
    const { data: profilesData } = await supabase
      .from('profiles_public').select('id, full_name, avatar_url').in('id', requesterIds)

    setBoardJobs(raw.map(job => ({
      ...job,
      profiles: profilesData?.find(p => p.id === job.requester_id) || null,
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
      .select('*')
      .eq('provider_id', uid)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })

    const bids = bidsData || []
    if (bids.length === 0) { setMyBidJobs([]); return }
    // Read jobs via the masking view so a pending bid can't reveal a hidden
    // job's exact address before the provider is accepted.
    const jobIds = [...new Set(bids.map(b => b.job_id).filter(Boolean))]
    const { data: jobsData } = await supabase.from('jobs_public').select('*').in('id', jobIds)
    const jobMap = {}
    ;(jobsData || []).forEach(j => { jobMap[j.id] = j })
    setMyBidJobs(bids.map(b => ({ ...b, jobs: jobMap[b.job_id] || null })).filter(b => b.jobs?.status === 'open'))
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

  function clearFilters() {
    setFilter('All')
    setSearch('')
    setRadius('any')
  }

  const hasActiveFilter = filter !== 'All' || !!search.trim() || radius !== 'any'

  async function openSaveSearch() {
    if (!userId) {
      Alert.alert('Sign in required', 'Sign in to save searches and receive matching job alerts.')
      return
    }
    if (radius !== 'any' && !coords) {
      Alert.alert('Location unavailable', 'Allow location access before saving a distance-based search.')
      return
    }
    let place = saveLocation
    if (radius !== 'any' && coords && !place) {
      const address = await reverseGeocode(coords.latitude, coords.longitude)
      place = coarseSuburb(address) || 'your location'
      setSaveLocation(place)
    }
    const subject = search.trim() || (filter !== 'All' ? filter : 'Open jobs')
    const scope = radius !== 'any' ? ` within ${radius} km of ${place || 'your location'}` : ''
    setSaveName(`${subject}${scope}`)
    setSaveOpen(true)
  }

  async function confirmSaveSearch() {
    if (!saveName.trim()) return
    setSaving(true)
    try {
      await saveJobSearch(userId, {
        name: saveName,
        query: search,
        category: filter === 'All' ? null : filter,
        locationName: radius === 'any' ? null : saveLocation,
        latitude: radius === 'any' ? null : coords?.latitude,
        longitude: radius === 'any' ? null : coords?.longitude,
        radiusKm: radius === 'any' ? null : radius,
        frequency: saveFrequency,
        pushEnabled: savePush,
        emailEnabled: saveEmail,
      })
      setSaveOpen(false)
      Alert.alert('Search saved', saveFrequency === 'off'
        ? 'You can find and manage it in Account → Saved interests.'
        : `We’ll send ${saveFrequency === 'instant' ? 'an alert' : 'a daily summary'} when new jobs match.`)
    } catch (error) {
      Alert.alert('Could not save this search', error.message)
    } finally {
      setSaving(false)
    }
  }

  // Filter, annotate with distance, apply radius, then sort.
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
      if (radius !== 'any') {
        items = items.filter(j => j._distanceKm != null && j._distanceKm <= radius)
      }
    }

    const byNewest = (a, b) => new Date(b.created_at) - new Date(a.created_at)
    if (coords && sort === 'nearest') {
      items = [...items].sort((a, b) => {
        if (a._distanceKm == null && b._distanceKm == null) return byNewest(a, b)
        if (a._distanceKm == null) return 1
        if (b._distanceKm == null) return -1
        return a._distanceKm - b._distanceKm
      })
    } else {
      items = [...items].sort(byNewest)
    }
    return items
  })()

  // Board jobs the viewing provider has already offered on → surfaced on the card.
  const myOfferByJobId = new Map(myBidJobs.map(b => [b.job_id, b.amount]))

  // Any personal section above the board? If so, draw a divider before it so the
  // switch from "your stuff" to the open board reads clearly.
  const hasPersonalSection =
    (isRequester && !isProvider) ||
    (isRequester && myOpenJobs.length > 0) ||
    myBidJobs.length > 0

  const listHeader = (
    <View>
      {/* Post a job — compact intro + full-width button. Hidden for providers
          (they come here to find work; they can still post from Home). */}
      {isRequester && !isProvider && (
        <View style={styles.postBlock}>
          <Text style={styles.postIntro}>
            Need a hand? Post a job and get offers from providers nearby.
          </Text>
          <Button
            title="Post a job"
            icon="add"
            onPress={() => navigation.navigate('PostJob', { origin: 'Jobs' })}
            accessibilityLabel="Post a job"
          />
        </View>
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

      {/* Offers you've placed, awaiting an answer */}
      {myBidJobs.length > 0 && (
        <View style={styles.railSection}>
          <Text style={styles.railTitle}>Your offers</Text>
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
                <Text style={styles.bidLabel}>Offer sent: ${bid.amount} NZD</Text>
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

      {/* Divider marks the switch from your own items to the open board */}
      {hasPersonalSection && <View style={styles.sectionDivider} />}

      {/* Board heading + distance scope */}
      <View style={styles.boardHeader}>
        <Text style={styles.boardTitle}>
          {isProvider ? 'Open jobs' : 'What others need'}
        </Text>
        {coords && (
          <OptionPill
            label="Distance"
            icon="location-outline"
            options={RADIUS_OPTIONS}
            value={radius}
            onChange={setRadius}
          />
        )}
      </View>

      {/* Filters + sort on one coordinated row */}
      <View style={styles.controlsRow}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterScroll}
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
        {coords && (
          <View style={styles.sortWrap}>
            <OptionPill
              label="Sort"
              icon="swap-vertical-outline"
              options={SORT_OPTIONS}
              value={sort}
              onChange={setSort}
            />
          </View>
        )}
      </View>
      {hasActiveFilter && (
        <View style={styles.saveSearchRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.saveSearchTitle}>{visibleJobs.length} matching {visibleJobs.length === 1 ? 'job' : 'jobs'}</Text>
            <Text style={styles.saveSearchSub}>Save these filters and choose when to hear about new matches.</Text>
          </View>
          <TouchableOpacity style={styles.saveSearchButton} onPress={openSaveSearch} accessibilityRole="button">
            <Icon name="bookmark-outline" size={17} color={colors.primary} />
            <Text style={styles.saveSearchButtonText}>Save search</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  )

  // Empty state — the message depends on WHY nothing is showing.
  function renderEmpty() {
    if (hasActiveFilter) {
      let title, body
      if (search.trim()) {
        title = 'No jobs match your search'
        body = `Nothing matches “${search.trim()}”. Try a different term.`
      } else if (filter !== 'All') {
        title = 'No jobs in this category yet'
        body = 'Try a different category, or widen your search radius.'
      } else {
        title = `No jobs within ${radius} km`
        body = 'Try a wider distance, or clear filters to see everything.'
      }
      return (
        <EmptyState
          panel
          image={require('../../../assets/brand/barn-ghost.png')}
          title={title}
          body={body}
          actionLabel="Clear filters"
          actionIcon="close"
          onAction={clearFilters}
        />
      )
    }
    return (
      <EmptyState
        panel
        image={require('../../../assets/brand/barn-ghost.png')}
        title="No open jobs right now"
        body="Check back soon — new jobs appear here as neighbours post them."
      />
    )
  }

  if (loading) {
    return (
      <View style={styles.screen}>
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <Text style={styles.brandLabel}>RURAL CONNECTIONS</Text>
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
      <Modal visible={saveOpen} transparent animationType="slide" onRequestClose={() => setSaveOpen(false)}>
        <View style={styles.saveBackdrop}>
          <View style={[styles.saveSheet, { paddingBottom: Math.max(insets.bottom, 18) }]}>
            <View style={styles.saveSheetHeader}>
              <View>
                <Text style={styles.saveKicker}>Job alerts</Text>
                <Text style={styles.saveTitle}>Save this search</Text>
              </View>
              <TouchableOpacity onPress={() => setSaveOpen(false)} accessibilityLabel="Close">
                <Icon name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <Text style={styles.saveLabel}>Name</Text>
            <TextInput
              style={styles.saveInput}
              value={saveName}
              onChangeText={setSaveName}
              placeholder="e.g. Fence repairs near Warkworth"
              placeholderTextColor={colors.textMuted}
            />
            <Text style={styles.saveLabel}>How often?</Text>
            {SAVED_INTEREST_FREQUENCIES.map(option => (
              <TouchableOpacity
                key={option.value}
                style={[styles.frequencyOption, saveFrequency === option.value && styles.frequencyOptionActive]}
                onPress={() => setSaveFrequency(option.value)}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.frequencyOptionTitle}>{option.label}</Text>
                  <Text style={styles.frequencyOptionDescription}>{option.description}</Text>
                </View>
                <Icon name={saveFrequency === option.value ? 'radio-button-on' : 'radio-button-off'} size={21} color={colors.primary} />
              </TouchableOpacity>
            ))}
            {saveFrequency !== 'off' && (
              <View style={styles.channelOptions}>
                <View style={styles.channelOption}>
                  <View><Text style={styles.channelTitle}>Push notification</Text><Text style={styles.channelDescription}>Best for timely matches</Text></View>
                  <Switch value={savePush} onValueChange={setSavePush} trackColor={{ false: colors.border, true: colors.primary }} thumbColor={colors.white} />
                </View>
                <View style={styles.channelOption}>
                  <View><Text style={styles.channelTitle}>Email</Text><Text style={styles.channelDescription}>Send to your account email</Text></View>
                  <Switch value={saveEmail} onValueChange={setSaveEmail} trackColor={{ false: colors.border, true: colors.primary }} thumbColor={colors.white} />
                </View>
              </View>
            )}
            <Button title="Save search" icon="bookmark-outline" onPress={confirmSaveSearch} loading={saving} disabled={!saveName.trim()} style={{ marginTop: 16 }} />
            <TouchableOpacity style={styles.manageLink} onPress={() => { setSaveOpen(false); navigation.navigate('SavedInterests') }}>
              <Text style={styles.manageLinkText}>Manage saved interests</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.brandLabel}>RURAL CONNECTIONS</Text>
        <Text style={styles.headerTitle} accessibilityRole="header">Jobs</Text>
        <Text style={styles.headerSub}>The community job board</Text>
        <View style={styles.searchWrap}>
          <Icon name="search-outline" size={18} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search fencing, water, animal care..."
            placeholderTextColor={colors.textMuted}
            value={search}
            onChangeText={setSearch}
            onSubmitEditing={Keyboard.dismiss}
            returnKeyType="search"
            accessibilityLabel="Search jobs"
          />
          {search.length > 0 && (
            <TouchableOpacity
              onPress={() => setSearch('')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Clear search">
              <Icon name="close-circle" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
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
              offered={myOfferByJobId.has(job.id)}
              offerAmount={myOfferByJobId.get(job.id) ?? null}
              onPress={() => navigation.navigate('JobDetail', { job })}
            />
          </View>
        )}
        ListEmptyComponent={renderEmpty()}
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
    backgroundColor: colors.background,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  brandLabel:  { color: colors.accent, fontSize: 12, letterSpacing: 1.5, fontWeight: '700', textTransform: 'uppercase', marginBottom: 6 },
  headerTitle: { color: colors.textPrimary, fontSize: 28, fontWeight: '700' },
  headerSub:   { color: colors.textSecondary, fontSize: 14, marginTop: 2, marginBottom: 9 },

  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.textPrimary,
  },

  postBlock: { paddingHorizontal: 16, marginTop: 12 },
  postIntro: { fontSize: 13, color: colors.textSecondary, lineHeight: 18, marginBottom: 10 },

  railSection: { marginTop: 14 },
  railTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  railContent: { paddingHorizontal: 16 },
  bidLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
    marginTop: 6,
    paddingHorizontal: 4,
  },

  sectionDivider: {
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.primary,
    marginHorizontal: 16,
    marginTop: 16,
  },
  boardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginTop: 11,
    marginBottom: 10,
  },
  boardTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },

  // Sort / distance pill
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  pillText: { fontSize: 13, fontWeight: '600', color: colors.textPrimary, maxWidth: 130 },

  // Option picker sheet
  pickerBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  pickerSheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 34,
  },
  pickerTitle: { fontSize: 11, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  pickerRowText: { fontSize: 16, color: colors.textPrimary },
  pickerRowTextActive: { color: colors.primary, fontWeight: '700' },

  // Filters + sort row
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    paddingRight: 16,
  },
  filterScroll:  { flex: 1 },
  filterContent: { paddingHorizontal: 16, gap: 8, alignItems: 'center' },
  sortWrap:      { paddingLeft: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive:     { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText:       { fontSize: 13, color: colors.textSecondary, fontWeight: '600' },
  chipTextActive: { color: colors.white },

  saveSearchRow: { marginHorizontal: 16, marginBottom: 14, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white, flexDirection: 'row', alignItems: 'center', gap: 10 },
  saveSearchTitle: { color: colors.textPrimary, fontSize: 13, fontWeight: '700' },
  saveSearchSub: { color: colors.textSecondary, fontSize: 11, lineHeight: 16, marginTop: 2 },
  saveSearchButton: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: colors.primary, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9 },
  saveSearchButtonText: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  saveBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.42)', justifyContent: 'flex-end' },
  saveSheet: { backgroundColor: colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18, maxHeight: '90%' },
  saveSheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  saveKicker: { color: colors.accent, fontSize: 11, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' },
  saveTitle: { color: colors.textPrimary, fontSize: 22, fontWeight: '700', marginTop: 2 },
  saveLabel: { color: colors.textPrimary, fontSize: 12, fontWeight: '700', marginBottom: 6, marginTop: 8 },
  saveInput: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 11, color: colors.textPrimary, fontSize: 14, marginBottom: 8 },
  frequencyOption: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 11, marginBottom: 7 },
  frequencyOptionActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  frequencyOptionTitle: { color: colors.textPrimary, fontSize: 14, fontWeight: '700' },
  frequencyOptionDescription: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },
  channelOptions: { borderTopWidth: 1, borderTopColor: colors.border, marginTop: 6, paddingTop: 5 },
  channelOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  channelTitle: { color: colors.textPrimary, fontSize: 13, fontWeight: '600' },
  channelDescription: { color: colors.textSecondary, fontSize: 11, marginTop: 1 },
  manageLink: { alignItems: 'center', paddingVertical: 12 },
  manageLinkText: { color: colors.primary, fontSize: 13, fontWeight: '600' },

  boardCardWrap: { paddingHorizontal: 16 },
})
