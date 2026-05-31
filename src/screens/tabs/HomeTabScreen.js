import React, { useCallback, useState } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import {
  Alert,
  FlatList,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../../lib/supabase'
import { colors } from '../../theme/tokens'
import JobServiceCard, { CARD_GAP, CARD_WIDTH, SNAP_INTERVAL } from '../../components/JobServiceCard'

function getInitials(name) {
  if (!name) return '?'
  return name.trim().split(/\s+/).map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
}

function formatMoney(amount) {
  if (amount == null || amount === '') return null
  return `$${amount} NZD`
}

function statusLabel(status) {
  switch (status) {
    case 'pending': return 'Waiting for provider to confirm acceptance'
    case 'confirmed': return 'Confirmed'
    case 'in_progress': return 'In progress'
    case 'awaiting_completion': return 'Ready to confirm'
    case 'cancellation_requested': return 'Cancellation requested'
    case 'completed': return 'Completed'
    case 'cancelled': return 'Cancelled'
    default: return status || 'Active'
  }
}

function PrimaryAction({ title, subtitle, onPress, variant = 'primary' }) {
  const isPrimary = variant === 'primary'
  return (
    <TouchableOpacity
      style={[styles.actionCard, isPrimary ? styles.primaryAction : styles.secondaryAction]}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={title}>
      <Text style={[styles.actionTitle, isPrimary ? styles.primaryActionText : styles.secondaryActionText]}>
        {title}
      </Text>
      <Text style={[styles.actionSubtitle, isPrimary ? styles.primaryActionSub : styles.secondaryActionSub]}>
        {subtitle}
      </Text>
    </TouchableOpacity>
  )
}

function AttentionRow({ title, detail, tone = 'default', onPress }) {
  return (
    <TouchableOpacity
      style={styles.attentionRow}
      onPress={onPress}
      activeOpacity={0.82}
      accessibilityRole="button"
      accessibilityLabel={title}>
      <View style={[styles.attentionDot, tone === 'warning' && styles.attentionDotWarning]} />
      <View style={{ flex: 1 }}>
        <Text style={styles.attentionTitle}>{title}</Text>
        {!!detail && <Text style={styles.attentionDetail}>{detail}</Text>}
      </View>
      <Text style={styles.attentionArrow}>View</Text>
    </TouchableOpacity>
  )
}

function BookingCard({ booking, viewerRole, navigation, onConfirm, onDecline, onSendForConfirm, onConfirmComplete, onCancelRequest }) {
  const service = booking.service || {}
  const otherParty = viewerRole === 'provider' ? booking.requester : booking.provider
  const isPending = booking.status === 'pending'
  const isProviderActive = viewerRole === 'provider' && ['confirmed', 'in_progress'].includes(booking.status)
  const isRequesterReady = viewerRole === 'requester' && booking.status === 'awaiting_completion'
  const canRequesterCancel = viewerRole === 'requester' && ['pending', 'confirmed', 'in_progress', 'awaiting_completion'].includes(booking.status)
  const isCancellationRequested = viewerRole === 'provider' && booking.status === 'cancellation_requested'

  return (
    <View style={styles.workCard}>
      <View style={styles.workCardTop}>
        <View style={{ flex: 1 }}>
          <Text style={styles.workEyebrow}>Service booking</Text>
          <Text style={styles.workTitle} numberOfLines={2}>{service.title || 'Service booking'}</Text>
        </View>
        <View style={styles.statusPill}>
          <Text style={styles.statusPillText}>{statusLabel(booking.status)}</Text>
        </View>
      </View>

      <Text style={styles.workMeta}>
        {viewerRole === 'provider' ? 'Requester' : 'Provider'}: {otherParty?.full_name || 'Not available'}
      </Text>
      {!!booking.location_name && <Text style={styles.workMeta}>{booking.location_name}</Text>}
      {!!booking.total_amount && <Text style={styles.workMeta}>{formatMoney(booking.total_amount)}</Text>}

      <View style={styles.cardActions}>
        <TouchableOpacity
          style={styles.outlineBtn}
          onPress={() => navigation.navigate('ServiceDetail', { service })}
          accessibilityRole="button"
          accessibilityLabel="View service booking">
          <Text style={styles.outlineBtnText}>View</Text>
        </TouchableOpacity>

        {viewerRole === 'provider' && isPending && (
          <>
            <TouchableOpacity
              style={styles.dangerBtn}
              onPress={() => onDecline(booking)}
              accessibilityRole="button"
              accessibilityLabel="Decline booking">
              <Text style={styles.dangerBtnText}>Decline</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.solidBtn}
              onPress={() => onConfirm(booking)}
              accessibilityRole="button"
              accessibilityLabel="Confirm booking">
              <Text style={styles.solidBtnText}>Confirm</Text>
            </TouchableOpacity>
          </>
        )}

        {isProviderActive && (
          <TouchableOpacity
            style={styles.solidBtn}
            onPress={() => onSendForConfirm(booking)}
            accessibilityRole="button"
            accessibilityLabel="Send booking for confirmation">
            <Text style={styles.solidBtnText}>Ready</Text>
          </TouchableOpacity>
        )}

        {isCancellationRequested && (
          <TouchableOpacity
            style={styles.solidBtn}
            onPress={() => onSendForConfirm({ ...booking, _action: 'confirm_cancellation' })}
            accessibilityRole="button"
            accessibilityLabel="Confirm cancellation">
            <Text style={styles.solidBtnText}>Confirm cancellation</Text>
          </TouchableOpacity>
        )}

        {isRequesterReady && (
          <TouchableOpacity
            style={styles.solidBtn}
            onPress={() => onConfirmComplete(booking)}
            accessibilityRole="button"
            accessibilityLabel="Confirm booking complete">
            <Text style={styles.solidBtnText}>Confirm</Text>
          </TouchableOpacity>
        )}

        {canRequesterCancel && (
          <TouchableOpacity
            style={styles.dangerBtn}
            onPress={() => onCancelRequest(booking)}
            accessibilityRole="button"
            accessibilityLabel="Cancel order">
            <Text style={styles.dangerBtnText}>Cancel</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  )
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
}) {
  const serviceItem = {
    ...(booking.service || {}),
    _type: 'service',
    location_name: booking.location_name,
    profile: viewerRole === 'provider' ? booking.requester : booking.provider,
  }
  const canRequesterCancel = viewerRole === 'requester'
    && ['pending', 'confirmed', 'in_progress', 'awaiting_completion'].includes(booking.status)
  const requesterNeedsConfirm = viewerRole === 'requester' && booking.status === 'awaiting_completion'
  const providerPending = viewerRole === 'provider' && booking.status === 'pending'
  const providerActive = viewerRole === 'provider' && ['confirmed', 'in_progress'].includes(booking.status)
  const providerCanConfirmCancellation = viewerRole === 'provider' && booking.status === 'cancellation_requested'

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
    </View>
  )
}

