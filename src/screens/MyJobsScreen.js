import React, { useCallback, useState } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../lib/supabase'
import { colors } from '../theme/tokens'
import JobServiceCard, { CARD_GAP, SNAP_INTERVAL } from '../components/JobServiceCard'

export default function MyJobsScreen({ navigation, route }) {
  const insets = useSafeAreaInsets()
  const filter = route?.params?.filter
  const [postedJobs, setPostedJobs] = useState([])
  const [myBids, setMyBids] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [pastTasksExpanded, setPastTasksExpanded] = useState(false)
  const [pastBidsExpanded, setPastBidsExpanded] = useState(false)

  useFocusEffect(useCallback(() => { fetchData() }, []))

  async function fetchData() {
    const { data: { user } } = await supabase.auth.getUser()
    await Promise.all([
      fetchPostedJobs(user.id),
      fetchMyBids(user.id),
    ])
    setLoading(false)
    setRefreshing(false)
  }

  async function fetchPostedJobs(uid) {
    const { data: jobsData } = await supabase
      .from('jobs')
      .select('*')
      .eq('requester_id', uid)
      .order('created_at', { ascending: false })

    const rawJobs = jobsData || []
    if (rawJobs.length === 0) { setPostedJobs([]); return }

    const { data: profileData } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url')
      .eq('id', uid)
      .single()

    const openIds = rawJobs.filter(j => j.status === 'open').map(j => j.id)
    let bidCountMap = {}
    if (openIds.length > 0) {
      const { data: bidsData } = await supabase
        .from('bids').select('job_id').in('job_id', openIds).eq('status', 'pending')
      bidsData?.forEach(b => { bidCountMap[b.job_id] = (bidCountMap[b.job_id] || 0) + 1 })
    }

    const completedIds = rawJobs.filter(j => j.status === 'completed').map(j => j.id)
    const acceptedBidAmountMap = {}
    const requesterRatingMap = {}
    const providerRatingMap = {}

    if (completedIds.length > 0) {
      const [{ data: acceptedBids }, { data: reviewsData }] = await Promise.all([
        supabase
          .from('bids')
          .select('job_id, amount')
          .in('job_id', completedIds)
          .eq('status', 'accepted'),
        supabase
          .from('reviews')
          .select('job_id, reviewer_role, reviewee_role, rating')
          .in('job_id', completedIds),
      ])

      acceptedBids?.forEach(bid => { acceptedBidAmountMap[bid.job_id] = bid.amount })
      reviewsData?.forEach(review => {
        if (review.reviewer_role === 'requester' && review.reviewee_role === 'provider') {
          requesterRatingMap[review.job_id] = review.rating
        }
        if (review.reviewer_role === 'provider' && review.reviewee_role === 'requester') {
          providerRatingMap[review.job_id] = review.rating
        }
      })
    }

    setPostedJobs(rawJobs.map(job => ({
      ...job,
      profiles: profileData || null,
      bidCount: bidCountMap[job.id] || 0,
      acceptedBidAmount: acceptedBidAmountMap[job.id],
      completedAmount: acceptedBidAmountMap[job.id],
      requesterRatingGiven: requesterRatingMap[job.id],
      providerRatingGiven: providerRatingMap[job.id],
    })))
  }

  async function fetchMyBids(uid) {
    const { data: bidsData } = await supabase
      .from('bids')
      .select('*, jobs(*)')
      .eq('provider_id', uid)
      .order('created_at', { ascending: false })

    const bidList = bidsData || []
    if (bidList.length === 0) { setMyBids([]); return }

    const requesterIds = [...new Set(bidList.map(b => b.jobs?.requester_id).filter(Boolean))]
    const { data: profilesData } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url')
      .in('id', requesterIds)

    setMyBids(bidList.map(bid => ({
      ...bid,
      jobs: bid.jobs ? {
        ...bid.jobs,
        profiles: profilesData?.find(p => p.id === bid.jobs.requester_id) || null,
        bidCount: 0,
      } : null,
    })))
  }

  function onRefresh() {
    setRefreshing(true)
    fetchData()
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>
  }

  const activePosted = postedJobs.filter(j => ['open', 'accepted', 'in_progress'].includes(j.status))
  const pastPosted = postedJobs.filter(j => ['completed', 'cancelled'].includes(j.status))
  const completedPosted = postedJobs.filter(j => j.status === 'completed')

  const activeBids = myBids.filter(b =>
    b.status !== 'rejected' &&
    b.jobs &&
    !['completed', 'cancelled'].includes(b.jobs.status)
  )
  const pastBids = myBids.filter(b =>
    b.status === 'accepted' &&
    b.jobs &&
    ['completed', 'cancelled'].includes(b.jobs.status)
  )
  const completedBids = pastBids.filter(b => b.jobs.status === 'completed')

  const title = filter === 'completed' ? 'Completed jobs' : 'My Jobs'
  const headerJSX = (
    <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
      {navigation?.canGoBack() && (
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Go back">
          <Text style={styles.backBtnText}>← Back</Text>
        </TouchableOpacity>
      )}
      <Text style={styles.kicker}>Activity</Text>
      <Text style={styles.heading} accessibilityRole="header">{title}</Text>
    </View>
  )

  if (filter === 'completed') {
    return (
      <View style={styles.screen}>
        {headerJSX}
        <ScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}>

          {completedPosted.length === 0 && completedBids.length === 0 ? (
            <View style={[styles.emptySection, { marginHorizontal: 16 }]}>
              <Text style={styles.emptySectionText}>No completed jobs yet</Text>
            </View>
          ) : null}

          {completedPosted.length > 0 && (
            <View style={styles.cardSection}>
              <Text style={[styles.sectionLabel, { paddingHorizontal: 16 }]}>Tasks I posted</Text>
              <FlatList
                horizontal
                data={completedPosted}
                keyExtractor={job => `comp-posted-${job.id}`}
                renderItem={({ item: job }) => (
                  <JobServiceCard
                    item={job}
                    showStatusBadge
                    status="completed"
                    onPress={() => navigation.navigate('ManageTask', { job, bidCount: 0 })}
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
          )}

          {completedBids.length > 0 && (
            <View style={styles.cardSection}>
              <Text style={[styles.sectionLabel, { paddingHorizontal: 16 }]}>Jobs I completed</Text>
              <FlatList
                horizontal
                data={completedBids}
                keyExtractor={bid => `comp-bid-${bid.id}`}
                renderItem={({ item: bid }) => (
                  <JobServiceCard
                    item={bid.jobs}
                    showStatusBadge
                    status="completed"
                    onPress={() => navigation.navigate('JobDetail', { job: bid.jobs })}
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
          )}
        </ScrollView>
      </View>
    )
  }

  return (
    <View style={styles.screen}>
      {headerJSX}
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}>

        {/* Active posted tasks */}
        <View style={styles.cardSection}>
          <Text style={[styles.sectionLabel, { paddingHorizontal: 16 }]}>My posted tasks</Text>
          {activePosted.length === 0 ? (
            <View style={[styles.emptySection, { marginHorizontal: 16 }]}>
              <Text style={styles.emptySectionText}>No active tasks posted</Text>
            </View>
          ) : (
            <FlatList
              horizontal
              data={activePosted}
              keyExtractor={job => `active-${job.id}`}
              renderItem={({ item: job }) => (
                <JobServiceCard
                  item={job}
                  showStatusBadge
                  status={job.status}
                  onPress={() => navigation.navigate('ManageTask', { job, bidCount: job.bidCount || 0 })}
                />
              )}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.hListContent}
              ItemSeparatorComponent={() => <View style={{ width: CARD_GAP }} />}
              ListFooterComponent={<View style={{ width: 40 }} />}
              snapToInterval={SNAP_INTERVAL}
              decelerationRate="fast"
            />
          )}
        </View>

        {/* Past posted tasks (collapsible) */}
        {pastPosted.length > 0 && (
          <View style={styles.cardSection}>
            <TouchableOpacity
              style={[styles.pastSectionHeader, { marginHorizontal: 16 }]}
              onPress={() => setPastTasksExpanded(e => !e)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`Past tasks, ${pastPosted.length} items`}>
              <Text style={styles.pastSectionLabel}>Past tasks ({pastPosted.length})</Text>
              <Text style={styles.pastChevron}>{pastTasksExpanded ? '▲' : '▼'}</Text>
            </TouchableOpacity>
            {pastTasksExpanded && (
              <FlatList
                horizontal
                data={pastPosted}
                keyExtractor={job => `past-posted-${job.id}`}
                renderItem={({ item: job }) => (
                  <JobServiceCard
                    item={job}
                    showStatusBadge
                    status={job.status}
                    onPress={() => navigation.navigate('ManageTask', { job, bidCount: 0 })}
                  />
                )}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.hListContent}
                ItemSeparatorComponent={() => <View style={{ width: CARD_GAP }} />}
                ListFooterComponent={<View style={{ width: 40 }} />}
                snapToInterval={SNAP_INTERVAL}
                decelerationRate="fast"
              />
            )}
          </View>
        )}

        <View style={styles.sectionDivider} />

        {/* Active bids (jobs I'm doing) */}
        <View style={styles.cardSection}>
          <Text style={[styles.sectionLabel, { paddingHorizontal: 16 }]}>Jobs I'm doing</Text>
          {activeBids.length === 0 ? (
            <View style={[styles.emptySection, { marginHorizontal: 16 }]}>
              <Text style={styles.emptySectionText}>No active bids placed yet</Text>
            </View>
          ) : (
            <FlatList
              horizontal
              data={activeBids}
              keyExtractor={bid => `active-bid-${bid.id}`}
              renderItem={({ item: bid }) => (
                <JobServiceCard
                  item={bid.jobs}
                  showStatusBadge
                  status={bid.jobs?.status}
                  onPress={() => navigation.navigate('JobDetail', { job: bid.jobs })}
                />
              )}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.hListContent}
              ItemSeparatorComponent={() => <View style={{ width: CARD_GAP }} />}
              ListFooterComponent={<View style={{ width: 40 }} />}
              snapToInterval={SNAP_INTERVAL}
              decelerationRate="fast"
            />
          )}
        </View>

        {/* Past bids (collapsible) */}
        {pastBids.length > 0 && (
          <View style={styles.cardSection}>
            <TouchableOpacity
              style={[styles.pastSectionHeader, { marginHorizontal: 16 }]}
              onPress={() => setPastBidsExpanded(e => !e)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`Past jobs I did, ${pastBids.length} items`}>
              <Text style={styles.pastSectionLabel}>Past jobs I did ({pastBids.length})</Text>
              <Text style={styles.pastChevron}>{pastBidsExpanded ? '▲' : '▼'}</Text>
            </TouchableOpacity>
            {pastBidsExpanded && (
              <FlatList
                horizontal
                data={pastBids}
                keyExtractor={bid => `past-bid-${bid.id}`}
                renderItem={({ item: bid }) => (
                  <JobServiceCard
                    item={bid.jobs}
                    showStatusBadge
                    status={bid.jobs?.status}
                    onPress={() => navigation.navigate('JobDetail', { job: bid.jobs })}
                  />
                )}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.hListContent}
                ItemSeparatorComponent={() => <View style={{ width: CARD_GAP }} />}
                ListFooterComponent={<View style={{ width: 40 }} />}
                snapToInterval={SNAP_INTERVAL}
                decelerationRate="fast"
              />
            )}
          </View>
        )}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  cardSection: { marginBottom: 20 },
  hListContent: { paddingLeft: 16 },
  header: {
    backgroundColor: colors.background,
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  heading: { fontSize: 34, lineHeight: 38, fontWeight: '700', color: colors.textPrimary },
  kicker: { fontSize: 13, fontWeight: '700', color: colors.primary, marginBottom: 8 },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 10,
    marginTop: 4,
  },
  sectionDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 20,
  },
  pastSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: '#efefef',
    borderRadius: 10,
    marginTop: 10,
    marginBottom: 4,
    minHeight: 44,
  },
  pastSectionLabel: { fontSize: 14, fontWeight: '700', color: colors.textMuted },
  pastChevron: { fontSize: 13, color: colors.textMuted },
  backBtn: { marginBottom: 12, minHeight: 36, justifyContent: 'center', alignSelf: 'flex-start' },
  backBtnText: { color: colors.primary, fontSize: 15, fontWeight: '600' },
  emptySection: { paddingVertical: 20, alignItems: 'center', marginBottom: 8 },
  emptySectionText: { fontSize: 14, color: colors.textMuted },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
})
