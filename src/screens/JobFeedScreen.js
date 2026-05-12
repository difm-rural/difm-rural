import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import * as Location from 'expo-location'
import { supabase } from '../lib/supabase'
import { colors } from '../theme/tokens'
import { fetchWatchlistIds, addToWatchlist, removeFromWatchlist } from '../lib/watchlist'
import JobCard from '../components/JobCard'
import SkeletonCard from '../components/SkeletonCard'

export default function JobFeedScreen({ navigation }) {
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [userRegion, setUserRegion] = useState(null)
  const [userId, setUserId] = useState(null)
  const [watchedIds, setWatchedIds] = useState(new Set())
  const regionRef = useRef(null)
  const userIdRef = useRef(null)

  useEffect(() => { init() }, [])

  // Refresh watchlist when returning to this screen
  useFocusEffect(useCallback(() => {
    if (userIdRef.current) {
      fetchWatchlistIds(userIdRef.current).then(ids => setWatchedIds(ids))
    }
  }, []))

  async function init() {
    const { data: { user } } = await supabase.auth.getUser()
    userIdRef.current = user?.id
    setUserId(user?.id)

    const region = await getUserRegion()
    regionRef.current = region
    setUserRegion(region)
    await fetchJobs(region, user?.id)
  }

  async function getUserRegion() {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') return null
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      const [place] = await Location.reverseGeocodeAsync({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      })
      return [place.city, place.district, place.region, place.subregion]
        .filter(Boolean)
        .map(s => s.toLowerCase())
    } catch {
      return null
    }
  }

  async function fetchJobs(region = regionRef.current, uid = userIdRef.current) {
    const { data: jobsData, error } = await supabase
      .from('jobs')
      .select('*')
      .eq('status', 'open')
      .order('created_at', { ascending: false })

    if (error) {
      console.log('Error fetching jobs:', error.message)
      setLoading(false)
      setRefreshing(false)
      return
    }

    const rawJobs = jobsData || []

    if (rawJobs.length > 0) {
      const requesterIds = [...new Set(rawJobs.map(j => j.requester_id))]
      const fetchTasks = [
        supabase.from('profiles').select('id, full_name, avatar_url').in('id', requesterIds),
        supabase.from('bids').select('job_id').in('job_id', rawJobs.map(j => j.id)).eq('status', 'pending'),
      ]
      if (uid) fetchTasks.push(fetchWatchlistIds(uid))

      const results = await Promise.all(fetchTasks)
      const profilesData = results[0].data
      const bidsData     = results[1].data
      const watchIds     = results[2] || new Set()

      const bidCountMap = {}
      bidsData?.forEach(b => { bidCountMap[b.job_id] = (bidCountMap[b.job_id] || 0) + 1 })

      const jobsWithAll = rawJobs.map(job => ({
        ...job,
        profiles: profilesData?.find(p => p.id === job.requester_id) || null,
        bidCount: bidCountMap[job.id] || 0,
      }))

      setWatchedIds(watchIds)
      setJobs(sortByLocality(jobsWithAll, region))
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

  function isLocal(locationName, region) {
    if (!region || !locationName) return false
    const loc = locationName.toLowerCase()
    return region.some(kw => loc.includes(kw))
  }

  function sortByLocality(allJobs, region) {
    if (!region) return allJobs
    const local = allJobs.filter(j => isLocal(j.location_name, region))
    const other = allJobs.filter(j => !isLocal(j.location_name, region))
    return [...local, ...other]
  }

  function onRefresh() {
    setRefreshing(true)
    fetchJobs()
  }

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
        {userRegion && <Text style={styles.localNote}>Local first</Text>}
      </View>
      {jobs.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>No jobs posted yet</Text>
          <Text style={styles.emptySubtext}>Check back soon!</Text>
        </View>
      ) : (
        <FlatList
          data={jobs}
          renderItem={({ item }) => (
            <JobCard
              job={item}
              bidCount={item.bidCount || 0}
              isWatched={watchedIds.has(item.id)}
              onWatchToggle={userId ? handleWatchToggle : undefined}
              onPress={() => navigation.navigate('JobDetail', { job: item })}
            />
          )}
          keyExtractor={item => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          contentContainerStyle={{ paddingBottom: 20 }}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: colors.background, padding: 16, paddingTop: 60 },
  headerRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  heading:      { fontSize: 26, fontWeight: 'bold', color: colors.primary },
  localNote:    { fontSize: 13, color: colors.primary, fontWeight: '600', backgroundColor: colors.primaryLight, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  center:       { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText:    { fontSize: 18, fontWeight: 'bold', color: colors.textSecondary },
  emptySubtext: { color: colors.textMuted, marginTop: 4, fontSize: 15 },
})
