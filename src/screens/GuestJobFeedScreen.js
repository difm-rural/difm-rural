import React, { useEffect, useRef, useState } from 'react'
import { FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import * as Location from 'expo-location'
import { supabase } from '../lib/supabase'
import { colors } from '../theme/tokens'
import PressableCard from '../components/PressableCard'

export default function GuestJobFeedScreen({ navigation }) {
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [userRegion, setUserRegion] = useState(null)
  const regionRef = useRef(null)

  useEffect(() => { init() }, [])

  async function init() {
    const region = await getUserRegion()
    regionRef.current = region
    setUserRegion(region)
    await fetchJobs(region)
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

  async function fetchJobs(region = regionRef.current) {
    const { data, error } = await supabase
      .from('jobs')
      .select('*')
      .eq('status', 'open')
      .order('created_at', { ascending: false })
    if (!error) setJobs(sortByLocality(data || [], region))
    setLoading(false)
    setRefreshing(false)
  }

  function isLocal(locationName, region) {
    if (!region || !locationName) return false
    const loc = locationName.toLowerCase()
    return region.some(kw => loc.includes(kw))
  }

  function sortByLocality(allJobs, region) {
    if (!region) return allJobs
    return [
      ...allJobs.filter(j => isLocal(j.location_name, region)),
      ...allJobs.filter(j => !isLocal(j.location_name, region)),
    ]
  }

  function renderJob({ item }) {
    const nearby = isLocal(item.location_name, userRegion)
    return (
      <PressableCard
        key={item.id}
        style={[styles.card, nearby && styles.localCard]}
        onPress={() => navigation.navigate('GuestJobDetail', { job: item })}
        accessibilityRole="button"
        accessibilityLabel={`${item.title}, ${item.category}, ${item.price_type === 'fixed' ? `$${item.price} NZD` : 'Open to bids'}`}
        accessibilityHint="Double tap to view job details">
        <View style={styles.cardHeader}>
          <View style={styles.badgeRow}>
            <Text style={styles.category}>{item.category}</Text>
            {nearby && <Text style={styles.nearBadge}>Near you</Text>}
          </View>
          <Text style={styles.price}>
            {item.price_type === 'fixed' ? `$${item.price} NZD` : 'Open to Bids'}
          </Text>
        </View>
        <Text style={styles.title}>{item.title}</Text>
        <Text style={styles.description} numberOfLines={2}>{item.description}</Text>
        <View style={styles.cardFooter}>
          <Text style={styles.location}>📍 {item.location_name}</Text>
          <Text style={styles.tapHint}>Tap to view →</Text>
        </View>
      </PressableCard>
    )
  }

  if (loading) {
    return <View style={styles.center}><Text style={{ color: colors.primary }}>Loading...</Text></View>
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Go back">
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        {userRegion && <Text style={styles.localNote}>Local first</Text>}
      </View>
      <Text style={styles.heading} accessibilityRole="header">Available Jobs</Text>
      {jobs.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>No jobs posted yet</Text>
          <Text style={styles.emptySubtext}>Check back soon!</Text>
        </View>
      ) : (
        <FlatList
          data={jobs}
          renderItem={renderJob}
          keyExtractor={item => item.id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); fetchJobs() }}
              tintColor={colors.primary}
            />
          }
          contentContainerStyle={{ paddingBottom: 20 }}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 16, paddingTop: 60 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  backBtn: { minHeight: 44, justifyContent: 'center' },
  back: { color: colors.primary, fontSize: 16, fontWeight: '600' },
  heading: { fontSize: 26, fontWeight: 'bold', color: colors.primary, marginBottom: 16 },
  localNote: { fontSize: 13, color: colors.primary, fontWeight: '600', backgroundColor: colors.primaryLight, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  card: { backgroundColor: colors.white, borderRadius: 12, padding: 16, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, elevation: 2, borderWidth: 1, borderColor: colors.border },
  localCard: { borderColor: colors.primary, borderWidth: 1.5 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  category: { backgroundColor: colors.primaryLight, color: colors.primary, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, fontSize: 13, fontWeight: '600' },
  nearBadge: { backgroundColor: colors.primary, color: colors.white, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, fontSize: 13, fontWeight: '600' },
  price: { fontWeight: 'bold', color: colors.primary, fontSize: 15 },
  title: { fontSize: 17, fontWeight: 'bold', color: colors.textPrimary, marginBottom: 6 },
  description: { color: colors.textSecondary, fontSize: 14, lineHeight: 22, marginBottom: 10 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  location: { color: colors.textMuted, fontSize: 13, flex: 1 },
  tapHint: { color: colors.primary, fontSize: 13, fontWeight: '600' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: 18, fontWeight: 'bold', color: colors.textSecondary },
  emptySubtext: { color: colors.textMuted, marginTop: 4, fontSize: 15 },
})