export default function HomeTabScreen({ navigation }) {
  const insets = useSafeAreaInsets()
  const [userId, setUserId] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const [postedJobs, setPostedJobs] = useState([])
  const [requesterBookings, setRequesterBookings] = useState([])
  const [pendingBids, setPendingBids] = useState([])
  const [activeBidJobs, setActiveBidJobs] = useState([])
  const [pendingBookings, setPendingBookings] = useState([])
  const [activeBookings, setActiveBookings] = useState([])
  const [openJobs, setOpenJobs] = useState([])

  useFocusEffect(useCallback(() => { load() }, []))

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setLoading(false)
      setRefreshing(false)
      return
    }

    setUserId(user.id)
    const { data: prof } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url, primary_role, role')
      .eq('id', user.id)
      .single()

    setProfile(prof)
    const role = prof?.primary_role || prof?.role || 'requester'
    await Promise.all([
      (role === 'requester' || role === 'both') ? fetchRequesterData(user.id) : Promise.resolve(),
      (role === 'provider' || role === 'both') ? fetchProviderData(user.id) : Promise.resolve(),
    ])
    setLoading(false)
    setRefreshing(false)
  }

  async function fetchRequesterData(uid) {
    const { data: jobsData } = await supabase
      .from('jobs')
      .select('*')
      .eq('requester_id', uid)
      .order('created_at', { ascending: false })

    const jobs = jobsData || []
    const openIds = jobs.filter(j => j.status === 'open').map(j => j.id)
    let bidMap = {}
    if (openIds.length > 0) {
      const { data: bids } = await supabase
        .from('bids')
        .select('job_id')
        .in('job_id', openIds)
        .eq('status', 'pending')
      bids?.forEach(b => { bidMap[b.job_id] = (bidMap[b.job_id] || 0) + 1 })
    }

    const { data: profData } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url')
      .eq('id', uid)
      .single()
    setPostedJobs(jobs.map(j => ({ ...j, profiles: profData, bidCount: bidMap[j.id] || 0 })))

    const { data: bookingData } = await supabase
      .from('bookings')
      .select('*, service:service_id(*)')
      .eq('requester_id', uid)
      .in('status', ['pending', 'confirmed', 'in_progress', 'awaiting_completion', 'cancellation_requested'])
      .order('created_at', { ascending: false })

    const bookings = bookingData || []
    if (bookings.length === 0) {
      setRequesterBookings([])
      return
    }

    const providerIds = [...new Set(bookings.map(b => b.provider_id).filter(Boolean))]
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url')
      .in('id', providerIds)
    const profileMap = {}
    profiles?.forEach(p => { profileMap[p.id] = p })
    setRequesterBookings(bookings.map(b => ({ ...b, provider: profileMap[b.provider_id] || null })))
  }

  async function fetchProviderData(uid) {
    const { data: bidsData } = await supabase
      .from('bids')
      .select('*, jobs(*)')
      .eq('provider_id', uid)
      .in('status', ['pending', 'accepted'])
      .order('created_at', { ascending: false })

    const bids = bidsData || []
    setPendingBids(bids.filter(b => b.status === 'pending' && b.jobs?.status === 'open'))
    setActiveBidJobs(bids.filter(b => b.status === 'accepted' && ['accepted', 'in_progress'].includes(b.jobs?.status)))

    const { data: bookingData } = await supabase
      .from('bookings')
      .select('*')
      .eq('provider_id', uid)
      .in('status', ['pending', 'confirmed', 'in_progress', 'awaiting_completion', 'cancellation_requested', 'cancelled'])
      .order('created_at', { ascending: false })

    const bookings = bookingData || []
    if (bookings.length === 0) {
      setPendingBookings([])
      setActiveBookings([])
      return
    }

    const serviceIds = [...new Set(bookings.map(b => b.service_id).filter(Boolean))]
    const requesterIds = [...new Set(bookings.map(b => b.requester_id).filter(Boolean))]
    const [servicesResult, profilesResult] = await Promise.all([
      supabase.from('services').select('*').in('id', serviceIds),
      supabase.from('profiles').select('id, full_name, avatar_url').in('id', requesterIds),
    ])
    const serviceMap = {}
    const profileMap = {}
    servicesResult.data?.forEach(s => { serviceMap[s.id] = s })
    profilesResult.data?.forEach(p => { profileMap[p.id] = p })

    const enriched = bookings.map(b => ({
      ...b,
      service: serviceMap[b.service_id] || null,
      requester: profileMap[b.requester_id] || null,
    }))
    setPendingBookings(enriched.filter(b => b.status === 'pending'))
    setActiveBookings(enriched.filter(b => ['confirmed', 'in_progress', 'awaiting_completion', 'cancellation_requested', 'cancelled'].includes(b.status)))

    const { data: openJobsData } = await supabase
      .from('jobs')
      .select('*')
      .eq('status', 'open')
      .neq('requester_id', uid)
      .order('created_at', { ascending: false })
      .limit(5)

    if (openJobsData?.length > 0) {
      const rIds = [...new Set(openJobsData.map(j => j.requester_id))]
      const { data: rProfiles } = await supabase
        .from('profiles').select('id, full_name, avatar_url').in('id', rIds)
      const rMap = {}
      rProfiles?.forEach(p => { rMap[p.id] = p })
      setOpenJobs(openJobsData.map(j => ({ ...j, profiles: rMap[j.requester_id] || null, bidCount: 0 })))
    } else {
      setOpenJobs([])
    }
  }

  async function confirmBooking(booking) {
    const { error } = await supabase.from('bookings').update({ status: 'confirmed' }).eq('id', booking.id)
    if (error) {
      Alert.alert('Error', error.message)
      return
    }
    await fetchProviderData(userId)
  }

  function declineBooking(booking) {
    Alert.alert('Decline booking', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Decline',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', booking.id)
          if (error) {
            Alert.alert('Error', error.message)
            return
          }
          await fetchProviderData(userId)
        },
      },
    ])
  }

  function sendBookingForConfirmation(booking) {
    if (booking._action === 'confirm_cancellation') {
      Alert.alert('Confirm cancellation', 'Confirm this service order has been cancelled?', [
        { text: 'No', style: 'cancel' },
        {
          text: 'Confirm',
          style: 'destructive',
          onPress: async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return
            const { error } = await supabase
              .from('bookings')
              .update({ status: 'cancelled' })
              .eq('id', booking.id)
              .eq('provider_id', user.id)
              .eq('status', 'cancellation_requested')
            if (error) {
              Alert.alert('Could not confirm cancellation', error.message)
              return
            }
            await fetchProviderData(userId)
          },
        },
      ])
      return
    }

    Alert.alert('Send for confirmation', 'Tell the requester this service is ready to confirm?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Send',
        onPress: async () => {
          const { data: { user } } = await supabase.auth.getUser()
          if (!user) return

          const { error } = await supabase
            .from('bookings')
            .update({ status: 'awaiting_completion' })
            .eq('id', booking.id)
            .eq('provider_id', user.id)
            .in('status', ['confirmed', 'in_progress'])

          if (error) {
            Alert.alert('Could not send for confirmation', error.message)
            return
          }
          await fetchProviderData(userId)
        },
      },
    ])
  }

  function confirmBookingComplete(booking) {
    Alert.alert('Confirm complete', 'Mark this service booking as completed?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Complete',
        onPress: async () => {
          const { error } = await supabase.from('bookings').update({ status: 'completed' }).eq('id', booking.id)
          if (error) {
            Alert.alert('Error', error.message)
            return
          }
          await fetchRequesterData(userId)
        },
      },
    ])
  }

  function cancelRequesterBooking(booking) {
    const isPendingBooking = booking.status === 'pending'
    const message = isPendingBooking
      ? 'Cancel this service order before the provider accepts it?'
      : 'Ask the provider to confirm this service order has been cancelled?'

    Alert.alert('Cancel order', message, [
      { text: 'No', style: 'cancel' },
      {
        text: isPendingBooking ? 'Cancel order' : 'Request cancellation',
        style: 'destructive',
        onPress: async () => {
          const { data: { user } } = await supabase.auth.getUser()
          if (!user) return

          const nextStatus = isPendingBooking ? 'cancelled' : 'cancellation_requested'
          const { error } = await supabase
            .from('bookings')
            .update({ status: nextStatus })
            .eq('id', booking.id)
            .eq('requester_id', user.id)

          if (error) {
            Alert.alert('Could not cancel order', error.message)
            return
          }
          await fetchRequesterData(user.id)
        },
      },
    ])
  }

  function onRefresh() {
    setRefreshing(true)
    load()
  }

  const role = profile?.primary_role || profile?.role || 'requester'
  const isRequester = role === 'requester' || role === 'both'
  const isProvider = role === 'provider' || role === 'both'
  const firstName = profile?.full_name?.split(' ')[0] || 'there'
  const initials = getInitials(profile?.full_name)

  const activePosted = postedJobs.filter(j => ['open', 'accepted', 'in_progress'].includes(j.status))
  const jobsWithBids = activePosted.filter(j => (j.bidCount || 0) > 0)
  const requesterReadyBookings = requesterBookings.filter(b => b.status === 'awaiting_completion')
  const providerAttention = pendingBids.length + pendingBookings.length
  const requesterAttention = jobsWithBids.length + requesterReadyBookings.length
  const activeWorkCount = activePosted.length + requesterBookings.length + activeBidJobs.length + activeBookings.length

  if (loading) {
    return (
      <View style={styles.screen}>
        <View style={[styles.header, { paddingTop: insets.top + 18 }]}>
          <Text style={styles.kicker}>DIFM Rural</Text>
          <Text style={styles.title}>Loading your work</Text>
        </View>
      </View>
    )
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: insets.top + 18, paddingBottom: insets.bottom + 88 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.kicker}>DIFM Rural</Text>
            <Text style={styles.title}>
              {isProvider && !isRequester ? 'Ready for work?' : 'What needs doing?'}
            </Text>
            <Text style={styles.subtitle}>
              {activeWorkCount > 0
                ? `${activeWorkCount} active item${activeWorkCount === 1 ? '' : 's'} on the go`
                : `Good to see you, ${firstName}`}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.avatarButton}
            onPress={() => navigation.getParent()?.navigate('Account')}
            accessibilityRole="button"
            accessibilityLabel="Open account">
            {profile?.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
            ) : (
              <Text style={styles.avatarText}>{initials}</Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.actionsGrid}>
          {isRequester && (
            <PrimaryAction
              title="Post a job"
              subtitle="Describe the work and get local help"
              onPress={() => navigation.navigate('PostJob')}
            />
          )}
          {isProvider && !isRequester && (
            <PrimaryAction
              title="Find jobs"
              subtitle="Browse open rural work nearby"
              onPress={() => navigation.navigate('JobFeed')}
            />
          )}
          {isProvider && (
            <PrimaryAction
              title="Advertise a service"
              subtitle="Offer your skills, gear, or delivery run"
              variant="secondary"
              onPress={() => navigation.getParent()?.navigate('Account', { screen: 'CreateService' })}
            />
          )}
          {isRequester && (
            <PrimaryAction
              title="Browse services"
              subtitle="Book advertised rural services"
              variant="secondary"
              onPress={() => navigation.getParent()?.navigate('Browse')}
            />
          )}
        </View>

        {(requesterAttention > 0 || providerAttention > 0) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Needs attention</Text>
            {jobsWithBids.map(job => (
              <AttentionRow
                key={`bid-${job.id}`}
                title={`${job.bidCount} bid${job.bidCount === 1 ? '' : 's'} to review`}
                detail={job.title}
                tone="warning"
                onPress={() => navigation.navigate('ManageTask', { job, bidCount: job.bidCount || 0 })}
              />
            ))}
            {requesterReadyBookings.map(booking => (
              <AttentionRow
                key={`ready-${booking.id}`}
                title="Service ready to confirm"
                detail={booking.service?.title || 'Service booking'}
                tone="warning"
                onPress={() => confirmBookingComplete(booking)}
              />
            ))}
            {pendingBookings.map(booking => (
              <AttentionRow
                key={`booking-${booking.id}`}
                title="New service booking"
                detail={booking.service?.title || 'Service booking'}
                tone="warning"
                onPress={() => confirmBooking(booking)}
              />
            ))}
            {pendingBids.map(bid => (
              <AttentionRow
                key={`pending-bid-${bid.id}`}
                title="Bid awaiting response"
                detail={bid.jobs?.title || 'Posted job'}
                onPress={() => navigation.navigate('JobDetail', { job: bid.jobs })}
              />
            ))}
          </View>
        )}

        {activeWorkCount === 0 ? (
          <View style={styles.section}>
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No active work yet</Text>
              <Text style={styles.emptyBody}>
                {isProvider && !isRequester
                  ? 'Find jobs or advertise a service when you are ready.'
                  : 'Post a job or browse services to get started.'}
              </Text>
            </View>
          </View>
        ) : null}

        {/* My active tasks (posted jobs) */}
        {activePosted.length > 0 && (
          <View style={styles.cardSection}>
            <View style={styles.cardSectionHeader}>
              <Text style={styles.cardSectionTitle}>My active tasks</Text>
              <TouchableOpacity onPress={() => navigation.getParent()?.navigate('Activity')} accessibilityRole="button">
                <Text style={styles.sectionLink}>See all</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              horizontal
              data={activePosted}
              keyExtractor={job => `posted-${job.id}`}
              renderItem={({ item: job }) => (
                <JobServiceCard
                  item={job}
                  showStatusBadge
                  status={job.status === 'open' ? 'open' : job.status}
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

        {/* Jobs I'm doing (provider active bids) */}
        {activeBidJobs.length > 0 && (
          <View style={styles.cardSection}>
            <View style={styles.cardSectionHeader}>
              <Text style={styles.cardSectionTitle}>Jobs I'm doing</Text>
              <TouchableOpacity onPress={() => navigation.getParent()?.navigate('Activity')} accessibilityRole="button">
                <Text style={styles.sectionLink}>See all</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              horizontal
              data={activeBidJobs}
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
          </View>
        )}

        {/* My bookings (requester service bookings) */}
        {requesterBookings.length > 0 && (
          <View style={styles.cardSection}>
            <View style={styles.cardSectionHeader}>
              <Text style={styles.cardSectionTitle}>My bookings</Text>
              <TouchableOpacity onPress={() => navigation.getParent()?.navigate('Activity')} accessibilityRole="button">
                <Text style={styles.sectionLink}>See all</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              horizontal
              data={requesterBookings}
              keyExtractor={b => `req-booking-${b.id}`}
              renderItem={({ item: booking }) => (
                <BookingWorkCard
                  booking={booking}
                  viewerRole="requester"
                  onPress={() => navigation.navigate('ServiceDetail', { service: booking.service })}
                  onConfirmComplete={() => confirmBookingComplete(booking)}
                  onCancelRequest={() => cancelRequesterBooking(booking)}
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

        {/* Provider bookings */}
        {activeBookings.length > 0 && (
          <View style={styles.cardSection}>
            <View style={styles.cardSectionHeader}>
              <Text style={styles.cardSectionTitle}>Service bookings</Text>
              <TouchableOpacity onPress={() => navigation.getParent()?.navigate('Activity')} accessibilityRole="button">
                <Text style={styles.sectionLink}>See all</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              horizontal
              data={activeBookings}
              keyExtractor={b => `prov-booking-${b.id}`}
              renderItem={({ item: booking }) => (
                <BookingWorkCard
                  booking={booking}
                  viewerRole="provider"
                  onPress={() => navigation.navigate('ServiceDetail', { service: booking.service })}
                  onConfirm={() => confirmBooking(booking)}
                  onDecline={() => declineBooking(booking)}
                  onReady={() => sendBookingForConfirmation(booking)}
                  onConfirmCancellation={() => sendBookingForConfirmation({ ...booking, _action: 'confirm_cancellation' })}
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

        {/* Available jobs — provider only */}
        {isProvider && (
          <View style={styles.cardSection}>
            <View style={styles.cardSectionHeader}>
              <Text style={styles.cardSectionTitle}>Available jobs</Text>
              <TouchableOpacity
                onPress={() => navigation.navigate('JobFeed')}
                accessibilityRole="button"
                accessibilityLabel="See all available jobs">
                <Text style={styles.sectionLink}>See all →</Text>
              </TouchableOpacity>
            </View>
            {openJobs.length > 0 ? (
              <FlatList
                horizontal
                data={openJobs}
                keyExtractor={job => `open-${job.id}`}
                renderItem={({ item: job }) => (
                  <JobServiceCard
                    item={job}
                    onPress={() => navigation.navigate('JobDetail', { job })}
                  />
                )}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.hListContent}
                ItemSeparatorComponent={() => <View style={{ width: CARD_GAP }} />}
                ListFooterComponent={
                  <TouchableOpacity
                    style={styles.seeAllCard}
                    onPress={() => navigation.navigate('JobFeed')}
                    accessibilityRole="button"
                    accessibilityLabel="Browse all jobs">
                    <Text style={styles.seeAllCardText}>Browse{'\n'}all →</Text>
                  </TouchableOpacity>
                }
                snapToInterval={SNAP_INTERVAL}
                decelerationRate="fast"
              />
            ) : (
              <View style={[styles.emptyState, { marginHorizontal: 20 }]}>
                <Text style={styles.emptyBody}>No open jobs right now. Check back soon.</Text>
                <TouchableOpacity
                  onPress={() => navigation.navigate('JobFeed')}
                  accessibilityRole="button"
                  accessibilityLabel="Browse all jobs">
                  <Text style={[styles.sectionLink, { marginTop: 10 }]}>Browse all jobs →</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    marginBottom: 22,
  },
  kicker: {
    fontSize: 11,
    fontWeight: '600',
    color: '#95d5b2',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  title: {
    fontSize: 34,
    lineHeight: 38,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: 0,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.textSecondary,
    marginTop: 8,
  },
  avatarButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  avatarText: { fontSize: 15, fontWeight: '700', color: colors.primary },
  actionsGrid: { gap: 12, marginBottom: 26 },
  actionCard: {
    borderRadius: 16,
    padding: 18,
    minHeight: 104,
    justifyContent: 'center',
  },
  primaryAction: { backgroundColor: colors.primary },
  secondaryAction: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionTitle: { fontSize: 21, fontWeight: '700', letterSpacing: 0, marginBottom: 8 },
  primaryActionText: { color: colors.white },
  secondaryActionText: { color: colors.textPrimary },
  actionSubtitle: { fontSize: 14, lineHeight: 20 },
  primaryActionSub: { color: 'rgba(255,255,255,0.82)' },
  secondaryActionSub: { color: colors.textSecondary },
  section: { marginBottom: 26 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 19,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 12,
    letterSpacing: 0,
  },
  sectionLink: { fontSize: 14, fontWeight: '700', color: colors.primary },
  cardSection: { marginBottom: 24 },
  cardSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingHorizontal: 20,
  },
  cardSectionTitle: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
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
  attentionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.white,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  attentionDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
  attentionDotWarning: { backgroundColor: colors.warning },
  attentionTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary, marginBottom: 3 },
  attentionDetail: { fontSize: 13, color: colors.textSecondary },
  attentionArrow: { fontSize: 13, fontWeight: '700', color: colors.primary },
  emptyState: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 22,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: colors.textPrimary, marginBottom: 8 },
  emptyBody: { fontSize: 14, lineHeight: 21, color: colors.textSecondary },
  workCard: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  workCardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 10,
  },
  workEyebrow: { fontSize: 12, fontWeight: '700', color: colors.primary, marginBottom: 5 },
  workTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary, lineHeight: 21 },
  workMeta: { fontSize: 13, color: colors.textSecondary, lineHeight: 20 },
  statusPill: {
    backgroundColor: colors.primaryLight,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statusPillText: { fontSize: 11, color: colors.primary, fontWeight: '700' },
  cardActions: { flexDirection: 'row', gap: 8, marginTop: 14 },
  outlineBtn: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.primary,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outlineBtnText: { fontSize: 14, fontWeight: '700', color: colors.primary },
  solidBtn: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: colors.primary,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  solidBtnText: { fontSize: 14, fontWeight: '700', color: colors.white },
  dangerBtn: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.danger,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerBtnText: { fontSize: 14, fontWeight: '700', color: colors.danger },
  seeAllCard: {
    width: 72,
    alignSelf: 'stretch',
    marginLeft: CARD_GAP,
    marginRight: 20,
    borderRadius: 12,
    backgroundColor: colors.primaryLight,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  seeAllCardText: { fontSize: 13, fontWeight: '700', color: colors.primary, textAlign: 'center' },
})
