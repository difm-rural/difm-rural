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
import { supabase } from '../lib/supabase'
import { colors } from '../theme/tokens'
import ReviewModal from '../components/ReviewModal'
import { loadReview, saveReview } from '../lib/reviews'

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
      <Text style={styles.summaryIcon}>{icon}</Text>
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
        <Text style={styles.actionEmoji}>{emoji}</Text>
      </View>
      <View style={styles.actionContent}>
        <Text style={styles.actionLabel}>{label}</Text>
        <Text style={styles.actionSubtitle}>{subtitle}</Text>
      </View>
      <Text style={styles.actionChevron}>›</Text>
    </TouchableOpacity>
  )
}

export default function ManageTaskScreen({ navigation, route }) {
  const { job: initialJob, bidCount = 0 } = route.params
  const [job, setJob] = useState(initialJob)
  const [acceptedBid, setAcceptedBid] = useState(null)
  const [loadingBid, setLoadingBid] = useState(false)
  const [currentUserId, setCurrentUserId] = useState(null)
  const [providerReview, setProviderReview] = useState(null)
  const [reviewVisible, setReviewVisible] = useState(false)
  const [savingReview, setSavingReview] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setCurrentUserId(user?.id || null))
  }, [])

  useEffect(() => {
    if (['accepted', 'in_progress', 'completed'].includes(job.status)) {
      setLoadingBid(true)
      fetchAcceptedBid()
    }
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
    switch (job.status) {
      case 'open':
        return bidCount > 0
          ? { label: `${bidCount} bid${bidCount > 1 ? 's' : ''}`, color: '#92400e', bg: '#fef3c7' }
          : { label: 'Open', color: '#166534', bg: '#dcfce7' }
      case 'accepted':
      case 'in_progress':
        return { label: 'In progress', color: '#1e40af', bg: '#dbeafe' }
      case 'completed':
        return { label: 'Completed', color: colors.textSecondary, bg: colors.border }
      case 'cancelled':
        return { label: 'Cancelled', color: '#991b1b', bg: '#fee2e2' }
      default:
        return { label: job.status, color: colors.textSecondary, bg: colors.border }
    }
  }

  const badge = getBadge()
  const budgetText = job.price_type === 'fixed' ? `$${job.price} NZD` : 'Open to bids'

  // ─── Handlers ─────────────────────────────────────────────────────
  function handleEdit() {
    navigation.navigate('PostJob', { job, mode: 'edit', bidCount })
  }

  async function handleShare() {
    try {
      const priceStr = job.price_type === 'fixed' ? `$${job.price} fixed price` : 'Open to bids'
      await Share.share({
        message: `Check out this task on DIFM Rural: ${job.title} in ${job.location_name}. ${priceStr}`,
      })
    } catch {}
  }

  function handleCancel() {
    let message = 'Are you sure you want to cancel this task?'
    if (job.status === 'open' && bidCount > 0) {
      message = `You have ${bidCount} bid${bidCount > 1 ? 's' : ''} on this task. Cancelling will notify providers their bids were unsuccessful. Continue?`
    } else if (job.status === 'accepted' || job.status === 'in_progress') {
      message = 'This job has been accepted by a provider. Are you sure you want to cancel? The provider will be notified.'
    }
    Alert.alert('Cancel task', message, [
      { text: 'No', style: 'cancel' },
      {
        text: 'Yes, cancel',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('jobs').update({ status: 'cancelled' }).eq('id', job.id)
          navigation.goBack()
        },
      },
    ])
  }

  function handleDelete() {
    Alert.alert('Delete task', 'Are you sure? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('jobs').delete().eq('id', job.id)
          navigation.goBack()
        },
      },
    ])
  }

  function handleReviewBids() {
    navigation.navigate('JobDetail', { job })
  }

  function handleLeaveReview() {
    setReviewVisible(true)
  }

  function handlePayProvider() {
    Alert.alert('Coming soon', 'Provider payment will be available here in a future release.')
  }

  async function handleSubmitReview({ rating, comment }) {
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
    navigation.navigate('Chat', {
      jobId: job.id,
      jobTitle: job.title,
      otherUserId: acceptedBid.providerId,
      otherUserName: acceptedBid.providerName,
    })
  }

  function handleConfirmComplete() {
    Alert.alert(
      'Confirm complete',
      'Mark this task as complete? This confirms the work is done.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            const { error } = await supabase.from('jobs').update({ status: 'completed' }).eq('id', job.id)
            if (error) {
              Alert.alert('Error', error.message)
              return
            }
            setJob(prev => ({ ...prev, status: 'completed' }))
          },
        },
      ]
    )
  }

  function handleRepost() {
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
    <View style={styles.header}>
      <TouchableOpacity
        style={styles.backBtn}
        onPress={() => navigation.goBack()}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityRole="button"
        accessibilityLabel="Go back">
        <Text style={styles.backBtnText}>← Back</Text>
      </TouchableOpacity>
      <Text style={styles.headerTitle} accessibilityRole="header">Manage task</Text>
      <Text style={styles.headerSubtitle} numberOfLines={2}>{job.title}</Text>
    </View>
  )

  // ─────────────────────────────────────────────────────────────────
  //  ACCEPTED / IN-PROGRESS LAYOUT
  // ─────────────────────────────────────────────────────────────────
  const isInProgress = job.status === 'accepted' || job.status === 'in_progress'

  if (isInProgress) {
    const providerFirstName = acceptedBid?.providerName?.split(' ')[0] || 'Provider'
    const initials = getInitials(acceptedBid?.providerName)

    return (
      <View style={styles.screen}>
        {headerJSX}

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}>

          {/* Task overview */}
          <View style={styles.card}>
            <View style={styles.acceptedHeaderRow}>
              <Text style={styles.acceptedJobTitle} numberOfLines={3}>{job.title}</Text>
              <View style={styles.greenBadge}>
                <Text style={styles.greenBadgeText}>Accepted ✓</Text>
              </View>
            </View>
            <SummaryRow icon="📍" label="Location" value={job.location_name} />
            <SummaryRow icon="💰" label="Budget"   value={budgetText} />
            <SummaryRow icon="🏷️" label="Category" value={job.category} last />
          </View>

          {/* Assigned provider */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Assigned provider</Text>
            {loadingBid ? (
              <Text style={styles.loadingText}>Loading…</Text>
            ) : acceptedBid ? (
              <>
                <View style={styles.providerRow}>
                  {acceptedBid.avatarUrl ? (
                    <Image source={{ uri: acceptedBid.avatarUrl }} style={styles.providerAvatar} />
                  ) : (
                    <View style={styles.providerAvatarFallback}>
                      <Text style={styles.providerAvatarInitials}>{initials}</Text>
                    </View>
                  )}
                  <View style={styles.providerInfo}>
                    <Text style={styles.providerName}>{acceptedBid.providerName}</Text>
                    <Text style={styles.providerMeta}>★ 0.0 · New provider</Text>
                  </View>
                </View>
                <View style={styles.infoBox}>
                  <Text style={styles.infoBoxText}>
                    Bid accepted · ${acceptedBid.bidAmount} NZD · Contact {providerFirstName} to confirm start time
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
              accessibilityLabel={`Chat with ${providerFirstName}`}>
              <Text style={styles.chatBannerIcon}>💬</Text>
              <View style={styles.chatBannerContent}>
                <Text style={styles.chatBannerTitle}>Chat with {providerFirstName}</Text>
                <Text style={styles.chatBannerSubtitle}>Discuss job details and start time</Text>
              </View>
              <Text style={styles.chatBannerArrow}>›</Text>
            </TouchableOpacity>
          ) : null}

          {/* Actions */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Actions</Text>
            <View style={styles.actionBtns}>
              <TouchableOpacity
                style={styles.btnGreen}
                onPress={handleConfirmComplete}
                accessibilityRole="button"
                accessibilityLabel="Confirm job complete">
                <Text style={styles.btnGreenText}>✓ Confirm job complete</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.btnDangerOutline}
                onPress={handleCancel}
                accessibilityRole="button"
                accessibilityLabel="Cancel task">
                <Text style={styles.btnDangerOutlineText}>Cancel task</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Task details */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Task details</Text>
            <SummaryRow icon="🏷️" label="Category" value={job.category} />
            <SummaryRow icon="📍" label="Location"  value={job.location_name} />
            <SummaryRow icon="💰" label="Budget"    value={budgetText} />
            {acceptedBid?.bidAmount ? (
              <SummaryRow icon="🤝" label="Agreed" value={`$${acceptedBid.bidAmount} NZD`} />
            ) : null}
            <SummaryRow icon="📅" label="Posted" value={timeAgo(job.created_at)} last />
          </View>

        </ScrollView>
      </View>
    )
  }

  // ─────────────────────────────────────────────────────────────────
  //  OPEN / COMPLETED / CANCELLED LAYOUT (existing)
  // ─────────────────────────────────────────────────────────────────
  const showReviewBids = job.status === 'open' && bidCount > 0
  const showEdit       = job.status === 'open'
  const showCancel     = ['open', 'accepted', 'in_progress'].includes(job.status)
  const showDelete     = (job.status === 'open' && bidCount === 0) || job.status === 'cancelled'
  const showRepost     = job.status === 'completed' || job.status === 'cancelled'
  const showCompletedActions = job.status === 'completed'

  const actionItems = [
    showCompletedActions && {
      key: 'reviewProvider',
      emoji: '⭐',
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
      emoji: '💳',
      iconBg: colors.infoLight,
      label: 'Pay provider',
      subtitle: acceptedBid?.bidAmount
        ? `Future payment option for $${acceptedBid.bidAmount} NZD`
        : 'Future payment option',
      onPress: handlePayProvider,
    },
    showReviewBids && {
      key: 'reviewBids',
      emoji: '🏷️',
      iconBg: '#fef3c7',
      label: 'Review bids',
      subtitle: `${bidCount} bid${bidCount > 1 ? 's' : ''} waiting for your review`,
      onPress: handleReviewBids,
    },
    showEdit && {
      key: 'edit',
      emoji: '✏️',
      iconBg: colors.primaryLight,
      label: 'Edit task details',
      subtitle: 'Update title, description, budget or schedule',
      onPress: handleEdit,
    },
    {
      key: 'share',
      emoji: '📤',
      iconBg: colors.infoLight,
      label: 'Share task',
      subtitle: 'Send to someone who might help',
      onPress: handleShare,
    },
    showRepost && {
      key: 'repost',
      emoji: '♻️',
      iconBg: colors.primaryLight,
      label: 'Repost task',
      subtitle: 'Create a new listing based on this task',
      onPress: handleRepost,
    },
    showCancel && {
      key: 'cancel',
      emoji: '🚫',
      iconBg: colors.warningLight,
      label: 'Cancel task',
      subtitle: 'Close task, notify bidding providers',
      onPress: handleCancel,
    },
    showDelete && {
      key: 'delete',
      emoji: '🗑️',
      iconBg: colors.dangerLight,
      label: 'Delete task',
      subtitle: 'Permanently remove this task',
      onPress: handleDelete,
    },
  ].filter(Boolean)

  return (
    <View style={styles.screen}>
      {headerJSX}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>

        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>Task summary</Text>
            <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
              <Text style={[styles.statusBadgeText, { color: badge.color }]}>{badge.label}</Text>
            </View>
          </View>
          <SummaryRow icon="🏷️" label="Category" value={job.category} />
          <SummaryRow icon="📍" label="Location"  value={job.location_name} />
          <SummaryRow icon="💰" label="Budget"    value={budgetText} />
          <SummaryRow icon="📅" label="Posted"    value={timeAgo(job.created_at)} last />
        </View>

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

  // ─── Header ────────────────────────────────────────────────────
  header: {
    backgroundColor: colors.primary,
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  backBtn: {
    marginBottom: 12,
    minHeight: 44,
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  backBtnText: { color: 'rgba(255,255,255,0.85)', fontSize: 16, fontWeight: '600' },
  headerTitle: { fontSize: 22, fontWeight: 'bold', color: colors.white, marginBottom: 6 },
  headerSubtitle: { fontSize: 14, color: 'rgba(255,255,255,0.7)', fontWeight: '500', lineHeight: 20 },

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
})
