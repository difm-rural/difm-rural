import React, { useCallback, useState } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { supabase } from '../lib/supabase'
import { colors } from '../theme/tokens'
import JobCard from '../components/JobCard'

export default function MyJobsScreen({ navigation, route }) {
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

    setPostedJobs(rawJobs.map(job => ({
      ...job,
      profiles: profileData || null,
      bidCount: bidCountMap[job.id] || 0,
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

  function renderBack() {
    if (!navigation?.canGoBack()) return null
    return (
      <TouchableOpacity
        style={styles.backBtn}
        onPress={() => navigation.goBack()}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityRole="button"
        accessibilityLabel="Go back">
        <Text style={styles.backBtnText}>Back</Text>
      </TouchableOpacity>
    )
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

  if (filter === 'completed') {
    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingBottom: 30 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}>
        {renderBack()}
        <Text style={styles.heading} accessibilityRole="header">Completed jobs</Text>

        {completedPosted.length === 0 && completedBids.length === 0 ? (
          <View style={styles.emptySection}>
            <Text style={styles.emptySectionText}>No completed jobs yet</Text>
          </View>
        ) : null}

        {completedPosted.length > 0 ? (
          <>
            <Text style={styles.sectionLabel}>Tasks I posted</Text>
            {completedPosted.map(job => (
              <JobCard
                key={job.id}
                job={job}
                bidCount={0}
                onPress={() => navigation.navigate('ManageTask', { job, bidCount: 0 })}
              />
            ))}
          </>
        ) : null}

        {completedBids.length > 0 ? (
          <>
            <Text style={styles.sectionLabel}>Jobs I completed</Text>
            {completedBids.map(bid => (
              <JobCard
                key={bid.id}
                job={bid.jobs}
                bidCount={0}
                onPress={() => navigation.navigate('JobDetail', { job: bid.jobs })}
              />
            ))}
          </>
        ) : null}
      </ScrollView>
    )
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 30 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}>
      {renderBack()}
      <Text style={styles.heading} accessibilityRole="header">My Jobs</Text>

      <Text style={styles.sectionLabel}>My posted tasks</Text>
      {activePosted.length === 0 ? (
        <View style={styles.emptySection}>
          <Text style={styles.emptySectionText}>No active tasks posted</Text>
        </View>
      ) : (
        activePosted.map(job => (
          <JobCard
            key={job.id}
            job={job}
            bidCount={job.bidCount || 0}
            onPress={() => navigation.navigate('ManageTask', { job, bidCount: job.bidCount || 0 })}
          />
        ))
      )}

      {pastPosted.length > 0 && (
        <>
          <TouchableOpacity
            style={styles.pastSectionHeader}
            onPress={() => setPastTasksExpanded(e => !e)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`Past tasks, ${pastPosted.length} items`}
            accessibilityHint={pastTasksExpanded ? 'Double tap to collapse' : 'Double tap to expand'}>
            <Text style={styles.pastSectionLabel}>Past tasks ({pastPosted.length})</Text>
            <Text style={styles.pastChevron}>{pastTasksExpanded ? 'Up' : 'Down'}</Text>
          </TouchableOpacity>
          {pastTasksExpanded && pastPosted.map(job => (
            <JobCard
              key={job.id}
              job={job}
              bidCount={0}
              onPress={() => navigation.navigate('ManageTask', { job, bidCount: 0 })}
            />
          ))}
        </>
      )}

      <View style={styles.sectionDivider} />
      <Text style={styles.sectionLabel}>Jobs I'm doing</Text>
      {activeBids.length === 0 ? (
        <View style={styles.emptySection}>
          <Text style={styles.emptySectionText}>No active bids placed yet</Text>
        </View>
      ) : (
        activeBids.map(bid => (
          <JobCard
            key={bid.id}
            job={bid.jobs}
            bidCount={0}
            onPress={() => navigation.navigate('JobDetail', { job: bid.jobs })}
          />
        ))
      )}

      {pastBids.length > 0 && (
        <>
          <TouchableOpacity
            style={styles.pastSectionHeader}
            onPress={() => setPastBidsExpanded(e => !e)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`Past jobs I did, ${pastBids.length} items`}
            accessibilityHint={pastBidsExpanded ? 'Double tap to collapse' : 'Double tap to expand'}>
            <Text style={styles.pastSectionLabel}>Past jobs I did ({pastBids.length})</Text>
            <Text style={styles.pastChevron}>{pastBidsExpanded ? 'Up' : 'Down'}</Text>
          </TouchableOpacity>
          {pastBidsExpanded && pastBids.map(bid => (
            <JobCard
              key={bid.id}
              job={bid.jobs}
              bidCount={0}
              onPress={() => navigation.navigate('JobDetail', { job: bid.jobs })}
            />
          ))}
        </>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 16, paddingTop: 60 },
  heading: { fontSize: 26, fontWeight: 'bold', color: colors.primary, marginBottom: 16 },
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
  backBtn: { paddingHorizontal: 4, paddingTop: 4, paddingBottom: 0, marginBottom: 4, minHeight: 44, justifyContent: 'center' },
  backBtnText: { color: colors.primary, fontSize: 16, fontWeight: '600' },
  emptySection: { paddingVertical: 20, alignItems: 'center', marginBottom: 8 },
  emptySectionText: { fontSize: 14, color: colors.textMuted },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
})
