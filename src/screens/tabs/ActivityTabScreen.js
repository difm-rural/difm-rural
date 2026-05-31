import React, { useCallback, useState } from 'react'
import {
  Alert,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../../lib/supabase'
import { colors } from '../../theme/tokens'
import JobServiceCard, { CARD_GAP, CARD_WIDTH, SNAP_INTERVAL } from '../../components/JobServiceCard'
import ReviewModal from '../../components/ReviewModal'
import { loadReview, saveReview } from '../../lib/reviews'

function BookingWorkCard({
  booking,
  viewerRole,
  onPress,
  onConfirm,
  onDecline,
  onReady,
  onConfirmComplete,
  onCancelRequest,
  onConfirmCancellation,
  onReview,
}) {
  const serviceItem = {
    ...(booking.service || {}),
    _type: 'service',
    location_name: booking.location_name,
    profile: {
      full_name: viewerRole === 'provider' ? booking.requesterName : booking.providerName,
    },
  }
  const canRequesterCancel = viewerRole === 'requester'
    && ['pending', 'confirmed', 'in_progress', 'awaiting_completion'].includes(booking.status)
  const requesterNeedsConfirm = viewerRole === 'requester' && booking.status === 'awaiting_completion'
  const providerPending = viewerRole === 'provider' && booking.status === 'pending'
  const providerActive = viewerRole === 'provider' && ['confirmed', 'in_progress'].includes(booking.status)
  const providerCanConfirmCancellation = viewerRole === 'provider' && booking.status === 'cancellation_requested'
  const canReview = booking.status === 'completed' && !!onReview

  return (
    <View style={styles.bookingWorkWrap}>
      <JobServiceCard
        item={serviceItem}
        showStatusBadge
        status={booking.status}
        onPress={onPress}
      />

      {providerPending && (
        <View style={styles.miniActionRow}>
          <TouchableOpacity
            style={styles.miniDangerBtn}
            onPress={onDecline}
            accessibilityRole="button"
            accessibilityLabel="Decline booking">
            <Text style={styles.miniDangerText}>Decline</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.miniPrimaryBtn}
            onPress={onConfirm}
            accessibilityRole="button"
            accessibilityLabel="Confirm booking">
            <Text style={styles.miniPrimaryText}>Confirm</Text>
          </TouchableOpacity>
        </View>
      )}

      {providerActive && (
        <TouchableOpacity
          style={styles.miniPrimaryBtn}
          onPress={onReady}
          accessibilityRole="button"
          accessibilityLabel="Send booking for requester confirmation">
          <Text style={styles.miniPrimaryText}>Ready</Text>
        </TouchableOpacity>
      )}

      {providerCanConfirmCancellation && (
        <TouchableOpacity
          style={styles.miniDangerBtn}
          onPress={onConfirmCancellation}
          accessibilityRole="button"
          accessibilityLabel="Confirm cancellation">
          <Text style={styles.miniDangerText}>Confirm cancel</Text>
        </TouchableOpacity>
      )}

      {requesterNeedsConfirm && (
        <TouchableOpacity
          style={styles.miniPrimaryBtn}
          onPress={onConfirmComplete}
          accessibilityRole="button"
          accessibilityLabel="Confirm booking complete">
          <Text style={styles.miniPrimaryText}>Complete</Text>
        </TouchableOpacity>
      )}

      {canRequesterCancel && (
        <TouchableOpacity
          style={styles.miniDangerBtn}
          onPress={onCancelRequest}
          accessibilityRole="button"
          accessibilityLabel="Cancel service booking">
          <Text style={styles.miniDangerText}>
            {booking.status === 'pending' ? 'Cancel' : 'Request cancel'}
          </Text>
        </TouchableOpacity>
      )}

      {viewerRole === 'requester' && booking.status === 'cancellation_requested' && (
        <Text style={styles.bookingHint}>Waiting for provider</Text>
      )}

      {canReview && (
        <TouchableOpacity
          style={styles.miniPrimaryBtn}
          onPress={onReview}
          accessibilityRole="button"
          accessibilityLabel={viewerRole === 'requester' ? 'Review provider' : 'Review requester'}>
          <Text style={styles.miniPrimaryText}>
            {viewerRole === 'requester' ? 'Review provider' : 'Review requester'}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

export default function ActivityTabScreen({ navigation }) {
  const insets = useSafeAreaInsets()
  const [profile, setProfile] = useState(null)

  // Requester data
  const [activeJobs, setActiveJobs]   = useState([])
  const [myBookings, setMyBookings]   = useState([])

  // Provider data
  const [activeBidJobs, setActiveBidJobs]         = useState([])
  const [providerBookings, setProviderBookings]   = useState([])

  const [completedCount, setCompletedCount] = useState(0)
  const [completedJobs, setCompletedJobs] = useState([])
  const [completedBookings, setCompletedBookings] = useState([])
  const [showCompleted, setShowCompleted] = useState(false)
  const [loading, setLoading]     = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [reviewContext, setReviewContext] = useState(null)
  const [savingReview, setSavingReview] = useState(false)

  useFocusEffect(useCallback(() => { load() }, []))

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data: prof } = await supabase
      .from('profiles')
      .select('primary_role, role, full_name')
      .eq('id', user.id)
      .single()
    setProfile(prof)

    const role = prof?.primary_role || prof?.role || 'requester'
    const tasks = []
    if (role === 'requester' || role === 'both') tasks.push(fetchRequesterData(user.id))
    if (role === 'provider'  || role === 'both') tasks.push(fetchProviderData(user.id))
    tasks.push(fetchCompletedData(user.id, role))

    await Promise.all(tasks)
    setLoading(false)
    setRefreshing(false)
  }

  async function fetchRequesterData(uid) {
    // Active posted jobs
    const { data: jobsData } = await supabase
      .from('jobs')
      .select('*')
      .eq('requester_id', uid)
      .in('status', ['open', 'accepted', 'in_progress'])
      .order('created_at', { ascending: false })

    const rawJobs = jobsData || []
    if (rawJobs.length > 0) {
      const openIds = rawJobs.filter(j => j.status === 'open').map(j => j.id)
      let bidCountMap = {}
      if (openIds.length > 0) {
        const { data: bidsData } = await supabase
          .from('bids').select('job_id').in('job_id', openIds).eq('status', 'pending')
        bidsData?.forEach(b => { bidCountMap[b.job_id] = (bidCountMap[b.job_id] || 0) + 1 })
      }
      setActiveJobs(rawJobs.map(j => ({ ...j, bidCount: bidCountMap[j.id] || 0 })))
    } else {
      setActiveJobs([])
    }

    // Booked services as requester
    const { data: bookingsData } = await supabase
      .from('bookings')
      .select('*, services(*)')
      .eq('requester_id', uid)
      .in('status', ['pending', 'confirmed', 'in_progress', 'awaiting_completion', 'cancellation_requested'])
      .order('created_at', { ascending: false })

    const rawBookings = bookingsData || []
    if (rawBookings.length > 0) {
      const providerIds = [...new Set(rawBookings.map(b => b.provider_id).filter(Boolean))]
      const { data: provProfiles } = await supabase
        .from('profiles').select('id, full_name').in('id', providerIds)
      const profileMap = {}
      provProfiles?.forEach(p => { profileMap[p.id] = p })
      setMyBookings(rawBookings.map(b => ({
        ...b,
        service: b.services,
        providerName: profileMap[b.provider_id]?.full_name || '—',
      })))
    } else {
      setMyBookings([])
    }
  }

  async function fetchProviderData(uid) {
    // Jobs with accepted bids
    const { data: bidsData } = await supabase
      .from('bids')
      .select('*, jobs(*)')
      .eq('provider_id', uid)
      .eq('status', 'accepted')
      .order('created_at', { ascending: false })

    const activeBids = (bidsData || []).filter(b =>
      b.jobs && ['accepted', 'in_progress'].includes(b.jobs.status)
    )
    setActiveBidJobs(activeBids.map(b => ({ ...b.jobs, _bidAmount: b.amount, bidCount: 0 })))

    // Bookings as provider
    const { data: bookingsData } = await supabase
      .from('bookings')
      .select('*, services(*)')
      .eq('provider_id', uid)
      .in('status', ['pending', 'confirmed', 'in_progress', 'awaiting_completion', 'cancellation_requested', 'cancelled'])
      .order('created_at', { ascending: false })

    const rawBookings = bookingsData || []
    if (rawBookings.length > 0) {
      const requesterIds = [...new Set(rawBookings.map(b => b.requester_id).filter(Boolean))]
      const { data: reqProfiles } = await supabase
        .from('profiles').select('id, full_name').in('id', requesterIds)
      const profileMap = {}
      reqProfiles?.forEach(p => { profileMap[p.id] = p })
      setProviderBookings(rawBookings.map(b => ({
        ...b,
        service: b.services,
        requesterName: profileMap[b.requester_id]?.full_name || '—',
      })))
    } else {
      setProviderBookings([])
    }
  }

  async function fetchCompletedData(uid, role) {
    const jobs = []
    const bookings = []
    const promises = []

    if (role === 'requester' || role === 'both') {
      promises.push(
        supabase.from('jobs').select('*')
          .eq('requester_id', uid).eq('status', 'completed')
          .order('created_at', { ascending: false })
          .then(({ data }) => { jobs.push(...((data || []).map(j => ({ ...j, _viewerRole: 'requester', bidCount: 0 })))) })
      )
      promises.push(
        supabase.from('bookings').select('*, services(*)')
          .eq('requester_id', uid).eq('status', 'completed')
          .order('created_at', { ascending: false })
          .then(async ({ data }) => {
            const raw = data || []
            const providerIds = [...new Set(raw.map(b => b.provider_id).filter(Boolean))]
            let profileMap = {}
            if (providerIds.length > 0) {
              const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', providerIds)
              profiles?.forEach(p => { profileMap[p.id] = p })
            }
            bookings.push(...raw.map(b => ({
              ...b,
              service: b.services,
              providerName: profileMap[b.provider_id]?.full_name || '—',
              _viewerRole: 'requester',
            })))
          })
      )
    }

    if (role === 'provider' || role === 'both') {
      promises.push(
        supabase.from('bids').select('*, jobs(*)')
          .eq('provider_id', uid).eq('status', 'accepted')
          .order('created_at', { ascending: false })
          .then(({ data }) => {
            jobs.push(...((data || [])
              .filter(b => b.jobs?.status === 'completed')
              .map(b => ({ ...b.jobs, _bidAmount: b.amount, _viewerRole: 'provider', bidCount: 0 }))))
          })
      )
      promises.push(
        supabase.from('bookings').select('*, services(*)')
          .eq('provider_id', uid).eq('status', 'completed')
          .order('created_at', { ascending: false })
          .then(async ({ data }) => {
            const raw = data || []
            const requesterIds = [...new Set(raw.map(b => b.requester_id).filter(Boolean))]
            let profileMap = {}
            if (requesterIds.length > 0) {
              const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', requesterIds)
              profiles?.forEach(p => { profileMap[p.id] = p })
            }
            bookings.push(...raw.map(b => ({
              ...b,
              service: b.services,
              requesterName: profileMap[b.requester_id]?.full_name || '—',
              _viewerRole: 'provider',
            })))
          })
      )
    }

    await Promise.all(promises)
    setCompletedJobs(jobs)
    setCompletedBookings(bookings)
    setCompletedCount(jobs.length + bookings.length)
  }

  async function confirmBooking(bookingId) {
    const { error } = await supabase.from('bookings').update({ status: 'confirmed' }).eq('id', bookingId)
    if (!error) load()
    else Alert.alert('Error', 'Could not confirm booking.')
  }

  function declineBooking(bookingId) {
    Alert.alert('Decline booking', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Decline',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', bookingId)
          if (!error) load()
          else Alert.alert('Error', 'Could not decline booking.')
        },
      },
    ])
  }

  async function completeBooking(bookingId) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase
      .from('bookings')
      .update({ status: 'awaiting_completion' })
      .eq('id', bookingId)
      .eq('provider_id', user.id)
      .in('status', ['confirmed', 'in_progress'])

    if (!error) load()
    else Alert.alert('Could not send for confirmation', error.message)
  }

  async function cancelRequesterBooking(booking) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const nextStatus = booking.status === 'pending' ? 'cancelled' : 'cancellation_requested'
    const message = booking.status === 'pending'
      ? 'Cancel this service order? The provider has not accepted it yet.'
      : 'Request cancellation? The provider will be asked to confirm.'

    Alert.alert('Cancel order', message, [
      { text: 'No', style: 'cancel' },
      {
        text: booking.status === 'pending' ? 'Cancel order' : 'Request cancellation',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase
            .from('bookings')
            .update({ status: nextStatus })
            .eq('id', booking.id)
            .eq('requester_id', user.id)
          if (error) Alert.alert('Could not cancel order', error.message)
          else load()
        },
      },
    ])
  }

  async function confirmCancellation(bookingId) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { error } = await supabase
      .from('bookings')
      .update({ status: 'cancelled' })
      .eq('id', bookingId)
      .eq('provider_id', user.id)
      .eq('status', 'cancellation_requested')
    if (error) Alert.alert('Could not confirm cancellation', error.message)
    else load()
  }

  async function confirmBookingComplete(bookingId) {
    const { error } = await supabase.from('bookings').update({ status: 'completed' }).eq('id', bookingId)
    if (!error) load()
    else Alert.alert('Error', 'Could not confirm booking complete.')
  }

  async function openBookingReview(booking) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const reviewerRole = booking._viewerRole
    const revieweeId = reviewerRole === 'requester' ? booking.provider_id : booking.requester_id
    const revieweeRole = reviewerRole === 'requester' ? 'provider' : 'requester'
    const revieweeName = reviewerRole === 'requester' ? booking.providerName : booking.requesterName

    try {
      const existing = await loadReview({
        bookingId: booking.id,
        reviewerId: user.id,
        reviewerRole,
      })
      setReviewContext({ booking, existing, reviewerId: user.id, reviewerRole, revieweeId, revieweeRole, revieweeName })
    } catch (error) {
      Alert.alert('Reviews not ready', error.message)
    }
  }

  async function submitBookingReview({ rating, comment }) {
    if (!reviewContext) return
    setSavingReview(true)
    try {
      const saved = await saveReview({
        bookingId: reviewContext.booking.id,
        reviewerId: reviewContext.reviewerId,
        revieweeId: reviewContext.revieweeId,
        reviewerRole: reviewContext.reviewerRole,
        revieweeRole: reviewContext.revieweeRole,
        rating,
        comment,
      })
      setReviewContext(prev => ({ ...prev, existing: saved }))
      setReviewContext(null)
      Alert.alert('Review saved', 'Thanks for leaving feedback.')
    } catch (error) {
      Alert.alert('Could not save review', error.message)
    } finally {
      setSavingReview(false)
    }
  }

  function onRefresh() { setRefreshing(true); load() }

  const role        = profile?.primary_role || profile?.role || 'requester'
  const isRequester = role === 'requester' || role === 'both'
  const isProvider  = role === 'provider'  || role === 'both'
  const totalActive = activeJobs.length + myBookings.length + activeBidJobs.length + providerBookings.length

  if (loading) {
    return (
      <View style={styles.screen}>
        <View style={[styles.header, { paddingTop: insets.top + 18 }]}>
          <Text style={styles.brandLabel}>DIFM RURAL</Text>
          <Text style={styles.headerTitle}>Activity</Text>
        </View>
        <View style={styles.center}>
          <Text style={styles.loadingText}>Loading activity...</Text>
        </View>
      </View>
    )
  }

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 18 }]}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.brandLabel}>DIFM RURAL</Text>
            <Text style={styles.headerTitle} accessibilityRole="header">Activity</Text>
            <Text style={styles.headerSub}>
              {totalActive > 0
                ? `${totalActive} active item${totalActive === 1 ? '' : 's'}`
                : 'No active items'}
            </Text>
          </View>
          {isRequester && (
            <TouchableOpacity
              style={styles.myJobsBtn}
              onPress={() => navigation.navigate('MyJobs')}
              accessibilityRole="button"
              accessibilityLabel="View all my jobs">
              <Text style={styles.myJobsBtnText}>My jobs</Text>
              <Text style={styles.myJobsArrow}>›</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 88 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}>

        {/* Empty state */}
        {totalActive === 0 && (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyTitle}>All caught up</Text>
            <Text style={styles.emptyBody}>
              Your active tasks and bookings will appear here.
            </Text>
            {isRequester && (
              <TouchableOpacity
                style={styles.postBtn}
                onPress={() => navigation.getParent()?.navigate('Home')}
                accessibilityRole="button">
                <Text style={styles.postBtnText}>Post a job</Text>
              </TouchableOpacity>
            )}
            {isProvider && (
              <TouchableOpacity
                style={styles.browseBtn}
                onPress={() => navigation.getParent()?.navigate('Browse')}
                accessibilityRole="button">
                <Text style={styles.browseBtnText}>Browse jobs</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Requester: Posted tasks */}
        {isRequester && activeJobs.length > 0 && (
          <View style={styles.cardSection}>
            <Text style={styles.sectionLabel}>Posted jobs</Text>
            <FlatList
              horizontal
              data={activeJobs}
              keyExtractor={job => `job-${job.id}`}
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
          </View>
        )}

        {/* Requester: Booked services */}
        {isRequester && myBookings.length > 0 && (
          <View style={styles.cardSection}>
            <Text style={styles.sectionLabel}>Your bookings</Text>
            <FlatList
              horizontal
              data={myBookings}
              keyExtractor={b => `booking-${b.id}`}
              renderItem={({ item: b }) => (
                <BookingWorkCard
                  booking={b}
                  viewerRole="requester"
                  onPress={() => navigation.navigate('ServiceDetail', { service: b.service })}
                  onConfirmComplete={() => confirmBookingComplete(b.id)}
                  onCancelRequest={() => cancelRequesterBooking(b)}
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

        {/* Provider: Jobs doing */}
        {isProvider && activeBidJobs.length > 0 && (
          <View style={styles.cardSection}>
            <Text style={styles.sectionLabel}>Jobs you're doing</Text>
            <FlatList
              horizontal
              data={activeBidJobs}
              keyExtractor={job => `bid-job-${job.id}`}
              renderItem={({ item: job }) => (
                <JobServiceCard
                  item={job}
                  showStatusBadge
                  status={job.status}
                  onPress={() => navigation.navigate('JobDetail', { job })}
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

        {/* Provider: Service bookings */}
        {isProvider && providerBookings.length > 0 && (
          <View style={styles.cardSection}>
            <Text style={styles.sectionLabel}>Service bookings</Text>
            <FlatList
              horizontal
              data={providerBookings}
              keyExtractor={b => `prov-booking-${b.id}`}
              renderItem={({ item: b }) => (
                <BookingWorkCard
                  booking={b}
                  viewerRole="provider"
                  onPress={() => navigation.navigate('ServiceDetail', { service: b.service })}
                  onConfirm={() => confirmBooking(b.id)}
                  onDecline={() => declineBooking(b.id)}
                  onReady={() => completeBooking(b.id)}
                  onConfirmCancellation={() => confirmCancellation(b.id)}
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

        {/* Completed footer link */}
        {completedCount > 0 && (
          <>
            <TouchableOpacity
              style={styles.completedBtn}
              onPress={() => setShowCompleted(v => !v)}
              accessibilityRole="button"
              accessibilityLabel={`${showCompleted ? 'Hide' : 'View'} ${completedCount} completed items`}>
              <Text style={styles.completedBtnText}>
                {showCompleted ? 'Hide' : 'View'} {completedCount} completed task{completedCount === 1 ? '' : 's'} & service{completedCount === 1 ? '' : 's'}
              </Text>
            </TouchableOpacity>

            {showCompleted && (
              <>
                {completedJobs.length > 0 && (
                  <View style={styles.cardSection}>
                    <Text style={styles.sectionLabel}>Completed jobs</Text>
                    <FlatList
                      horizontal
                      data={completedJobs}
                      keyExtractor={job => `comp-job-${job._viewerRole}-${job.id}`}
                      renderItem={({ item: job }) => (
                        <JobServiceCard
                          item={job}
                          showStatusBadge
                          status="completed"
                          onPress={() => {
                            if (job._viewerRole === 'requester') navigation.navigate('ManageTask', { job, bidCount: 0 })
                            else navigation.navigate('JobDetail', { job })
                          }}
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

                {completedBookings.length > 0 && (
                  <View style={styles.cardSection}>
                    <Text style={styles.sectionLabel}>Completed services</Text>
                    <FlatList
                      horizontal
                      data={completedBookings}
                      keyExtractor={b => `comp-booking-${b._viewerRole}-${b.id}`}
                      renderItem={({ item: b }) => (
                        <BookingWorkCard
                          booking={{ ...b, status: 'completed' }}
                          viewerRole={b._viewerRole}
                          onPress={() => navigation.navigate('ServiceDetail', { service: b.service })}
                          onReview={() => openBookingReview(b)}
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
              </>
            )}
          </>
        )}
      </ScrollView>
      <ReviewModal
        visible={!!reviewContext}
        title={reviewContext?.reviewerRole === 'requester' ? 'Review provider' : 'Review requester'}
        subtitle={reviewContext?.revieweeName ? `How was working with ${reviewContext.revieweeName}?` : 'How was this booking?'}
        initialRating={reviewContext?.existing?.rating || 0}
        initialComment={reviewContext?.existing?.comment || ''}
        saving={savingReview}
        onClose={() => setReviewContext(null)}
        onSubmit={submitBookingReview}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: colors.textMuted, fontSize: 15 },

  header: {
    paddingHorizontal: 20,
    paddingBottom: 14,
    backgroundColor: colors.background,
  },
  headerRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  myJobsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 9,
    marginBottom: 2,
    gap: 4,
  },
  myJobsBtnText: { fontSize: 14, fontWeight: '700', color: colors.primary },
  myJobsArrow:   { fontSize: 18, color: colors.primary, lineHeight: 20 },
  brandLabel: { fontSize: 11, fontWeight: '600', color: '#95d5b2', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 },
  headerTitle: {
    fontSize: 34,
    lineHeight: 38,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 8,
    letterSpacing: 0,
  },
  headerSub: { fontSize: 15, lineHeight: 22, color: colors.textSecondary },

  body: { padding: 16 },

  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
    marginTop: 4,
  },
  cardSection: { marginBottom: 20 },
  hListContent: { paddingLeft: 20 },
  bookingWorkWrap: { width: CARD_WIDTH, gap: 8 },
  miniActionRow: { flexDirection: 'row', gap: 6 },
  miniPrimaryBtn: {
    flex: 1,
    minHeight: 36,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  miniPrimaryText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  miniDangerBtn: {
    flex: 1,
    minHeight: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.danger,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  miniDangerText: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  bookingHint: {
    fontSize: 11,
    lineHeight: 15,
    color: colors.textMuted,
    textAlign: 'center',
  },

  emptyWrap: {
    alignItems: 'center',
    paddingVertical: 34,
    paddingHorizontal: 18,
    backgroundColor: colors.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary, marginBottom: 8 },
  emptyBody:  { fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginBottom: 24, lineHeight: 21 },
  postBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingHorizontal: 28,
    paddingVertical: 14,
    marginBottom: 12,
    minHeight: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  postBtnText: { fontSize: 15, fontWeight: '700', color: colors.white },
  browseBtn: {
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: 12,
    paddingHorizontal: 28,
    paddingVertical: 14,
    minHeight: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  browseBtnText: { fontSize: 15, fontWeight: '600', color: colors.primary },

  completedBtn: {
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
    backgroundColor: colors.white,
  },
  completedBtnText: { fontSize: 14, fontWeight: '600', color: colors.primary },
})
