import React, { useEffect, useState } from 'react'
import {
  Alert,
  Image,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../lib/supabase'
import { isJobActive, isJobAwarded, jobStatusLabel } from '../lib/lifecycle'
import { confirmJobComplete, cancelJob, deleteJob, acceptBid as apiAcceptBid } from '../lib/jobActions'
import { colors } from '../theme/tokens'
import ReviewModal from '../components/ReviewModal'
import CancelModal from '../components/CancelModal'
import Icon from '../components/Icon'
import { loadReview, saveReview } from '../lib/reviews'
import { fetchProviderStats } from '../lib/providerStats'

function timeAgo(isoString) {
  if (!isoString) return 'Unknown'
  const diffDays = Math.floor((Date.now() - new Date(isoString)) / 86400000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  return `${diffDays} days ago`
}

function getInitials(name) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0][0].toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function SummaryRow({ icon, label, value, last }) {
  return (
    <View style={[styles.summaryRow, !last && styles.summaryRowBorder]}>
      <Icon name={icon} size={16} color={colors.textMuted} style={styles.summaryIcon} />
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue} numberOfLines={2}>{value}</Text>
    </View>
  )
}

function ActionRow({ emoji, iconBg, label, subtitle, onPress, last }) {
  return (
    <TouchableOpacity
      style={[styles.actionRow, !last && styles.actionRowBorder]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={label}>
      <View style={[styles.actionIconCircle, { backgroundColor: iconBg }]}>
        <Icon name={emoji} size={20} color={colors.textSecondary} />
      </View>
      <View style={styles.actionContent}>
        <Text style={styles.actionLabel}>{label}</Text>
        <Text style={styles.actionSubtitle}>{subtitle}</Text>
      </View>
      <Icon name="chevron-forward" size={18} color={colors.textMuted} />
    </TouchableOpacity>
  )
}

export default function ManageTaskScreen({ navigation, route }) {
  const insets = useSafeAreaInsets()
  const { job: initialJob, bidCount = 0 } = route.params
  const [job, setJob] = useState(initialJob)
  const [acceptedBid, setAcceptedBid] = useState(null)
  const [requesterProfile, setRequesterProfile] = useState(null)
  const [loadingBid, setLoadingBid] = useState(false)
  const [bids, setBids] = useState([])
  const [loadingBids, setLoadingBids] = useState(false)
  const [currentUserId, setCurrentUserId] = useState(null)
  const [providerReview, setProviderReview] = useState(null)
  const [reviewVisible, setReviewVisible] = useState(false)
  const [savingReview, setSavingReview] = useState(false)
  const [authChecked, setAuthChecked] = useState(false)
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [questionCount, setQuestionCount] = useState(0)

  useEffect(() => {
    async function loadCurrentUserAndJob() {
      const { data: { user } } = await supabase.auth.getUser()
      setCurrentUserId(user?.id || null)
      setAuthChecked(true)
      const { data: latestJob } = await supabase
        .from('jobs')
        .select('*')
        .eq('id', initialJob.id)
        .single()
      if (latestJob) setJob(latestJob)
    }
    loadCurrentUserAndJob()
  }, [initialJob.id])

  useEffect(() => {
    async function fetchRequesterProfile() {
      if (!job.requester_id) return
      const { data } = await supabase
        .from('profiles')
        .select('full_name, avatar_url')
        .eq('id', job.requester_id)
        .single()
      setRequesterProfile(data || null)
    }
    fetchRequesterProfile()
  }, [job.requester_id])

  useEffect(() => {
    if (isJobAwarded(job.status) || job.status === 'completed') {
      setLoadingBid(true)
      fetchAcceptedBid()
    }
    if (job.status === 'open') { fetchBids(); fetchQuestionCount() }
  }, [job.id, job.status])

  useEffect(() => {
    if (job.status !== 'completed' || !currentUserId) return
    fetchProviderReview()
  }, [job.id, job.status, currentUserId])

  async function fetchAcceptedBid() {
    const { data: bidData } = await supabase
      .from('bids')
      .select('provider_id, amount')
      .eq('job_id', job.id)
      .eq('status', 'accepted')
      .single()
    if (bidData) {
      const { data: provProfile } = await supabase
        .from('profiles')
        .select('full_name, avatar_url')
        .eq('id', bidData.provider_id)
        .single()
      setAcceptedBid({
        providerId: bidData.provider_id,
        providerName: provProfile?.full_name || 'Provider',
        avatarUrl: provProfile?.avatar_url || null,
        bidAmount: bidData.amount,
      })
    }
    setLoadingBid(false)
  }

  async function fetchBids() {
    setLoadingBids(true)
    try {
      const { data: bidsData, error } = await supabase
        .from('bids')
        .select('id, provider_id, amount, status, message, created_at, line_items, available_from, estimated_duration')
        .eq('job_id', job.id)
        .not('status', 'eq', 'rejected')
        .order('amount', { ascending: true })
      if (error) throw error

      const providerIds = [...new Set(bidsData?.map(b => b.provider_id).filter(Boolean) || [])]
      const [{ data: providerProfiles }, stats] = await Promise.all([
        providerIds.length > 0
          ? supabase.from('profiles').select('id, full_name, avatar_url').in('id', providerIds)
          : Promise.resolve({ data: [] }),
        fetchProviderStats(providerIds),
      ])

      const bidsWithProfiles = bidsData?.map(bid => ({
        ...bid,
        provider: providerProfiles?.find(p => p.id === bid.provider_id) || null,
        stats: stats[bid.provider_id] || { ratingAvg: 0, ratingCount: 0, jobsDone: 0 },
      })) || []

      setBids(bidsWithProfiles)
    } catch (error) {
      console.log('Error fetching bids:', error)
    } finally {
      setLoadingBids(false)
    }
  }

  async function acceptBid(bid) {
    const provName = bid.provider?.full_name || 'this provider'
    Alert.alert(
      'Accept offer?',
      `Accept ${provName}'s offer of $${bid.amount} NZD? All other offers will be declined.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Accept',
          onPress: async () => {
            const { error } = await apiAcceptBid(job, bid)
            if (error) { Alert.alert('Error', error.message); return }
            Alert.alert('Offer accepted!', `${provName} has been notified.`, [
              { text: 'OK', onPress: () => setJob(prev => ({ ...prev, status: 'accepted' })) },
            ])
          },
        },
      ]
    )
  }

  async function fetchQuestionCount() {
    try {
      const { count } = await supabase
        .from('job_questions')
        .select('id', { count: 'exact', head: true })
        .eq('job_id', job.id)
      setQuestionCount(count || 0)
    } catch { /* table may not exist yet */ }
  }

  async function fetchProviderReview() {
    try {
      const review = await loadReview({
        jobId: job.id,
        reviewerId: currentUserId,
        reviewerRole: 'requester',
      })
      setProviderReview(review)
    } catch {
      // If reviews is not provisioned yet, the submit path will show the user-facing error.
    }
  }

  // ─── Badge (used for non-accepted layout) ─────────────────────────
  function getBadge() {
    const label = jobStatusLabel(job.status, bidCount)
    switch (job.status) {
      case 'open':
        return bidCount > 0
          ? { label, color: '#92400e', bg: '#fef3c7' }
          : { label, color: '#166534', bg: '#dcfce7' }
      case 'accepted':
      case 'in_progress':
        return { label, color: '#1e40af', bg: '#dbeafe' }
      case 'awaiting_completion':
        return { label, color: '#92400e', bg: '#fef3c7' }
      case 'completed':
        return { label, color: colors.textSecondary, bg: colors.border }
      case 'cancelled':
        return { label, color: '#991b1b', bg: '#fee2e2' }
      default:
        return { label, color: colors.textSecondary, bg: colors.border }
    }
  }

  const cancelModalType = isJobAwarded(job.status) ? 'job_accepted' : 'job_open'
  const cancelModalJSX = (
    <CancelModal
      visible={showCancelModal}
      onClose={() => setShowCancelModal(false)}
      onConfirm={async (reason, note) => {
        const { error } = await cancelJob(job.id, currentUserId, { reason, note })
        if (error) { Alert.alert('Something went wrong', error.message || 'Please try again'); return }
        setShowCancelModal(false)
        navigation.goBack()
      }}
      title="Cancel job"
      subtitle={job.title}
      type={cancelModalType}
      bidCount={bidCount}
      providerName={acceptedBid?.providerName}
    />
  )

  const badge = getBadge()
  const budgetText = job.price_type === 'fixed' ? `$${job.price} NZD` : 'Open to offers'
  const isTaskOwner = !!currentUserId && job.requester_id === currentUserId
  const isAcceptedProvider = !!currentUserId && !!acceptedBid?.providerId && acceptedBid.providerId === currentUserId
  const isAwarded = isJobAwarded(job.status)

  function ensureTaskOwner() {
    if (isTaskOwner) return true
    Alert.alert('Not available', 'Only the requester who posted this job can manage or edit it.')
    return false
  }

  // ─── Handlers ─────────────────────────────────────────────────────
  function handleEdit() {
    if (!ensureTaskOwner()) return
    navigation.navigate('PostJob', { job, mode: 'edit', bidCount })
  }

  async function handleShare() {
    try {
      const priceStr = job.price_type === 'fixed' ? `$${job.price} fixed price` : 'Open to offers'
      await Share.share({
        message: `Check out this job on Rural Connections: ${job.title} in ${job.location_name}. ${priceStr}`,
      })
    } catch {}
  }

  function handleCancel() {
    if (!ensureTaskOwner()) return
    setShowCancelModal(true)
  }

  function handleDelete() {
    if (!ensureTaskOwner()) return
    Alert.alert('Delete job', 'Are you sure? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const { error } = await deleteJob(job.id, currentUserId)
          if (error) { Alert.alert('Something went wrong', error.message || 'Please try again', [{ text: 'OK' }]); return }
          navigation.goBack()
        },
      },
    ])
  }

  function handleReviewBids() {
    if (!ensureTaskOwner()) return
    navigation.navigate('JobDetail', { job })
  }

  function handleViewQuestions() {
    if (!ensureTaskOwner()) return
    navigation.navigate('JobDetail', { job })
  }

  function handleLeaveReview() {
    if (!ensureTaskOwner()) return
    setReviewVisible(true)
  }

  function handlePayProvider() {
    if (!ensureTaskOwner()) return
    Alert.alert('Coming soon', 'Provider payment will be available here in a future release.')
  }

  async function handleSubmitReview({ rating, comment }) {
    if (!ensureTaskOwner()) return
    if (!currentUserId || !acceptedBid?.providerId) return
    setSavingReview(true)
    try {
      const review = await saveReview({
        jobId: job.id,
        reviewerId: currentUserId,
        revieweeId: acceptedBid.providerId,
        reviewerRole: 'requester',
        revieweeRole: 'provider',
        rating,
        comment,
      })
      setProviderReview(review)
      setReviewVisible(false)
      Alert.alert('Review saved', 'Thanks for leaving feedback.')
    } catch (error) {
      Alert.alert('Could not save review', error.message)
    } finally {
      setSavingReview(false)
    }
  }

  function handleChat() {
    if (!acceptedBid) return
    const otherUserId = isAcceptedProvider ? job.requester_id : acceptedBid.providerId
    const otherUserName = isAcceptedProvider
      ? (requesterProfile?.full_name || 'Requester')
      : acceptedBid.providerName
    navigation.navigate('Chat', {
      jobId: job.id,
      jobTitle: job.title,
      otherUserId,
      otherUserName,
    })
  }

  function handleConfirmComplete() {
    if (!ensureTaskOwner()) return
    Alert.alert(
      'Confirm complete',
      'Mark this job as complete? This confirms the work is done.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            const { error } = await confirmJobComplete(job.id, currentUserId)
            if (error) {
              Alert.alert('Error', error.message)
              return
            }
            setJob(prev => ({ ...prev, status: 'completed' }))
            if (acceptedBid?.providerId) {
              setReviewVisible(true)
            } else {
              Alert.alert('Job completed', 'This job has been marked complete.')
            }
          },
        },
      ]
    )
  }

  function handleRepost() {
    if (!ensureTaskOwner()) return
    navigation.navigate('PostJob', {
      prefill: {
        title: job.title,
        category: job.category,
        locationName: job.location_name,
        description: job.description,
        priceType: job.price_type,
        price: job.price ? String(job.price) : '',
      },
    })
  }

  // ─── Shared header JSX ────────────────────────────────────────────
  const headerJSX = (
    <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
      <TouchableOpacity
        style={[styles.backBtn, styles.backBtnRow]}
        onPress={() => navigation.goBack()}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityRole="button"
        accessibilityLabel="Go back">
        <Icon name="chevron-back" size={18} color={colors.primary} />
        <Text style={styles.backBtnText}>Back</Text>
      </TouchableOpacity>
      <Text style={styles.kicker}>Job</Text>
      <Text style={styles.headerTitle} accessibilityRole="header">Manage job</Text>
      <Text style={styles.headerSubtitle} numberOfLines={2}>{job.title}</Text>
    </View>
  )

  if (!authChecked) {
    return (
      <View style={styles.screen}>
        {headerJSX}
        <View style={styles.center}>
          <Text style={styles.loadingText}>Loading job...</Text>
        </View>
      </View>
    )
  }

  if (currentUserId && !isTaskOwner && !isAcceptedProvider && !(isAwarded && (loadingBid || !acceptedBid))) {
    return (
      <View style={styles.screen}>
        {headerJSX}
        <View style={[styles.scrollContent, { flex: 1 }]}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>View only</Text>
            <Text style={styles.accessBody}>
              This job was posted by another requester, so it cannot be edited or managed from your account.
            </Text>
            <TouchableOpacity
              style={styles.viewJobBtn}
              onPress={() => navigation.replace('JobDetail', { job })}
              accessibilityRole="button"
              accessibilityLabel="View job details">
              <Text style={styles.viewJobBtnText}>View job details</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.viewProfileBtn}
              onPress={() => navigation.navigate('RequesterProfile', { requesterId: job.requester_id })}
              accessibilityRole="button"
              accessibilityLabel="View requester profile">
              <Text style={styles.viewProfileBtnText}>View requester profile</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    )
  }

  // ─────────────────────────────────────────────────────────────────
  //  ACCEPTED / IN-PROGRESS LAYOUT
  // ─────────────────────────────────────────────────────────────────
  if (isAwarded) {
    const otherPartyName = isAcceptedProvider
      ? (requesterProfile?.full_name || 'Requester')
      : (acceptedBid?.providerName || 'Provider')
    const otherPartyFirstName = otherPartyName.split(' ')[0] || (isAcceptedProvider ? 'Requester' : 'Provider')
    const otherPartyAvatar = isAcceptedProvider ? requesterProfile?.avatar_url : acceptedBid?.avatarUrl
    const otherPartyInitials = getInitials(otherPartyName)
    const otherPartyRouteName = isAcceptedProvider ? 'RequesterProfile' : 'ProviderProfile'
    const otherPartyRouteParams = isAcceptedProvider
      ? { requesterId: job.requester_id }
      : { providerId: acceptedBid?.providerId }
    const otherPartyRoleLabel = isAcceptedProvider ? 'Requester' : 'Assigned provider'

    return (
      <View style={styles.screen}>
        {headerJSX}

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 112 }]}
          showsVerticalScrollIndicator={false}>

          {/* Job overview */}
          <View style={styles.card}>
            <View style={styles.acceptedHeaderRow}>
              <Text style={styles.acceptedJobTitle} numberOfLines={3}>{job.title}</Text>
              <View style={styles.greenBadge}>
                <Text style={styles.greenBadgeText}>{jobStatusLabel(job.status, bidCount)}</Text>
              </View>
            </View>
            <SummaryRow icon="location-outline" label="Location" value={job.location_name} />
            <SummaryRow icon="cash-outline" label="Budget"   value={budgetText} />
            <SummaryRow icon="pricetag-outline" label="Category" value={job.category} last />
          </View>

          {/* Job participant */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{otherPartyRoleLabel}</Text>
            {loadingBid ? (
              <Text style={styles.loadingText}>Loading…</Text>
            ) : acceptedBid ? (
              <>
                <TouchableOpacity
                  style={styles.providerRow}
                  onPress={() => navigation.navigate(otherPartyRouteName, otherPartyRouteParams)}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityLabel={`View ${otherPartyName}'s profile`}>
                  {otherPartyAvatar ? (
                    <Image source={{ uri: otherPartyAvatar }} style={styles.providerAvatar} />
                  ) : (
                    <View style={styles.providerAvatarFallback}>
                      <Text style={styles.providerAvatarInitials}>{otherPartyInitials}</Text>
                    </View>
                  )}
                  <View style={styles.providerInfo}>
                    <Text style={styles.providerName}>{otherPartyName}</Text>
                    <Text style={styles.providerMeta}>{isAcceptedProvider ? 'Requester' : 'Provider'}</Text>
                  </View>
                  <Icon name="chevron-forward" size={18} color={colors.textMuted} />
                </TouchableOpacity>
                <View style={styles.infoBox}>
                  <Text style={styles.infoBoxText}>
                    Awarded · ${acceptedBid.bidAmount} NZD · Use chat with {otherPartyFirstName} to confirm timing and details
                  </Text>
                </View>
              </>
            ) : null}
          </View>

          {/* Chat banner */}
          {acceptedBid ? (
            <TouchableOpacity
              style={styles.chatBanner}
              onPress={handleChat}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={`Chat with ${otherPartyFirstName}`}>
              <Icon name="chatbubble-ellipses-outline" size={26} color={colors.white} style={styles.chatBannerIcon} />
              <View style={styles.chatBannerContent}>
                <Text style={styles.chatBannerTitle}>Chat with {otherPartyFirstName}</Text>
                <Text style={styles.chatBannerSubtitle}>Discuss job details and start time</Text>
              </View>
              <Icon name="chevron-forward" size={24} color="rgba(255,255,255,0.7)" />
            </TouchableOpacity>
          ) : null}

          {/* Actions */}
          {isTaskOwner && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Actions</Text>
            {job.status === 'awaiting_completion' && (
              <View style={styles.infoBox}>
                <Text style={styles.infoBoxText}>
                  {otherPartyFirstName} has marked this job as done. Confirm to finalise and leave a review.
                </Text>
              </View>
            )}
            <View style={styles.actionBtns}>
              <TouchableOpacity
                style={styles.btnGreen}
                onPress={handleConfirmComplete}
                accessibilityRole="button"
                accessibilityLabel="Confirm job complete">
                <Text style={styles.btnGreenText}>Confirm job complete</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.btnDangerOutline}
                onPress={handleCancel}
                accessibilityRole="button"
                accessibilityLabel="Cancel job">
                <Text style={styles.btnDangerOutlineText}>Cancel job</Text>
              </TouchableOpacity>
            </View>
          </View>
          )}

          {/* Job details */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Job details</Text>
            <SummaryRow icon="pricetag-outline" label="Category" value={job.category} />
            <SummaryRow icon="location-outline" label="Location"  value={job.location_name} />
            <SummaryRow icon="cash-outline" label="Budget"    value={budgetText} />
            {acceptedBid?.bidAmount ? (
              <SummaryRow icon="checkmark-circle-outline" label="Agreed" value={`$${acceptedBid.bidAmount} NZD`} />
            ) : null}
            <SummaryRow icon="calendar-outline" label="Posted" value={timeAgo(job.created_at)} last />
          </View>

        </ScrollView>
        {cancelModalJSX}
      </View>
    )
  }

  // ─────────────────────────────────────────────────────────────────
  //  OPEN / COMPLETED / CANCELLED LAYOUT (existing)
  // ─────────────────────────────────────────────────────────────────
  const showReviewBids = job.status === 'open' && bidCount > 0
  const showQuestions  = job.status === 'open' && questionCount > 0
  const showEdit       = job.status === 'open'
  const showCancel     = isJobActive(job.status)
  const showDelete     = (job.status === 'open' && bidCount === 0) || job.status === 'cancelled'
  const showRepost     = job.status === 'completed' || job.status === 'cancelled'
  const showCompletedActions = job.status === 'completed'

  const actionItems = [
    showCompletedActions && {
      key: 'reviewProvider',
      emoji: 'star-outline',
      iconBg: colors.primaryLight,
      label: providerReview ? 'Edit provider review' : 'Review provider',
      subtitle: acceptedBid
        ? providerReview
          ? `${providerReview.rating}/5 stars for ${acceptedBid.providerName}`
          : `Rate ${acceptedBid.providerName} and leave feedback`
        : 'Rate the provider and leave feedback',
      onPress: handleLeaveReview,
    },
    showCompletedActions && {
      key: 'payProvider',
      emoji: 'card-outline',
      iconBg: colors.infoLight,
      label: 'Pay provider',
      subtitle: acceptedBid?.bidAmount
        ? `Future payment option for $${acceptedBid.bidAmount} NZD`
        : 'Future payment option',
      onPress: handlePayProvider,
    },
    showReviewBids && {
      key: 'reviewBids',
      emoji: 'pricetag-outline',
      iconBg: '#fef3c7',
      label: 'Review offers',
      subtitle: `${bidCount} offer${bidCount > 1 ? 's' : ''} waiting for your review`,
      onPress: handleReviewBids,
    },
    showQuestions && {
      key: 'questions',
      emoji: 'help-circle-outline',
      iconBg: colors.infoLight,
      label: `Questions (${questionCount})`,
      subtitle: 'View and answer questions from providers',
      onPress: handleViewQuestions,
    },
    showEdit && {
      key: 'edit',
      emoji: 'create-outline',
      iconBg: colors.primaryLight,
      label: 'Edit job details',
      subtitle: 'Update title, description, budget or schedule',
      onPress: handleEdit,
    },
    {
      key: 'share',
      emoji: 'share-social-outline',
      iconBg: colors.infoLight,
      label: 'Share job',
      subtitle: 'Send to someone who might help',
      onPress: handleShare,
    },
    showRepost && {
      key: 'repost',
      emoji: 'refresh-outline',
      iconBg: colors.primaryLight,
      label: 'Repost job',
      subtitle: 'Create a new listing based on this job',
      onPress: handleRepost,
    },
    showCancel && {
      key: 'cancel',
      emoji: 'close-circle-outline',
      iconBg: colors.warningLight,
      label: 'Cancel job',
      subtitle: 'Close job, notify interested providers',
      onPress: handleCancel,
    },
    showDelete && {
      key: 'delete',
      emoji: 'trash-outline',
      iconBg: colors.dangerLight,
      label: 'Delete job',
      subtitle: 'Permanently remove this job',
      onPress: handleDelete,
    },
  ].filter(Boolean)

  return (
    <View style={styles.screen}>
      {headerJSX}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 112 }]}
        showsVerticalScrollIndicator={false}>

        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>Job summary</Text>
            <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
              <Text style={[styles.statusBadgeText, { color: badge.color }]}>{badge.label}</Text>
            </View>
          </View>
          <SummaryRow icon="pricetag-outline" label="Category" value={job.category} />
          <SummaryRow icon="location-outline" label="Location"  value={job.location_name} />
          <SummaryRow icon="cash-outline" label="Budget"    value={budgetText} />
          <SummaryRow icon="calendar-outline" label="Posted"    value={timeAgo(job.created_at)} last />
        </View>

        {/* Offers received — inline on open jobs */}
        {job.status === 'open' && (
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.cardTitle}>Offers received</Text>
              {bids.length > 0 && (
                <View style={[styles.statusBadge, { backgroundColor: '#fef3c7' }]}>
                  <Text style={[styles.statusBadgeText, { color: '#92400e' }]}>
                    {bids.length} bid{bids.length > 1 ? 's' : ''}
                  </Text>
                </View>
              )}
            </View>
            {loadingBids ? (
              <Text style={styles.loadingText}>Loading offers…</Text>
            ) : bids.length === 0 ? (
              <Text style={styles.noBidsText}>No offers yet — check back soon</Text>
            ) : (
              bids.map((bid, idx) => {
                const provName = bid.provider?.full_name || 'Provider'
                const initials = getInitials(provName)
                return (
                  <View key={bid.id} style={[styles.bidCard, idx < bids.length - 1 && styles.bidCardBorder]}>
                    <TouchableOpacity
                      style={styles.bidHeader}
                      onPress={() => navigation.navigate('ProviderProfile', { providerId: bid.provider_id })}
                      accessibilityRole="button"
                      accessibilityLabel={`View ${provName}'s profile`}>
                      {bid.provider?.avatar_url ? (
                        <Image source={{ uri: bid.provider.avatar_url }} style={styles.bidAvatar} />
                      ) : (
                        <View style={styles.bidAvatarFallback}>
                          <Text style={styles.bidAvatarInitials}>{initials}</Text>
                        </View>
                      )}
                      <View style={styles.bidProviderInfo}>
                        <Text style={styles.bidProviderName}>{provName}</Text>
                        <Text style={styles.bidProviderMeta} numberOfLines={1}>
                          {bid.stats?.ratingCount > 0
                            ? `★ ${bid.stats.ratingAvg.toFixed(1)} (${bid.stats.ratingCount})`
                            : 'New provider'}
                          {bid.stats?.jobsDone > 0 ? ` · ${bid.stats.jobsDone} done` : ''}
                        </Text>
                        <Text style={styles.bidAmount}>${bid.amount} NZD</Text>
                      </View>
                    </TouchableOpacity>
                    {bid.line_items?.length > 1 && (
                      <View style={styles.lineItemsBreakdown}>
                        {bid.line_items.map((li, i) => (
                          <View key={i} style={styles.breakdownRow}>
                            <Text style={styles.breakdownLabel}>{li.label}</Text>
                            <Text style={styles.breakdownAmount}>${(li.amount || 0).toFixed(2)}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                    {!!bid.message && (
                      <Text style={styles.bidMessage}>{bid.message}</Text>
                    )}
                    {!!bid.available_from && (
                      <View style={styles.bidMetaRow}>
                        <Icon name="calendar-outline" size={13} color={colors.textMuted} />
                        <Text style={styles.bidMeta}>Available from: {new Date(bid.available_from).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
                      </View>
                    )}
                    {!!bid.estimated_duration && (
                      <View style={styles.bidMetaRow}>
                        <Icon name="time-outline" size={13} color={colors.textMuted} />
                        <Text style={styles.bidMeta}>Est. duration: {bid.estimated_duration}</Text>
                      </View>
                    )}
                    <TouchableOpacity
                      style={styles.acceptBidBtn}
                      onPress={() => acceptBid(bid)}
                      accessibilityRole="button"
                      accessibilityLabel={`Accept offer from ${provName}`}>
                      <Text style={styles.acceptBidBtnText}>Accept offer</Text>
                    </TouchableOpacity>
                  </View>
                )
              })
            )}
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Actions</Text>
          {actionItems.map((item, idx) => (
            <ActionRow
              key={item.key}
              emoji={item.emoji}
              iconBg={item.iconBg}
              label={item.label}
              subtitle={item.subtitle}
              onPress={item.onPress}
              last={idx === actionItems.length - 1}
            />
          ))}
        </View>

      </ScrollView>
      {cancelModalJSX}
      <ReviewModal
        visible={reviewVisible}
        title={providerReview ? 'Edit provider review' : 'Review provider'}
        subtitle={acceptedBid ? `How was working with ${acceptedBid.providerName}?` : 'How was this provider?'}
        initialRating={providerReview?.rating || 0}
        initialComment={providerReview?.comment || ''}
        saving={savingReview}
        onClose={() => setReviewVisible(false)}
        onSubmit={handleSubmitReview}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },

  // ─── Header ────────────────────────────────────────────────────
  header: {
    backgroundColor: colors.background,
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  backBtn: {
    marginBottom: 12,
    minHeight: 36,
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  backBtnText: { color: colors.primary, fontSize: 15, fontWeight: '600' },
  backBtnRow:  { flexDirection: 'row', alignItems: 'center' },
  kicker: { fontSize: 13, fontWeight: '700', color: colors.accent, marginBottom: 8 },
  headerTitle: { fontSize: 34, lineHeight: 38, fontWeight: '700', color: colors.textPrimary },
  headerSubtitle: { fontSize: 15, lineHeight: 22, color: colors.textSecondary, marginTop: 8 },

  // ─── Scroll ────────────────────────────────────────────────────
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 48 },

  // ─── Cards ─────────────────────────────────────────────────────
  card: {
    backgroundColor: colors.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    marginBottom: 16,
    paddingTop: 16,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  accessBody: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 21,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  viewJobBtn: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    minHeight: 48,
    marginHorizontal: 16,
    marginBottom: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewJobBtnText: { color: colors.white, fontSize: 15, fontWeight: '700' },
  viewProfileBtn: {
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: 10,
    minHeight: 48,
    marginHorizontal: 16,
    marginBottom: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewProfileBtnText: { color: colors.primary, fontSize: 15, fontWeight: '700' },

  // ─── Status badge ───────────────────────────────────────────────
  statusBadge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  statusBadgeText: { fontSize: 13, fontWeight: '700' },

  // ─── Summary rows ───────────────────────────────────────────────
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 44,
    gap: 12,
  },
  summaryRowBorder: { borderBottomWidth: 1, borderBottomColor: '#f2f2f2' },
  summaryIcon:  { fontSize: 16, width: 22, textAlign: 'center' },
  summaryLabel: { fontSize: 14, fontWeight: '600', color: colors.textMuted, width: 72, flexShrink: 0 },
  summaryValue: { fontSize: 14, color: colors.textPrimary, fontWeight: '500', flex: 1, textAlign: 'right' },

  // ─── Action rows ────────────────────────────────────────────────
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 64,
    gap: 14,
  },
  actionRowBorder: { borderBottomWidth: 1, borderBottomColor: '#f2f2f2' },
  actionIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  actionEmoji:    { fontSize: 18 },
  actionContent:  { flex: 1 },
  actionLabel:    { fontSize: 15, fontWeight: '700', color: colors.textPrimary, marginBottom: 2 },
  actionSubtitle: { fontSize: 13, color: colors.textMuted, lineHeight: 18 },
  actionChevron:  { fontSize: 22, color: colors.textMuted, fontWeight: '300' },

  // ─── Accepted layout ────────────────────────────────────────────
  acceptedHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f2f2f2',
    gap: 12,
  },
  acceptedJobTitle: { flex: 1, fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  greenBadge: {
    backgroundColor: colors.primaryLight,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    flexShrink: 0,
  },
  greenBadgeText: { fontSize: 13, fontWeight: '700', color: colors.primary },

  // ─── Provider card ──────────────────────────────────────────────
  providerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f2f2f2',
    gap: 14,
  },
  providerAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  providerAvatarFallback: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.primaryLight,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  providerAvatarInitials: { fontSize: 18, fontWeight: '700', color: colors.primary },
  providerInfo: { flex: 1 },
  providerName: { fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginBottom: 3 },
  providerMeta: { fontSize: 13, color: colors.textMuted },
  loadingText:  { fontSize: 14, color: colors.textMuted, paddingHorizontal: 16, paddingBottom: 16 },

  // ─── Info box ───────────────────────────────────────────────────
  infoBox: {
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 16,
    backgroundColor: colors.primaryLight,
    borderRadius: 10,
    padding: 14,
  },
  infoBoxText: { fontSize: 14, color: colors.primary, lineHeight: 20 },

  // ─── Chat banner ────────────────────────────────────────────────
  chatBanner: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 18,
    paddingHorizontal: 18,
    minHeight: 72,
  },
  chatBannerIcon:     { fontSize: 26, marginRight: 14 },
  chatBannerContent:  { flex: 1 },
  chatBannerTitle:    { fontSize: 16, fontWeight: '700', color: colors.white, marginBottom: 2 },
  chatBannerSubtitle: { fontSize: 13, color: 'rgba(255,255,255,0.8)' },
  chatBannerArrow:    { fontSize: 30, color: 'rgba(255,255,255,0.7)', fontWeight: '300', marginLeft: 8 },

  // ─── Action buttons (accepted layout) ───────────────────────────
  actionBtns: { paddingHorizontal: 16, paddingBottom: 16, gap: 10 },
  btnGreen: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    minHeight: 52,
    justifyContent: 'center',
  },
  btnGreenText: { color: colors.white, fontSize: 16, fontWeight: '700' },
  btnDangerOutline: {
    borderWidth: 1.5,
    borderColor: colors.danger,
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    minHeight: 52,
    justifyContent: 'center',
  },
  btnDangerOutlineText: { color: colors.danger, fontSize: 16, fontWeight: '700' },

  // ─── Bids list ──────────────────────────────────────────────────
  noBidsText: { fontSize: 14, color: colors.textMuted, paddingHorizontal: 16, paddingBottom: 16, lineHeight: 22 },
  bidCard: { paddingHorizontal: 16, paddingVertical: 14 },
  bidCardBorder: { borderBottomWidth: 1, borderBottomColor: '#f2f2f2' },
  bidHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  bidAvatar: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, borderColor: colors.primary },
  bidAvatarFallback: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primaryLight,
    borderWidth: 1.5,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bidAvatarInitials: { fontSize: 15, fontWeight: '700', color: colors.primary },
  bidProviderInfo: { flex: 1 },
  bidProviderName: { fontSize: 15, fontWeight: '700', color: colors.textPrimary, marginBottom: 2 },
  bidProviderMeta: { fontSize: 12, color: colors.textMuted, marginBottom: 2 },
  bidAmount: { fontSize: 17, fontWeight: 'bold', color: colors.primary },
  bidMessage: { fontSize: 14, color: colors.textSecondary, lineHeight: 20, marginBottom: 8, fontStyle: 'italic' },
  bidMeta:    { fontSize: 13, color: colors.textMuted },
  bidMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 },
  lineItemsBreakdown: { marginVertical: 6, paddingVertical: 6, borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#e8e8e8', marginBottom: 8 },
  breakdownRow:    { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  breakdownLabel:  { fontSize: 13, color: colors.textSecondary },
  breakdownAmount: { fontSize: 13, color: colors.textPrimary, fontWeight: '600' },
  acceptBidBtn: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  acceptBidBtnText: { color: colors.white, fontSize: 14, fontWeight: '700' },
})
