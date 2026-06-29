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
import { JOB_ACTIVE_STATUSES, BOOKING_ACTIVE_STATUSES, isJobAwarded, isBookingWithdrawable, isBookingUnderway, isBookingDismissable } from '../../lib/lifecycle'
import {
  confirmBooking as apiConfirmBooking,
  declineBooking as apiDeclineBooking,
  markBookingReady as apiMarkBookingReady,
  confirmBookingComplete as apiConfirmBookingComplete,
  confirmBookingCancellation as apiConfirmBookingCancellation,
  dismissProviderBooking as apiDismissProviderBooking,
  cancelBookingByRequester as apiCancelBookingByRequester,
} from '../../lib/bookingActions'
import { colors } from '../../theme/tokens'
import Icon from '../../components/Icon'
import JobServiceCard, { CARD_GAP, CARD_WIDTH, SNAP_INTERVAL } from '../../components/JobServiceCard'
import ReviewModal from '../../components/ReviewModal'
import CancelModal from '../../components/CancelModal'
import EmptyState from '../../components/EmptyState'
import Loading from '../../components/Loading'
import { loadReview, saveReview } from '../../lib/reviews'
import { canProvide } from '../../lib/roles'
import { markNotificationsReadFor } from '../../lib/notifications'

function bookingNeedsQuote(booking) {
  return (booking?.service || booking?.services)?.pricing_type === 'quote_required'
}

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
  onDismiss,
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
  // Once the provider has marked it complete (awaiting_completion), the requester
  // confirms rather than cancels — so no cancel button at that point.
  const canRequesterCancel = viewerRole === 'requester'
    && ['pending', 'quote_sent', 'confirmed', 'in_progress'].includes(booking.status)
  const requesterNeedsConfirm = viewerRole === 'requester' && booking.status === 'awaiting_completion'
  const providerNeedsQuote = viewerRole === 'provider' && booking.status === 'pending' && serviceItem.pricing_type === 'quote_required'
  const providerPending = viewerRole === 'provider' && booking.status === 'pending' && !providerNeedsQuote
  const providerActive = viewerRole === 'provider' && isBookingUnderway(booking.status)
  const providerCanConfirmCancellation = viewerRole === 'provider' && booking.status === 'cancellation_requested'
  const providerCanDismiss = viewerRole === 'provider' && isBookingDismissable(booking.status)
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

      {providerNeedsQuote && (
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
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel="Send quote">
            <Text style={styles.miniPrimaryText}>Quote</Text>
          </TouchableOpacity>
        </View>
      )}

      {providerActive && (
        <TouchableOpacity
          style={styles.miniPrimaryBtn}
          onPress={onReady}
          accessibilityRole="button"
          accessibilityLabel="Mark booking complete">
          <Text style={styles.miniPrimaryText}>Mark complete</Text>
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

      {providerCanDismiss && (
        <TouchableOpacity
          style={styles.miniPrimaryBtn}
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel="Dismiss service booking">
          <Text style={styles.miniPrimaryText}>Dismiss</Text>
        </TouchableOpacity>
      )}

      {requesterNeedsConfirm && (
        <TouchableOpacity
          style={styles.miniPrimaryBtn}
          onPress={onConfirmComplete}
          accessibilityRole="button"
          accessibilityLabel="Confirm booking complete">
          <Text style={styles.miniPrimaryText}>Mark as complete</Text>
        </TouchableOpacity>
      )}

      {canRequesterCancel && (
        <TouchableOpacity
          style={styles.miniDangerBtn}
          onPress={onCancelRequest}
          accessibilityRole="button"
          accessibilityLabel="Cancel service booking">
          <Text style={styles.miniDangerText}>
            {isBookingWithdrawable(booking.status) ? 'Withdraw' : 'Request cancel'}
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
  const [cancelBookingTarget, setCancelBookingTarget] = useState(null)

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
    const tasks = [fetchRequesterData(user.id)] // everyone can request
    if (canProvide(prof)) tasks.push(fetchProviderData(user.id))
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
      .in('status', JOB_ACTIVE_STATUSES)
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
      .in('status', BOOKING_ACTIVE_STATUSES)
      .order('created_at', { ascending: false })

    const rawBookings = bookingsData || []
    if (rawBookings.length > 0) {
      const providerIds = [...new Set(rawBookings.map(b => b.provider_id).filter(Boolean))]
      const { data: provProfiles } = await supabase
        .from('profiles_public').select('id, full_name').in('id', providerIds)
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
      b.jobs && isJobAwarded(b.jobs.status)
    )
    setActiveBidJobs(activeBids.map(b => ({ ...b.jobs, _bidAmount: b.amount, bidCount: 0 })))

    // Bookings as provider
    const { data: bookingsData } = await supabase
      .from('bookings')
      .select('*, services(*)')
      .eq('provider_id', uid)
      .in('status', [...BOOKING_ACTIVE_STATUSES, 'withdrawn', 'cancelled'])
      .order('created_at', { ascending: false })

    const rawBookings = bookingsData || []
    if (rawBookings.length > 0) {
      const requesterIds = [...new Set(rawBookings.map(b => b.requester_id).filter(Boolean))]
      const { data: reqProfiles } = await supabase
        .from('profiles_public').select('id, full_name').in('id', requesterIds)
      const profileMap = {}
      reqProfiles?.forEach(p => { profileMap[p.id] = p })
      const visibleBookings = rawBookings.filter(b =>
        !(isBookingDismissable(b.status) && b.provider_archive_at)
      )
      setProviderBookings(visibleBookings.map(b => ({
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

    // Everyone can request, so always include completed requester history.
    {
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
              const { data: profiles } = await supabase.from('profiles_public').select('id, full_name').in('id', providerIds)
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

    if (role === 'provider' || role === 'both') { // provider history is additive
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
              const { data: profiles } = await supabase.from('profiles_public').select('id, full_name').in('id', requesterIds)
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

  async function confirmBooking(booking) {
    if (bookingNeedsQuote(booking)) {
      navigation.navigate('ServiceBookingDetail', { booking, viewerRole: 'provider' })
      return
    }
    const { error } = await apiConfirmBooking(booking.id)
    if (error) Alert.alert('Could not confirm booking', error.message)
    load()   // re-sync either way so a raced item reflects reality
  }

  function declineBooking(bookingId) {
    Alert.alert('Decline booking', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Decline',
        style: 'destructive',
        onPress: async () => {
          const { error } = await apiDeclineBooking(bookingId)
          if (error) Alert.alert('Could not decline booking', error.message)
          load()
        },
      },
    ])
  }

  async function dismissProviderBooking(booking) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await apiDismissProviderBooking(booking.id, user.id)

    if (error) Alert.alert('Could not dismiss booking', error.message)
    else load()
  }

  function completeBooking(bookingId) {
    Alert.alert(
      'Mark as complete?',
      'This tells the requester the work is done and asks them to confirm completion.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Mark complete',
          onPress: async () => {
            const { error } = await apiMarkBookingReady(bookingId)
            if (error) Alert.alert('Could not mark complete', error.message)
            load()
          },
        },
      ]
    )
  }

  function cancelRequesterBooking(booking) {
    setCancelBookingTarget(booking)
  }

  async function handleBookingCancelConfirm(reason, note) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const booking = cancelBookingTarget
    const { error, isPending } = await apiCancelBookingByRequester(booking, user.id, { reason, note })

    if (error) {
      Alert.alert(
        isPending ? 'Could not withdraw request' : 'Could not request cancellation',
        error.message
      )
    }
    setCancelBookingTarget(null)
    load()
  }

  async function confirmCancellation(bookingId) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { error } = await apiConfirmBookingCancellation(bookingId, user.id)
    if (error) Alert.alert('Could not confirm cancellation', error.message)
    load()
  }

  function confirmBookingComplete(bookingId) {
    Alert.alert(
      'Mark as complete?',
      'Confirm the work is done. This closes the booking and you can leave a review.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Mark as complete',
          onPress: async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return
            const { error } = await apiConfirmBookingComplete(bookingId, user.id)
            if (error) Alert.alert('Could not confirm', error.message)
            else await markNotificationsReadFor({ bookingId })
            load()
          },
        },
      ]
    )
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

  const isRequester = true
  const isProvider  = canProvide(profile)
  const totalActive = activeJobs.length + myBookings.length + activeBidJobs.length + providerBookings.length

  if (loading) {
    return (
      <View style={styles.screen}>
        <View style={[styles.header, { paddingTop: insets.top + 18 }]}>
          <Text style={styles.brandLabel}>RURAL CONNECTIONS</Text>
          <Text style={styles.headerTitle}>Activity</Text>
        </View>
        <Loading label="Loading activity…" />
      </View>
    )
  }

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 18 }]}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.brandLabel}>RURAL CONNECTIONS</Text>
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
              <Icon name="chevron-forward" size={18} color={colors.primary} />
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
          <EmptyState
            tone="positive"
            icon="checkmark-circle-outline"
            title="All caught up"
            body="Your active tasks and bookings will appear here as they come in."
            actionLabel={isRequester ? 'Post a job' : isProvider ? 'Browse jobs' : undefined}
            onAction={
              isRequester
                ? () => navigation.getParent()?.navigate('Home')
                : isProvider
                ? () => navigation.getParent()?.navigate('Jobs')
                : undefined
            }
          />
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
                  onPress={() => navigation.navigate('ServiceBookingDetail', { booking: b, viewerRole: 'requester' })}
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
                  onPress={() => navigation.navigate('ServiceBookingDetail', { booking: b, viewerRole: 'provider' })}
                  onConfirm={() => confirmBooking(b)}
                  onDecline={() => declineBooking(b.id)}
                  onReady={() => completeBooking(b.id)}
                  onConfirmCancellation={() => confirmCancellation(b.id)}
                  onDismiss={() => dismissProviderBooking(b)}
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
                          onPress={() => navigation.navigate('ServiceBookingDetail', { booking: b, viewerRole: b._viewerRole })}
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
      <CancelModal
        visible={!!cancelBookingTarget}
        onClose={() => setCancelBookingTarget(null)}
        onConfirm={handleBookingCancelConfirm}
        title="Cancel booking"
        subtitle={cancelBookingTarget?.service?.title || 'Service booking'}
        type="booking"
      />
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
  brandLabel: { fontSize: 12, fontWeight: '700', color: colors.accent, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 6 },
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

  completedBtn: {
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
    backgroundColor: colors.white,
  },
  completedBtnText: { fontSize: 14, fontWeight: '600', color: colors.primary },
})
