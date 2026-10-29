import { resolvePublicJobLocations } from '../lib/jobDiscovery'
import React, { useCallback, useRef, useState } from 'react'
import { Alert, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import useNearbyBrowsing from '../hooks/useNearbyBrowsing'
import NearbyControls from '../components/NearbyControls'
import { filterNearby } from '../lib/nearbyBrowsing'
import { supabase } from '../lib/supabase'
import { colors } from '../theme/tokens'
import { fetchWatchlistIds, addToWatchlist, removeFromWatchlist } from '../lib/watchlist'
import JobCard from '../components/JobCard'
import SkeletonCard from '../components/SkeletonCard'
import EmptyState from '../components/EmptyState'

export default function JobFeedScreen({ navigation }) {
  const insets = useSafeAreaInsets()
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const nearby = useNearbyBrowsing()
  const [loadError, setLoadError] = useState(false)
  const [userId, setUserId] = useState(null)
  const [watchedIds, setWatchedIds] = useState(new Set())
  const loadingRef = useRef(false)
  const userIdRef = useRef(null)

  useFocusEffect(useCallback(() => { init() }, []))

  async function init() {
    if (loadingRef.current) return
    loadingRef.current = true
    try {
      const { data: { user } } = await supabase.auth.getUser()
      userIdRef.current = user?.id
      setUserId(user?.id)
      await fetchJobs(user?.id)
      setLoadError(false)
    } catch { setLoadError(true) }
    finally { loadingRef.current = false; setLoading(false); setRefreshing(false) }
  }

  async function fetchJobs(uid = userIdRef.current) {
    const { data: jobsData, error } = await supabase
      .from('jobs_public')
      .select('*')
      .eq('status', 'open')
      .eq('visibility', 'public')
      .order('created_at', { ascending: false })

    if (error) throw error

    const rawJobs = await resolvePublicJobLocations(jobsData || [])

    if (rawJobs.length > 0) {
      const requesterIds = [...new Set(rawJobs.map(j => j.requester_id))]
      // Offers are private — the board never shows counts, so don't fetch bids here.
      const fetchTasks = [
        supabase.from('profiles_public').select('id, full_name, avatar_url').in('id', requesterIds),
      ]
      if (uid) fetchTasks.push(fetchWatchlistIds(uid))

      const results = await Promise.all(fetchTasks)
      const profilesData = results[0].data
      const watchIds     = results[1] || new Set()

      const jobsWithAll = rawJobs.map(job => ({
        ...job,
        profiles: profilesData?.find(p => p.id === job.requester_id) || null,
      }))

      setWatchedIds(watchIds)
      setJobs(jobsWithAll)
    } else {
      setJobs([])
    }

    setLoading(false)
    setRefreshing(false)
  }

  async function handleWatchToggle(jobId, currentlyWatched) {
    if (!userIdRef.current) return

    // Optimistic update
    setWatchedIds(prev => {
      const next = new Set(prev)
      if (currentlyWatched) next.delete(jobId)
      else next.add(jobId)
      return next
    })

    if (currentlyWatched) {
      await removeFromWatchlist(userIdRef.current, jobId)
      Alert.alert('Removed from watchlist')
    } else {
      await addToWatchlist(userIdRef.current, jobId)
      Alert.alert('Added to watchlist')
    }
  }

  function onRefresh() {
    setRefreshing(true)
    init()
  }

  const result = filterNearby(jobs, nearby)

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <Text style={styles.heading} accessibilityRole="header">Available Jobs</Text>
        </View>
        {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.heading} accessibilityRole="header">Available Jobs</Text>

      </View>
      <NearbyControls nearby={nearby} unlocated={result.unlocated} />
        <FlatList
          data={loadError ? [] : result.items}
          ListEmptyComponent={loadError ? <EmptyState icon="cloud-offline-outline" title="Couldn’t load jobs" body="Check your connection and try again." actionLabel="Retry" onAction={onRefresh} /> : <EmptyState icon="location-outline" title={result.active ? `No jobs within ${nearby.radius} km` : "No open jobs yet"} body={result.active ? "Try a wider distance or browse All New Zealand." : "Pull down to refresh."} actionLabel={result.active ? "All New Zealand" : "Refresh"} onAction={result.active ? () => nearby.setRadius(null) : onRefresh} />}
          renderItem={({ item }) => (
            <JobCard
              job={item}
              bidCount={item.bidCount || 0}
              distanceKm={item._distanceKm}
              isWatched={watchedIds.has(item.id)}
              onWatchToggle={userId ? handleWatchToggle : undefined}
              onPress={() => navigation.navigate('JobDetail', { job: item })}
            />
          )}
          keyExtractor={item => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 16 }}
        />
    </View>
  )
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: colors.background, padding: 16, paddingTop: 60 },
  headerRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  heading:      { fontSize: 26, fontWeight: 'bold', color: colors.primary },
  localNote:    { fontSize: 13, color: colors.primary, fontWeight: '600', backgroundColor: colors.primaryLight, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
})
