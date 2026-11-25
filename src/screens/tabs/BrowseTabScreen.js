import {saveGuestIntent} from '../../lib/guestIntent'
import AsyncStorage from '@react-native-async-storage/async-storage'
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
import SideHeader from '../../components/SideHeader'
import { SkeletonList } from '../../components/SkeletonCard'
import useNearbyBrowsing from '../../hooks/useNearbyBrowsing'
import NearbyControls from '../../components/NearbyControls'
import { filterNearby } from '../../lib/nearbyBrowsing'
import {HELP_FILTERS,matchesHelpFilter,matchesListingSearch} from '../../../shared/findLocalHelp'
import { availabilityDisplay } from '../../lib/providerAvailability'

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

export default function BrowseTabScreen({ navigation, route }) {
  function requirePostSignIn() {
    Alert.alert('Sign in to post a job', 'Sign in or join to continue. Nothing is posted automatically.', [
      {text:'Cancel',style:'cancel'},
      {text:'Continue',onPress:async()=>{
        try { await saveGuestIntent(AsyncStorage,'post-job'); navigation.navigate('Login') }
        catch { Alert.alert('Could not continue','Please try again.') }
      }},
    ])
  }
  const insets = useSafeAreaInsets()
  const [currentUserId, setCurrentUserId] = useState(null)
  const [services,    setServices]    = useState([])
  const nearby = useNearbyBrowsing()
  const [loading,     setLoading]     = useState(true)
  const [refreshing,  setRefreshing]  = useState(false)
  const [search,      setSearch]      = useState('')
  const [kind,setKind]=useState('')
  const [loadError, setLoadError] = useState(false)
  const loadingRef = useRef(false)

  useFocusEffect(useCallback(() => { load() }, []))
  const category=route?.params?.category
  useFocusEffect(useCallback(()=>{
    if(category){
      setSearch(category)
      navigation.setParams({category:undefined})
    }
  },[category,navigation]))

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
      .from('services_public')
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

  const result = filterNearby(services.filter(item => matchesHelpFilter(item,kind) && matchesListingSearch(item, search)), nearby)
  const filtered = result.items
  const isEmpty = filtered.length === 0

  return (
    <View style={styles.screen}>

      <SideHeader
        kind="listing"
        label="LISTINGS · OFFERED"
        topInset={insets.top}
        right={
          <TouchableOpacity
            style={styles.helpBtn}
            onPress={() => navigation.navigate('HowItWorks')}
            accessibilityRole="button"
            accessibilityLabel="How it works">
            <Text style={styles.helpText}>How it works</Text>
          </TouchableOpacity>
        }
      />
      <View style={[styles.header, { paddingTop: 0 }]}>
        <Text style={styles.title}>Find local help</Text>
        <Text style={styles.subtitle}>Services, grazing, equipment and rural goods</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="What are you looking for?"
          placeholderTextColor={colors.textMuted}
          value={search}
          onChangeText={setSearch}
          onSubmitEditing={Keyboard.dismiss}
          returnKeyType="done"
          blurOnSubmit
          accessibilityLabel="Search listings"
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{paddingHorizontal:20,gap:8,paddingBottom:8}} style={{flexGrow:0}}>
        {HELP_FILTERS.map(([value,label])=><TouchableOpacity key={value} onPress={()=>setKind(value)} accessibilityRole="button" accessibilityState={{selected:kind===value}} style={{padding:10,borderRadius:18,backgroundColor:kind===value?colors.primaryLight:colors.white}}><Text style={{color:colors.primary,fontWeight:kind===value?'700':'400'}}>{label}</Text></TouchableOpacity>)}
      </ScrollView>
      {currentUserId && (
        <TouchableOpacity
          style={styles.manageListings}
          onPress={() => navigation.navigate('MyServices')}
          accessibilityRole="button"
          accessibilityLabel="Manage my listings">
          <Icon name="list-outline" size={20} color={colors.primary}/>
          <Text style={styles.manageListingsText}>Manage my listings</Text>
          <Icon name="chevron-forward" size={16} color={colors.textMuted}/>

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
            title={kind?'No listings match this filter':'No listings available yet'}
            body="Check back soon, or post a job to get offers from locals."
            actionLabel="Post a job"
            actionIcon="arrow-forward"
            onAction={() => {
              if (!currentUserId) requirePostSignIn()
              else navigation.getParent()?.navigate('Jobs', { screen: 'PostJob', params: { origin: 'Browse' } })
            }}
          />
      ) : (
        <>
          <ServiceSection title={result.active ? 'Near you' : 'All listings'} items={filtered} onPressItem={handlePress} />
        </>
      )}
      {!loading&&!loadError&&isEmpty&&(search.trim()||result.active||kind)&&<TouchableOpacity onPress={()=>{if(!currentUserId)requirePostSignIn();else navigation.getParent()?.navigate('Jobs',{screen:'PostJob',params:{origin:'Browse'}})}} accessibilityRole="button" style={{padding:20}}><Text style={{color:colors.primary,fontWeight:'700'}}>Can’t find suitable help? Post a job →</Text></TouchableOpacity>}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  manageListings: {marginHorizontal:20,paddingVertical:10,minHeight:44,flexDirection:'row',alignItems:'center',gap:10},
  manageListingsText: {flex:1,minWidth:0,fontSize:14,fontWeight:'600',color:colors.primary},
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
  sideStrip: { height: 5, width: '100%' },
  brandSide: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  listingBrandLabel: { color: colors.listingInk, marginBottom: 0 },
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
