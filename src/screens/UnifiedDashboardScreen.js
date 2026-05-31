import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  Alert,
  Animated,
  Easing,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { supabase } from '../lib/supabase'
import { colors } from '../theme/tokens'
import { removeFromWatchlist } from '../lib/watchlist'
import JobCard from '../components/JobCard'

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function formatDate(isoString) {
  if (!isoString) return ''
  const d = new Date(isoString)
  return d.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' })
}

function daysAgoText(isoString) {
  const days = Math.floor((Date.now() - new Date(isoString)) / 86400000)
  if (days === 0) return 'today'
  if (days === 1) return '1 day ago'
  return `${days} days ago`
}

function providerCompletionSeenKey(userId) {
  return `difm:provider-completed-review-seen:${userId}`
}

// ─── Requester booking card ───────────────────────────────────────────────────

function RequesterBookingCard({ booking, navigation, onRefresh }) {
  const service = booking.services || {}
  const provider = booking.providerProfile || {}

  const statusLabel = {
    pending:     'Pending confirmation',
    confirmed:   'Confirmed',
    in_progress: 'In progress',
    awaiting_completion: 'Ready to confirm',
    completed:   'Completed',
  }[booking.status] || booking.status

  const unitLabel = service.pricing_type === 'hourly' ? 'hr'
    : service.pricing_type === 'day_rate' ? 'day'
    : (service.unit_label || 'unit')

  async function handleConfirmComplete() {
    Alert.alert(
      'Confirm service complete?',
      'This will mark the booking as completed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm complete',
          onPress: async () => {
            const { error } = await supabase
              .from('bookings')
              .update({ status: 'completed' })
              .eq('id', booking.id)
            if (error) { Alert.alert('Error', error.message); return }
            onRefresh?.()
          },
        },
      ]
    )
  }

  return (
    <View style={styles.bookingCard}>
      <View style={styles.bookingCardHeader}>
        <Text style={styles.bookingCardTitle} numberOfLines={2}>
          {service.title || 'Service booking'}
        </Text>
        <View style={styles.bookingBadge}>
          <Text style={styles.bookingBadgeText}>Booked ✓</Text>
        </View>
      </View>

      <View style={styles.bookingMetaRow}>
        {provider.full_name ? <Text style={styles.bookingMeta}>👤 {provider.full_name}</Text> : null}
        {service.location_name ? <Text style={styles.bookingMeta}>📍 {service.location_name}</Text> : null}
      </View>

      <View style={styles.bookingMetaRow}>
        <Text style={styles.bookingMeta}>
          ${booking.total_amount} NZD · {booking.payment_timing === 'upfront' ? 'Upfront' : 'On completion'}
        </Text>
        {booking.quantity && service.pricing_type !== 'fixed' ? (
          <Text style={styles.bookingMeta}>
            {booking.quantity} {unitLabel}{booking.quantity !== 1 ? 's' : ''}
          </Text>
        ) : null}
      </View>

      <View style={[
        styles.bookingStatusBox,
        booking.status === 'confirmed' && styles.bookingStatusBoxConfirmed,
        booking.status === 'in_progress' && styles.bookingStatusBoxInProgress,
        booking.status === 'awaiting_completion' && styles.bookingStatusBoxInProgress,
      ]}>
        <Text style={[
          styles.bookingStatusText,
          booking.status === 'confirmed' && styles.bookingStatusTextConfirmed,
          booking.status === 'in_progress' && styles.bookingStatusTextInProgress,
          booking.status === 'awaiting_completion' && styles.bookingStatusTextInProgress,
        ]}>
          {statusLabel}
        </Text>
      </View>

      {booking.status === 'awaiting_completion' ? (
        <View style={styles.pBtnRow}>
          <TouchableOpacity
            style={styles.pBtnSecondary}
            onPress={() => navigation.navigate('ServiceDetail', {
              service: { ...service, profile: provider },
            })}
            accessibilityRole="button"
            accessibilityLabel="View booking details">
            <Text style={styles.pBtnSecondaryText}>View booking →</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.pBtnPrimary}
            onPress={handleConfirmComplete}
            accessibilityRole="button"
            accessibilityLabel="Confirm service complete">
            <Text style={styles.pBtnPrimaryText}>Confirm complete →</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.pBtnRow}>
          <TouchableOpacity
            style={styles.pBtnPrimary}
            onPress={() => navigation.navigate('ServiceDetail', {
              service: { ...service, profile: provider },
            })}
            accessibilityRole="button"
            accessibilityLabel="View booking details">
            <Text style={styles.pBtnPrimaryText}>View booking →</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  )
}

// ─── Provider booking card (pending — confirm/decline) ────────────────────────

function ProviderPendingBookingCard({ booking, onConfirm, onDecline }) {
  const service = booking.service || {}
  const requester = booking.requester || {}

  const unitLabel = service.pricing_type === 'hourly' ? 'hr'
    : service.pricing_type === 'day_rate' ? 'day'
    : (service.unit_label || 'unit')

  function scheduledLabel(val) {
    if (!val) return null
    if (val === 'asap') return '⚡ As soon as possible'
    if (val === 'flexible') return '🤙 Flexible timing'
    return `📅 ${val}`
  }

  function handleDecline() {
    Alert.alert(
      'Decline booking?',
      'The requester will be notified.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Decline', style: 'destructive', onPress: () => onDecline(booking) },
      ]
    )
  }

  return (
    <View style={styles.pCard}>
      <View style={styles.pCardHeader}>
        <Text style={styles.pCardTitle} numberOfLines={2}>{service.title || 'Service booking'}</Text>
        <View style={styles.pBadgeAmber}>
          <Text style={styles.pBadgeAmberText}>New booking!</Text>
        </View>
      </View>

      <View style={styles.pMetaRow}>
        {requester.full_name ? <Text style={styles.pMeta}>👤 {requester.full_name}</Text> : null}
        {booking.location_name ? <Text style={styles.pMeta}>📍 {booking.location_name}</Text> : null}
      </View>

      <View style={styles.pMetaRow}>
        {booking.quantity && service.pricing_type !== 'fixed' ? (
          <Text style={styles.pMeta}>{booking.quantity} {unitLabel}{booking.quantity !== 1 ? 's' : ''}</Text>
        ) : null}
        <Text style={styles.pMeta}>${booking.total_amount} NZD</Text>
        <Text style={styles.pMeta}>{booking.payment_timing === 'upfront' ? 'Upfront' : 'On completion'}</Text>
      </View>

      {scheduledLabel(booking.scheduled_date) ? (
        <Text style={[styles.pMeta, { marginBottom: 10 }]}>{scheduledLabel(booking.scheduled_date)}</Text>
      ) : null}

      {booking.notes ? (
        <View style={styles.pInfoBox}>
          <Text style={styles.pInfoBoxText}>Note: "{booking.notes}"</Text>
        </View>
      ) : null}

      <View style={styles.pBtnRow}>
        <TouchableOpacity
          style={styles.pBtnDecline}
          onPress={handleDecline}
          accessibilityRole="button"
          accessibilityLabel="Decline booking">
          <Text style={styles.pBtnDeclineText}>Decline</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.pBtnPrimary}
          onPress={() => onConfirm(booking)}
          accessibilityRole="button"
          accessibilityLabel="Confirm booking">
          <Text style={styles.pBtnPrimaryText}>Confirm booking →</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

// ─── Provider booking card (active — in progress / complete) ──────────────────

function ProviderActiveBookingCard({ booking, navigation, onStatusUpdate }) {
  const service = booking.service || {}
  const requester = booking.requester || {}
  const isInProgress = booking.status === 'in_progress'
  const isAwaitingCompletion = booking.status === 'awaiting_completion'

  function scheduledLabel(val) {
    if (!val) return null
    if (val === 'asap') return '⚡ As soon as possible'
    if (val === 'flexible') return '🤙 Flexible timing'
    return `📅 ${val}`
  }

  async function handleMarkStarted() {
    const { error } = await supabase
      .from('bookings').update({ status: 'in_progress' }).eq('id', booking.id)
    if (error) { Alert.alert('Error', error.message); return }
    onStatusUpdate?.()
  }

  function handleComplete() {
    Alert.alert(
      'Complete service?',
      'This will notify the requester to confirm completion.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Complete service',
          onPress: async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            const { error } = await supabase
              .from('bookings')
              .update({ status: 'awaiting_completion' })
              .eq('id', booking.id)
              .eq('provider_id', user.id)
              .in('status', ['confirmed', 'in_progress'])
            if (error) { Alert.alert('Could not send for confirmation', error.message); return }
            Alert.alert('Done!', 'The requester has been notified to confirm the service is complete.')
            onStatusUpdate?.()
          },
        },
      ]
    )
  }

  return (
    <View style={[styles.pCard, styles.pCardAccepted]}>
      <View style={styles.pCardHeader}>
        <Text style={styles.pCardTitle} numberOfLines={2}>{service.title || 'Service booking'}</Text>
        {isAwaitingCompletion ? (
          <View style={styles.pBadgeBlue}>
            <Text style={styles.pBadgeBlueText}>Awaiting confirmation</Text>
          </View>
        ) : isInProgress ? (
          <View style={styles.pBadgeBlue}>
            <Text style={styles.pBadgeBlueText}>In progress</Text>
          </View>
        ) : (
          <View style={styles.pBadgeGreen}>
            <Text style={styles.pBadgeGreenText}>Confirmed</Text>
          </View>
        )}
      </View>

      <View style={styles.pMetaRow}>
        {requester.full_name ? <Text style={styles.pMeta}>👤 {requester.full_name}</Text> : null}
        {booking.location_name ? <Text style={styles.pMeta}>📍 {booking.location_name}</Text> : null}
        <Text style={styles.pMeta}>${booking.total_amount} NZD</Text>
      </View>

      {scheduledLabel(booking.scheduled_date) ? (
        <Text style={[styles.pMeta, { marginBottom: 8 }]}>{scheduledLabel(booking.scheduled_date)}</Text>
      ) : null}

      <View style={[
        styles.pInfoBox,
        booking.payment_timing !== 'upfront' && styles.pInfoBoxAmber,
      ]}>
        <Text style={[
          styles.pInfoBoxText,
          booking.payment_timing !== 'upfront' && styles.pInfoBoxAmberText,
        ]}>
          {booking.payment_timing === 'upfront' ? 'Payment received upfront' : 'Payment on completion'}
        </Text>
      </View>

      <View style={styles.pBtnRow}>
        {isAwaitingCompletion ? (
          <TouchableOpacity
            style={styles.pBtnPrimary}
            onPress={() => navigation.navigate('ServiceDetail', { service })}
            accessibilityRole="button"
            accessibilityLabel="View service booking">
            <Text style={styles.pBtnPrimaryText}>View booking →</Text>
          </TouchableOpacity>
        ) : isInProgress ? (
          <TouchableOpacity
            style={styles.pBtnPrimary}
            onPress={handleComplete}
            accessibilityRole="button"
            accessibilityLabel="Complete service">
            <Text style={styles.pBtnPrimaryText}>Complete service →</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.pBtnPrimary}
            onPress={handleMarkStarted}
            accessibilityRole="button"
            accessibilityLabel="Mark as started">
            <Text style={styles.pBtnPrimaryText}>Mark as started →</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  )
}

function ProviderCompletedBookingCard({ booking, navigation }) {
  const service = booking.service || {}
  const requester = booking.requester || {}

  return (
    <View style={styles.pCard}>
      <View style={styles.pCardHeader}>
        <Text style={styles.pCardTitle} numberOfLines={2}>{service.title || 'Service booking'}</Text>
        <View style={styles.pBadgeGreen}>
          <Text style={styles.pBadgeGreenText}>Completed</Text>
        </View>
      </View>
      <View style={styles.pMetaRow}>
        {requester.full_name ? <Text style={styles.pMeta}>👤 {requester.full_name}</Text> : null}
        {booking.location_name ? <Text style={styles.pMeta}>📍 {booking.location_name}</Text> : null}
        <Text style={styles.pMeta}>${booking.total_amount} NZD</Text>
      </View>
      <View style={styles.pInfoBox}>
        <Text style={styles.pInfoBoxText}>This service booking has been confirmed complete.</Text>
      </View>
      <TouchableOpacity
        style={styles.pBtnPrimary}
        onPress={() => navigation.navigate('ServiceDetail', { service })}
        accessibilityRole="button"
        accessibilityLabel="View completed service">
        <Text style={styles.pBtnPrimaryText}>View service →</Text>
      </TouchableOpacity>
    </View>
  )
}

// ─── Provider card components ─────────────────────────────────────────────────

function BidPendingCard({ bid, onWithdraw, navigation }) {
  const { job, amount, created_at } = bid
  if (!job) return null
  const total = job.totalBidCount || 0

  let infoText
  if (total <= 1) infoText = 'Only bid so far — good chance!'
  else if (total <= 3) infoText = `Submitted ${daysAgoText(created_at)} · Requester reviewing bids`
  else infoText = `${total} bids submitted — competitive task`

  return (
    <View style={styles.pCard}>
      <View style={styles.pCardHeader}>
        <Text style={styles.pCardTitle} numberOfLines={2}>{job.title}</Text>
        <View style={styles.pBadgeAmber}>
          <Text style={styles.pBadgeAmberText}>Your bid: ${amount} NZD</Text>
        </View>
      </View>
      <View style={styles.pMetaRow}>
        <Text style={styles.pMeta}>📍 {job.location_name}</Text>
        <Text style={styles.pMeta}>{job.category}</Text>
        <Text style={styles.pMeta}>{total} bid{total !== 1 ? 's' : ''} total</Text>
      </View>
      <View style={styles.pInfoBoxAmber}>
        <Text style={styles.pInfoBoxAmberText}>{infoText}</Text>
      </View>
      <View style={styles.pBtnRow}>
        <TouchableOpacity
          style={styles.pBtnWithdraw}
          onPress={() => onWithdraw(bid)}
          accessibilityRole="button"
          accessibilityLabel="Withdraw bid">
          <Text style={styles.pBtnWithdrawText}>Withdraw</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.pBtnPrimary}
          onPress={() => navigation.navigate('JobDetail', { job })}
          accessibilityRole="button"
          accessibilityLabel="View job details">
          <Text style={styles.pBtnPrimaryText}>View job →</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

function BidAcceptedCard({ bid, navigation }) {
  const { job } = bid
  if (!job) return null
  return (
    <View style={[styles.pCard, styles.pCardAccepted]}>
      <View style={styles.pCardHeader}>
        <Text style={styles.pCardTitle} numberOfLines={2}>{job.title}</Text>
        <View style={styles.pBadgeGreen}>
          <Text style={styles.pBadgeGreenText}>Awarded</Text>
        </View>
      </View>
      <View style={styles.pMetaRow}>
        <Text style={styles.pMeta}>📍 {job.location_name}</Text>
        <Text style={styles.pMeta}>{job.category}</Text>
        {job.price_type === 'fixed'
          ? <Text style={styles.pMeta}>${job.price} NZD</Text>
          : <Text style={styles.pMeta}>Open to bids</Text>}
      </View>
      <View style={styles.pInfoBox}>
        <Text style={styles.pInfoBoxText}>Your bid was accepted. Use chat to confirm timing and details.</Text>
      </View>
      <View style={styles.pBtnRow}>
        <TouchableOpacity
          style={styles.pBtnSecondary}
          onPress={() => navigation.navigate('Chat', {
            jobId: job.id,
            jobTitle: job.title,
            otherUserId: job.requester_id,
            otherUserName: job.profiles?.full_name || 'Requester',
          })}
          accessibilityRole="button"
          accessibilityLabel="Chat with requester">
          <Text style={styles.pBtnSecondaryText}>💬 Chat</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.pBtnPrimary}
          onPress={() => navigation.navigate('JobDetail', { job })}
          accessibilityRole="button"
          accessibilityLabel="View job details">
          <Text style={styles.pBtnPrimaryText}>View details →</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

function ActiveJobInProgressCard({ job, lastMessage, navigation }) {
  if (!job) return null
  const firstName = job.profiles?.full_name?.split(' ')[0] || 'Requester'
  const preview = lastMessage
    ? `💬 ${firstName}: ${lastMessage.length > 60 ? lastMessage.slice(0, 60) + '…' : lastMessage}`
    : null
  return (
    <View style={styles.pCard}>
      <View style={styles.pCardHeader}>
        <Text style={styles.pCardTitle} numberOfLines={2}>{job.title}</Text>
        <View style={styles.pBadgeBlue}>
          <Text style={styles.pBadgeBlueText}>Awarded</Text>
        </View>
      </View>
      <View style={styles.pMetaRow}>
        <Text style={styles.pMeta}>📍 {job.location_name}</Text>
        {job.price_type === 'fixed'
          ? <Text style={styles.pMeta}>${job.price} NZD</Text>
          : <Text style={styles.pMeta}>Open to bids</Text>}
        {job.scheduled_date
          ? <Text style={styles.pMeta}>📅 {formatDate(job.scheduled_date)}</Text>
          : null}
      </View>
      {preview ? (
        <View style={styles.pChatPreview}>
          <Text style={styles.pChatPreviewText} numberOfLines={2}>{preview}</Text>
        </View>
      ) : null}
      <View style={styles.pBtnRow}>
        <TouchableOpacity
          style={styles.pBtnSecondary}
          onPress={() => navigation.navigate('Chat', {
            jobId: job.id,
            jobTitle: job.title,
            otherUserId: job.requester_id,
            otherUserName: job.profiles?.full_name || 'Requester',
          })}
          accessibilityRole="button"
          accessibilityLabel="Chat with requester">
          <Text style={styles.pBtnSecondaryText}>💬 Chat</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.pBtnPrimary}
          onPress={() => navigation.navigate('JobDetail', { job })}
          accessibilityRole="button"
          accessibilityLabel="View job details">
          <Text style={styles.pBtnPrimaryText}>View details →</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

function ActiveJobNotStartedCard({ job, bid, navigation }) {
  if (!job) return null
  const agoText = daysAgoText(bid?.updated_at || job.updated_at)
  return (
    <View style={styles.pCard}>
      <View style={styles.pCardHeader}>
        <Text style={styles.pCardTitle} numberOfLines={2}>{job.title}</Text>
        <View style={styles.pBadgeGreen}>
          <Text style={styles.pBadgeGreenText}>Awarded</Text>
        </View>
      </View>
      <View style={styles.pMetaRow}>
        <Text style={styles.pMeta}>📍 {job.location_name}</Text>
        {job.price_type === 'fixed'
          ? <Text style={styles.pMeta}>${job.price} NZD</Text>
          : <Text style={styles.pMeta}>Open to bids</Text>}
        {job.scheduled_date
          ? <Text style={styles.pMeta}>📅 {formatDate(job.scheduled_date)}</Text>
          : null}
      </View>
      <View style={styles.pInfoBox}>
        <Text style={styles.pInfoBoxText}>
          Awarded {agoText} · Use chat to confirm timing and details
        </Text>
      </View>
      <View style={styles.pBtnRow}>
        <TouchableOpacity
          style={styles.pBtnSecondary}
          onPress={() => navigation.navigate('Chat', {
            jobId: job.id,
            jobTitle: job.title,
            otherUserId: job.requester_id,
            otherUserName: job.profiles?.full_name || 'Requester',
          })}
          accessibilityRole="button"
          accessibilityLabel="Chat with requester">
          <Text style={styles.pBtnSecondaryText}>💬 Chat</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.pBtnPrimary}
          onPress={() => navigation.navigate('JobDetail', { job })}
          accessibilityRole="button"
          accessibilityLabel="View job details">
          <Text style={styles.pBtnPrimaryText}>View details →</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

function CompletedProviderJobCard({ job, bid, navigation }) {
  if (!job) return null
  const requesterName = job.profiles?.full_name || 'Requester'
  return (
    <View style={styles.pCard}>
      <View style={styles.pCardHeader}>
        <Text style={styles.pCardTitle} numberOfLines={2}>{job.title}</Text>
        <View style={styles.pBadgeGreen}>
          <Text style={styles.pBadgeGreenText}>Completed</Text>
        </View>
      </View>
      <View style={styles.pMetaRow}>
        <Text style={styles.pMeta}>📍 {job.location_name}</Text>
        <Text style={styles.pMeta}>{job.category}</Text>
        {bid?.amount ? <Text style={styles.pMeta}>${bid.amount} NZD</Text> : null}
      </View>
      <View style={styles.pInfoBox}>
        <Text style={styles.pInfoBoxText}>Rate {requesterName} and keep your work history up to date.</Text>
      </View>
      <TouchableOpacity
        style={styles.pBtnPrimary}
        onPress={() => navigation.navigate('JobDetail', { job })}
        accessibilityRole="button"
        accessibilityLabel="Rate requester">
        <Text style={styles.pBtnPrimaryText}>Rate requester →</Text>
      </TouchableOpacity>
    </View>
  )
}

function WatchlistCard({ watchItem, onUnwatch, navigation }) {
  const { job, bidCount } = watchItem
  const isUnavailable = job?.status !== 'open'
  if (!job) return null

  let infoBox = null
  if (!isUnavailable) {
    if (bidCount === 0) {
      infoBox = (
        <View style={styles.pInfoBox}>
          <Text style={styles.pInfoBoxText}>No bids yet — be the first!</Text>
        </View>
      )
    } else if (bidCount <= 2) {
      infoBox = (
        <View style={styles.pInfoBoxAmber}>
          <Text style={styles.pInfoBoxAmberText}>
            {bidCount} bid{bidCount !== 1 ? 's' : ''} submitted so far
          </Text>
        </View>
      )
    } else {
      infoBox = (
        <View style={styles.pInfoBoxAmber}>
          <Text style={styles.pInfoBoxAmberText}>Competitive — {bidCount} bids submitted</Text>
        </View>
      )
    }
  }

  return (
    <View style={[styles.pCard, isUnavailable && styles.pCardUnavailable]}>
      <View style={styles.pCardHeader}>
        <Text style={[styles.pCardTitle, isUnavailable && styles.pTextMuted]} numberOfLines={2}>
          {job.title}
        </Text>
        {isUnavailable ? (
          <View style={styles.pBadgeGray}>
            <Text style={styles.pBadgeGrayText}>No longer available</Text>
          </View>
        ) : (
          <View style={styles.pBadgeAmber}>
            <Text style={styles.pBadgeAmberText}>
              {bidCount > 0 ? `${bidCount} bid${bidCount !== 1 ? 's' : ''}` : 'Open'}
            </Text>
          </View>
        )}
      </View>
      {!isUnavailable && (
        <View style={styles.pMetaRow}>
          <Text style={styles.pMeta}>{job.category}</Text>
          <Text style={styles.pMeta}>📍 {job.location_name}</Text>
          {job.price_type === 'fixed'
            ? <Text style={styles.pMeta}>${job.price} NZD</Text>
            : <Text style={styles.pMeta}>Open to bids</Text>}
        </View>
      )}
      {infoBox}
      <View style={styles.pBtnRow}>
        <TouchableOpacity
          style={styles.pBtnUnwatch}
          onPress={() => onUnwatch(watchItem.jobId)}
          accessibilityRole="button"
          accessibilityLabel="Remove from watchlist">
          <Text style={styles.pBtnUnwatchText}>Unwatch</Text>
        </TouchableOpacity>
        {!isUnavailable && (
          <TouchableOpacity
            style={styles.pBtnPrimary}
            onPress={() => navigation.navigate('JobDetail', { job })}
            accessibilityRole="button"
            accessibilityLabel="Place a bid on this job">
            <Text style={styles.pBtnPrimaryText}>Place bid →</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  )
}

// ─── Animated counter ─────────────────────────────────────────────────────────

function CountUpText({ target, style }) {
  const [display, setDisplay] = useState(0)
  const progress = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const id = progress.addListener(({ value }) => setDisplay(Math.round(value)))
    progress.setValue(0)
    Animated.timing(progress, {
      toValue: target,
      duration: 600,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start()
    return () => {
      progress.removeListener(id)
      progress.stopAnimation()
    }
  }, [target])

  return <Text style={style}>{display}</Text>
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function UnifiedDashboardScreen({ navigation, route }) {
  const insets = useSafeAreaInsets()
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [userId, setUserId] = useState(null)
  const [fullName, setFullName] = useState('')
  const [primaryRole, setPrimaryRole] = useState('requester')

  // Requester data
  const [postedJobs, setPostedJobs] = useState([])
  const [newBidsTotal, setNewBidsTotal] = useState(0)
  const [myBookings, setMyBookings] = useState([])

  // Provider — Tab 1: Bids pending
  const [pendingBids, setPendingBids] = useState([])
  const [awardedBids, setAwardedBids] = useState([])

  // Provider — Tab 2: Active jobs
  const [inProgressBids, setInProgressBids] = useState([])
  const [completedProviderBids, setCompletedProviderBids] = useState([])

  // Provider — Tab 3: Watchlist
  const [watchlistItems, setWatchlistItems] = useState([])

  // Provider service bookings
  const [pendingBookings, setPendingBookings] = useState([])
  const [activeServiceBookings, setActiveServiceBookings] = useState([])
  const [completedServiceBookings, setCompletedServiceBookings] = useState([])

  // Notification banner
  const [newBookingBanner, setNewBookingBanner] = useState(null)
  const bannerAnim = useRef(new Animated.Value(-80)).current

  const [lastMessages, setLastMessages] = useState({})
  const [requesterTab, setRequesterTab] = useState('active')
  const [providerTab, setProviderTab] = useState('bidspending')
  const [showProviderCompletedJobs, setShowProviderCompletedJobs] = useState(false)

  // Shared (REQUESTER + BOTH modes)
  const [myBids, setMyBids] = useState([])
  const completionAlertOpenRef = useRef(false)

  useFocusEffect(useCallback(() => { fetchData() }, []))

  useEffect(() => {
    if (!newBookingBanner) return
    const timer = setTimeout(() => {
      Animated.timing(bannerAnim, { toValue: -80, duration: 250, useNativeDriver: true })
        .start(() => setNewBookingBanner(null))
    }, 5000)
    return () => clearTimeout(timer)
  }, [newBookingBanner])

  useEffect(() => {
    if (primaryRole !== 'provider' || !userId) return undefined

    const channel = supabase
      .channel(`provider-completion-alerts-${userId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'jobs' }, payload => {
        if (payload.new?.status === 'completed') notifyCompletedProviderJobs(userId)
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'reviews' }, payload => {
        if (payload.new?.reviewee_id === userId && payload.new?.reviewer_role === 'requester') {
          notifyCompletedProviderJobs(userId)
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'reviews' }, payload => {
        if (payload.new?.reviewee_id === userId && payload.new?.reviewer_role === 'requester') {
          notifyCompletedProviderJobs(userId)
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [primaryRole, userId])

  useEffect(() => {
    if (route?.params?.guestPosted) {
      navigation.setParams({ guestPosted: false })
      navigation.navigate('MyJobs')
    }
    if (route?.params?.guestBookingPosted) {
      navigation.setParams({ guestBookingPosted: false })
      setRequesterTab('active')
      fetchData()
    }
  }, [route?.params?.guestPosted, route?.params?.guestBookingPosted])

  async function fetchData() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)

      const { data: profileData } = await supabase
        .from('profiles')
        .select('full_name, primary_role, role')
        .eq('id', user.id)
        .single()

      const role = profileData?.primary_role || profileData?.role || 'requester'
      setPrimaryRole(role)
      setFullName(profileData?.full_name?.split(' ')[0] || '')

      if (role === 'provider') {
        const [, , , pendingProviderBookings] = await Promise.all([
          fetchPostedJobs(user.id),
          fetchProviderData(user.id),
          fetchWatchlistData(user.id),
          fetchProviderBookings(user.id),
        ])
        await notifyCompletedProviderJobs(user.id)
        await checkNewBookingBanner(user.id, pendingProviderBookings || [])
      } else {
        await Promise.all([
          fetchPostedJobs(user.id),
          fetchMyBidsSimple(user.id),
          fetchMyBookings(user.id),
        ])
      }
    } catch {
      // silently skip
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  async function fetchPostedJobs(uid) {
    const { data: jobsData } = await supabase
      .from('jobs')
      .select('*')
      .eq('requester_id', uid)
      .order('created_at', { ascending: false })

    const rawJobs = jobsData || []
    if (rawJobs.length === 0) { setPostedJobs([]); setNewBidsTotal(0); return }

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

    setNewBidsTotal(Object.values(bidCountMap).reduce((s, c) => s + c, 0))
    setPostedJobs(rawJobs.map(job => ({
      ...job,
      profiles: profileData || null,
      bidCount: bidCountMap[job.id] || 0,
    })))
  }

  async function fetchMyBidsSimple(uid) {
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

  async function fetchMyBookings(uid) {
    const { data: bookingsData } = await supabase
      .from('bookings')
      .select('*, services(*)')
      .eq('requester_id', uid)
      .in('status', ['pending', 'confirmed', 'in_progress', 'awaiting_completion', 'completed'])
      .order('created_at', { ascending: false })

    const bookings = bookingsData || []
    if (bookings.length === 0) { setMyBookings([]); return }

    const providerIds = [...new Set(bookings.map(b => b.provider_id).filter(Boolean))]
    const { data: profilesData } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url')
      .in('id', providerIds)

    const profileMap = {}
    profilesData?.forEach(p => { profileMap[p.id] = p })

    setMyBookings(bookings.map(b => ({
      ...b,
      providerProfile: profileMap[b.provider_id] || null,
    })))
  }

  async function fetchProviderData(uid) {
    const { data: allBidsData } = await supabase
      .from('bids')
      .select('*')
      .eq('provider_id', uid)
      .in('status', ['pending', 'accepted'])
      .order('created_at', { ascending: false })

    const allBids = allBidsData || []
    if (allBids.length === 0) {
      setPendingBids([])
      setAwardedBids([])
      setInProgressBids([])
      setCompletedProviderBids([])
      return
    }

    const jobIds = [...new Set(allBids.map(b => b.job_id))]

    const [jobsRes, bidCountsRes] = await Promise.all([
      supabase.from('jobs').select('*').in('id', jobIds),
      supabase.from('bids').select('job_id').in('job_id', jobIds),
    ])

    const jobList = jobsRes.data || []
    const bidCountMap = {}
    bidCountsRes.data?.forEach(b => { bidCountMap[b.job_id] = (bidCountMap[b.job_id] || 0) + 1 })

    const requesterIds = [...new Set(jobList.map(j => j.requester_id).filter(Boolean))]
    const { data: profilesData } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url')
      .in('id', requesterIds)

    const jobMap = {}
    jobList.forEach(j => {
      jobMap[j.id] = {
        ...j,
        profiles: profilesData?.find(p => p.id === j.requester_id) || null,
        totalBidCount: bidCountMap[j.id] || 0,
      }
    })

    const enrichedBids = allBids.map(bid => ({ ...bid, job: jobMap[bid.job_id] || null }))

    const pending = enrichedBids.filter(b => b.status === 'pending')
    const accepted = enrichedBids.filter(b => b.status === 'accepted')
    const acceptedNotStarted = accepted.filter(b => b.job?.status === 'accepted')
    const inProgress = accepted.filter(b => b.job?.status === 'in_progress')
    const completed = accepted.filter(b => b.job?.status === 'completed')

    setPendingBids(pending)
    setAwardedBids(acceptedNotStarted)
    setInProgressBids(inProgress)
    setCompletedProviderBids(completed)

    if (inProgress.length > 0) {
      await fetchLastMessages(inProgress.map(b => b.job_id))
    }
  }

  async function fetchProviderBookings(uid) {
    const { data: bookingsData } = await supabase
      .from('bookings')
      .select('*')
      .eq('provider_id', uid)
      .order('created_at', { ascending: false })

    const bookings = bookingsData || []
    if (bookings.length === 0) {
      setPendingBookings([])
      setActiveServiceBookings([])
      setCompletedServiceBookings([])
      return []
    }

    const serviceIds = [...new Set(bookings.map(b => b.service_id).filter(Boolean))]
    const requesterIds = [...new Set(bookings.map(b => b.requester_id).filter(Boolean))]

    const [servicesRes, profilesRes] = await Promise.all([
      supabase.from('services').select('*').in('id', serviceIds),
      supabase.from('profiles').select('id, full_name, avatar_url').in('id', requesterIds),
    ])

    const serviceMap = {}
    servicesRes.data?.forEach(s => { serviceMap[s.id] = s })
    const profileMap = {}
    profilesRes.data?.forEach(p => { profileMap[p.id] = p })

    const enriched = bookings.map(b => ({
      ...b,
      service: serviceMap[b.service_id] || null,
      requester: profileMap[b.requester_id] || null,
    }))

    const pending = enriched.filter(b => b.status === 'pending')
    setPendingBookings(pending)
    setActiveServiceBookings(enriched.filter(b => ['confirmed', 'in_progress', 'awaiting_completion'].includes(b.status)))
    setCompletedServiceBookings(enriched.filter(b => b.status === 'completed'))
    return pending
  }

  async function checkNewBookingBanner(uid, pendingBookingsData) {
    if (pendingBookingsData.length === 0) return
    try {
      const { data: prefs } = await supabase
        .from('user_preferences')
        .select('last_seen_at')
        .eq('user_id', uid)
        .single()

      const lastSeen = prefs?.last_seen_at ? new Date(prefs.last_seen_at) : null
      const newOnes = lastSeen
        ? pendingBookingsData.filter(b => new Date(b.created_at) > lastSeen)
        : pendingBookingsData

      if (newOnes.length === 0) return

      const newest = newOnes[0]
      setNewBookingBanner({
        requesterName: newest.requester?.full_name || 'Someone',
        serviceTitle: newest.service?.title || 'your service',
      })

      Animated.timing(bannerAnim, {
        toValue: 0,
        duration: 300,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start()
    } catch {
      // silently skip
    }
  }

  function dismissBanner() {
    Animated.timing(bannerAnim, { toValue: -80, duration: 250, useNativeDriver: true })
      .start(() => setNewBookingBanner(null))
    if (userId) {
      supabase.from('user_preferences').upsert(
        { user_id: userId, last_seen_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      ).catch(() => {})
    }
  }

  async function handleConfirmBooking(booking) {
    const { error } = await supabase
      .from('bookings').update({ status: 'confirmed' }).eq('id', booking.id)
    if (error) { Alert.alert('Error', error.message); return }
    const requesterName = booking.requester?.full_name || 'the requester'
    Alert.alert('Booking confirmed!', `You've confirmed this booking for ${requesterName}.`)
    fetchProviderBookings(userId)
  }

  async function handleDeclineBooking(booking) {
    const { error } = await supabase
      .from('bookings').update({ status: 'cancelled' }).eq('id', booking.id)
    if (error) { Alert.alert('Error', error.message); return }
    Alert.alert('Booking declined', 'The requester has been notified.')
    fetchProviderBookings(userId)
  }

  async function notifyCompletedProviderJobs(uid) {
    if (completionAlertOpenRef.current) return

    try {
      const { data: bidsData, error: bidsError } = await supabase
        .from('bids')
        .select('id, job_id, amount, jobs(*)')
        .eq('provider_id', uid)
        .eq('status', 'accepted')

      if (bidsError) return

      const completedBids = (bidsData || []).filter(bid => bid.jobs?.status === 'completed')
      if (completedBids.length === 0) return

      const jobIds = completedBids.map(bid => bid.job_id)
      const { data: reviewsData, error: reviewsError } = await supabase
        .from('reviews')
        .select('job_id, rating, comment, updated_at')
        .in('job_id', jobIds)
        .eq('reviewee_id', uid)
        .eq('reviewer_role', 'requester')

      if (reviewsError) return

      const reviewsByJob = {}
      ;(reviewsData || []).forEach(review => { reviewsByJob[review.job_id] = review })

      const completedWithReviews = completedBids.filter(bid => reviewsByJob[bid.job_id])
      if (completedWithReviews.length === 0) return

      const seenKey = providerCompletionSeenKey(uid)
      const rawSeen = await AsyncStorage.getItem(seenKey)
      const seen = new Set(rawSeen ? JSON.parse(rawSeen) : [])
      const unseen = completedWithReviews.filter(bid => !seen.has(bid.job_id))
      if (unseen.length === 0) return

      const bid = unseen[0]
      const job = bid.jobs
      const review = reviewsByJob[bid.job_id]
      const nextSeen = [...seen, ...unseen.map(item => item.job_id)]
      await AsyncStorage.setItem(seenKey, JSON.stringify(nextSeen))

      const extraCount = unseen.length - 1
      const commentText = review.comment ? `\n\nComment: "${review.comment}"` : ''
      const extraText = extraCount > 0 ? `\n\nYou have ${extraCount} other completed job${extraCount === 1 ? '' : 's'} with new feedback.` : ''

      completionAlertOpenRef.current = true
      Alert.alert(
        'Job completed',
        `"${job.title}" has been marked complete.\n\nRequester rating: ${review.rating}/5${commentText}${extraText}`,
        [
          {
            text: 'View job',
            onPress: () => {
              completionAlertOpenRef.current = false
              navigation.navigate('JobDetail', { job })
            },
          },
          {
            text: 'OK',
            onPress: () => { completionAlertOpenRef.current = false },
            style: 'cancel',
          },
        ],
        { onDismiss: () => { completionAlertOpenRef.current = false } }
      )
    } catch {
      completionAlertOpenRef.current = false
    }
  }

  async function fetchLastMessages(jobIds) {
    if (jobIds.length === 0) return
    try {
      const { data } = await supabase
        .from('messages')
        .select('job_id, content, created_at')
        .in('job_id', jobIds)
        .order('created_at', { ascending: false })

      if (!data) return
      const map = {}
      data.forEach(msg => {
        if (!map[msg.job_id]) map[msg.job_id] = msg.content
      })
      setLastMessages(map)
    } catch {
      // messages table may not exist — skip silently
    }
  }

  async function fetchWatchlistData(uid) {
    const { data: wlData } = await supabase
      .from('watchlist')
      .select('*')
      .eq('user_id', uid)
      .order('created_at', { ascending: false })

    const wlList = wlData || []
    if (wlList.length === 0) { setWatchlistItems([]); return }

    const jobIds = wlList.map(w => w.job_id)
    const { data: jobsData } = await supabase
      .from('jobs')
      .select('*')
      .in('id', jobIds)

    const jobList = jobsData || []

    const openJobIds = jobList.filter(j => j.status === 'open').map(j => j.id)
    let bidCountMap = {}
    if (openJobIds.length > 0) {
      const { data: bidsData } = await supabase
        .from('bids').select('job_id').in('job_id', openJobIds).eq('status', 'pending')
      bidsData?.forEach(b => { bidCountMap[b.job_id] = (bidCountMap[b.job_id] || 0) + 1 })
    }

    setWatchlistItems(wlList.map(wl => ({
      watchId: wl.id,
      jobId: wl.job_id,
      job: jobList.find(j => j.id === wl.job_id) || null,
      bidCount: bidCountMap[wl.job_id] || 0,
    })))
  }

  async function handleUnwatch(jobId) {
    if (!userId) return
    setWatchlistItems(prev => prev.filter(w => w.jobId !== jobId))
    await removeFromWatchlist(userId, jobId)
  }

  async function handleWithdrawBid(bid) {
    Alert.alert(
      'Withdraw bid',
      `Withdraw your bid of $${bid.amount} NZD?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Withdraw',
          style: 'destructive',
          onPress: async () => {
            await supabase.from('bids').delete().eq('id', bid.id)
            setPendingBids(prev => prev.filter(b => b.id !== bid.id))
          },
        },
      ]
    )
  }

  function onRefresh() { setRefreshing(true); fetchData() }

  // ─── Derived stats ────────────────────────────────────────────────
  const activePosted      = postedJobs.filter(j => ['open', 'accepted', 'in_progress'].includes(j.status))
  const awardedPosted     = postedJobs.filter(j => j.status === 'accepted' || j.status === 'in_progress')
  const completedPosted   = postedJobs.filter(j => j.status === 'completed')
  const activeBids        = myBids.filter(b => b.status === 'pending')
  const activeBookings    = myBookings.filter(b => ['pending', 'confirmed', 'in_progress', 'awaiting_completion'].includes(b.status))
  const completedBookings = myBookings.filter(b => b.status === 'completed')

  if (loading) {
    return (
      <View style={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.greeting}>Loading…</Text>
        </View>
      </View>
    )
  }

  // ─── Shared sub-components ────────────────────────────────────────
  function StatCard({ label, target, accent, selected, onPress }) {
    const active = accent || selected
    const content = (
      <>
        <CountUpText target={target} style={[styles.statNum, active && styles.statNumAccent]} />
        <Text style={[styles.statLabel, active && styles.statLabelAccent]}>{label}</Text>
      </>
    )
    const cardStyle = [styles.statCard, active && styles.statCardAccent]

    if (onPress) {
      return (
        <TouchableOpacity
          style={cardStyle}
          onPress={onPress}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel={`${label}, ${target}`}
          accessibilityState={{ selected }}>
          {content}
        </TouchableOpacity>
      )
    }

    return <View style={cardStyle}>{content}</View>
  }

  function QuickBtn({ emoji, label, onPress, outline, flex, compact }) {
    return (
      <TouchableOpacity
        style={[styles.quickBtn, compact && styles.quickBtnCompact, outline && styles.quickBtnOutline, flex && { flex: 1 }]}
        onPress={onPress}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={label}>
        <Text style={[styles.quickBtnEmoji, compact && styles.quickBtnEmojiCompact]}>{emoji}</Text>
        <Text style={[styles.quickBtnText, compact && styles.quickBtnTextCompact, outline && styles.quickBtnTextOutline]}>{label}</Text>
      </TouchableOpacity>
    )
  }

  function SectionHeader({ title, onViewAll }) {
    return (
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {onViewAll && (
          <TouchableOpacity onPress={onViewAll} accessibilityRole="button" accessibilityLabel="View all">
            <Text style={styles.viewAllText}>View all</Text>
          </TouchableOpacity>
        )}
      </View>
    )
  }

  const refreshControl = (
    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
  )

  // ─────────────────────────────────────────────────────────────────
  //  REQUESTER MODE
  // ─────────────────────────────────────────────────────────────────
  if (primaryRole === 'requester') {
    const requesterTabs = [
      { key: 'active', label: 'Active', target: activePosted.length + activeBookings.length, jobs: activePosted },
      { key: 'bids', label: 'New bids', target: newBidsTotal, jobs: postedJobs.filter(j => j.status === 'open' && (j.bidCount || 0) > 0) },
      { key: 'awarded', label: 'Awarded', target: awardedPosted.length, jobs: awardedPosted },
    ]
    const selectedRequesterTab = requesterTabs.find(tab => tab.key === requesterTab) || requesterTabs[0]
    const displayJobs = selectedRequesterTab.jobs.slice(0, 5)
    const displayBookings = requesterTab === 'active' ? activeBookings : []
    const requesterEmpty = {
      active: { icon: 'Tasks', title: 'No active tasks or bookings', body: 'Post a task or book a service to get started' },
      bids: { icon: 'Bids', title: 'No new bids', body: 'Tasks with new provider bids will appear here' },
      awarded: { icon: 'Work', title: 'Nothing awarded', body: 'Awarded jobs will appear here until they are completed' },
    }[selectedRequesterTab.key]

    return (
      <View style={styles.screen}>
        <View style={styles.header}>
          <View style={styles.headerTopRow}>
            <View>
              <Text style={styles.greeting}>{getGreeting()}, {fullName || 'there'} 👋</Text>
              <Text style={styles.headerSub}>Here's your task overview</Text>
            </View>
            <TouchableOpacity
              style={styles.profileBtn}
              onPress={() => navigation.navigate('Profile')}
              accessibilityRole="button"
              accessibilityLabel="Go to profile">
              <Text style={styles.profileBtnText}>👤</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.statsRow}>
            {requesterTabs.map(tab => (
              <StatCard
                key={tab.key}
                label={tab.label}
                target={tab.target}
                selected={requesterTab === tab.key}
                onPress={() => setRequesterTab(tab.key)}
              />
            ))}
          </View>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
          refreshControl={refreshControl}
          showsVerticalScrollIndicator={false}>

          <View style={styles.requesterActionRow}>
            <QuickBtn emoji="➕" label="Post a job" compact flex onPress={() => navigation.navigate('PostJob')} />
            <QuickBtn emoji="🔍" label="Browse tasks" compact outline flex onPress={() => navigation.navigate('JobFeed')} />
            <QuickBtn emoji="🔧" label="Services" compact outline flex onPress={() => navigation.navigate('ServicesList')} />
          </View>

          <SectionHeader
            title={selectedRequesterTab.label}
            onViewAll={selectedRequesterTab.jobs.length > 5 ? () => navigation.navigate('MyJobs') : null}
          />

          {displayJobs.length === 0 && displayBookings.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>📋</Text>
              <Text style={styles.emptyTitle}>{requesterEmpty.title}</Text>
              <Text style={styles.emptyBody}>{requesterEmpty.body}</Text>
            </View>
          ) : (
            <>
              {displayJobs.map(job => (
                <JobCard
                  key={job.id}
                  job={job}
                  bidCount={job.bidCount || 0}
                  onPress={() => navigation.navigate('ManageTask', { job, bidCount: job.bidCount || 0 })}
                />
              ))}
              {displayBookings.map(booking => (
                <RequesterBookingCard
                  key={booking.id}
                  booking={booking}
                  navigation={navigation}
                  onRefresh={fetchData}
                />
              ))}
            </>
          )}

          {activeBids.length > 0 && (
            <>
              <SectionHeader title="Jobs I'm doing" onViewAll={() => navigation.navigate('MyJobs')} />
              {activeBids.slice(0, 3).map(bid => (
                <JobCard
                  key={bid.id}
                  job={bid.jobs}
                  bidCount={0}
                  onPress={() => navigation.navigate('JobDetail', { job: bid.jobs })}
                />
              ))}
            </>
          )}

          {(completedPosted.length > 0 || completedBookings.length > 0) && (
            <TouchableOpacity
              style={styles.secondaryLink}
              onPress={() => navigation.navigate('MyJobs', { filter: 'completed' })}
              accessibilityRole="button"
              accessibilityLabel="View completed tasks and bookings">
              <Text style={styles.secondaryLinkText}>
                View completed ({completedPosted.length + completedBookings.length})
              </Text>
            </TouchableOpacity>
          )}

        </ScrollView>
      </View>
    )
  }

  // ─────────────────────────────────────────────────────────────────
  //  PROVIDER MODE
  // ─────────────────────────────────────────────────────────────────
  if (primaryRole === 'provider') {
    const activeJobsCount = inProgressBids.length + awardedBids.length + activeServiceBookings.length
    const completedJobsCount = completedProviderBids.length + completedServiceBookings.length
    const TABS = [
      { key: 'bidspending', label: 'Bids & bookings', count: pendingBids.length + pendingBookings.length },
      { key: 'activejobs',  label: 'Jobs',             count: activeJobsCount },
      { key: 'watchlist',   label: 'Watchlist',         count: watchlistItems.length },
    ]

    let panelTitle = ''
    let panelContent = null

    if (providerTab === 'bidspending') {
      panelTitle = 'Bids & bookings'
      const hasBids = pendingBids.length > 0
      const hasNewBookings = pendingBookings.length > 0
      panelContent = !hasBids && !hasNewBookings ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>🎯</Text>
          <Text style={styles.emptyTitle}>No pending bids or bookings</Text>
          <Text style={styles.emptyBody}>Browse available jobs and submit bids, or wait for service bookings</Text>
        </View>
      ) : (
        <>
          {hasNewBookings && (
            <>
              <SectionHeader title="New service bookings" />
              {pendingBookings.map(booking => (
                <ProviderPendingBookingCard
                  key={booking.id}
                  booking={booking}
                  onConfirm={handleConfirmBooking}
                  onDecline={handleDeclineBooking}
                />
              ))}
            </>
          )}
          {hasBids && (
            <>
              <SectionHeader title="Pending bids" />
              {pendingBids.map(bid => (
                <BidPendingCard
                  key={bid.id}
                  bid={bid}
                  onWithdraw={handleWithdrawBid}
                  navigation={navigation}
                />
              ))}
            </>
          )}
        </>
      )
    } else if (providerTab === 'activejobs') {
      panelTitle = 'Jobs'
      const hasActiveJobs = inProgressBids.length > 0 || awardedBids.length > 0
      const hasActiveBookings = activeServiceBookings.length > 0
      const hasCompletedJobs = completedJobsCount > 0
      const hasActiveWork = hasActiveJobs || hasActiveBookings
      panelContent = (
        <>
          {!hasActiveWork ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>🔧</Text>
              <Text style={styles.emptyTitle}>No active jobs</Text>
              <Text style={styles.emptyBody}>Jobs you've been hired for will appear here</Text>
            </View>
          ) : (
            <>
              <SectionHeader title="Active jobs" />
              {inProgressBids.map(bid => (
                <ActiveJobInProgressCard
                  key={bid.id}
                  job={bid.job}
                  lastMessage={lastMessages[bid.job_id]}
                  navigation={navigation}
                />
              ))}
              {awardedBids.map(bid => (
                <ActiveJobNotStartedCard
                  key={bid.id}
                  job={bid.job}
                  bid={bid}
                  navigation={navigation}
                />
              ))}
              {activeServiceBookings.map(booking => (
                <ProviderActiveBookingCard
                  key={booking.id}
                  booking={booking}
                  navigation={navigation}
                  onStatusUpdate={fetchData}
                />
              ))}
            </>
          )}
          {hasCompletedJobs && (
            <>
              <TouchableOpacity
                style={styles.secondaryLink}
                onPress={() => setShowProviderCompletedJobs(show => !show)}
                accessibilityRole="button"
                accessibilityLabel={`${showProviderCompletedJobs ? 'Hide' : 'Show'} completed jobs`}>
                <Text style={styles.secondaryLinkText}>
                  {showProviderCompletedJobs ? 'Hide' : 'Show'} completed jobs ({completedJobsCount})
                </Text>
              </TouchableOpacity>
              {showProviderCompletedJobs && (
                <>
                  <SectionHeader title="Completed jobs" />
                  {completedProviderBids.map(bid => (
                    <CompletedProviderJobCard
                      key={bid.id}
                      job={bid.job}
                      bid={bid}
                      navigation={navigation}
                    />
                  ))}
                  {completedServiceBookings.map(booking => (
                    <ProviderCompletedBookingCard
                      key={booking.id}
                      booking={booking}
                      navigation={navigation}
                    />
                  ))}
                </>
              )}
            </>
          )}
        </>
      )
    } else {
      panelTitle = 'Watching'
      panelContent = watchlistItems.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>🔖</Text>
          <Text style={styles.emptyTitle}>Nothing in watchlist</Text>
          <Text style={styles.emptyBody}>Bookmark jobs while browsing to track them here</Text>
        </View>
      ) : (
        watchlistItems.map(item => (
          <WatchlistCard
            key={item.watchId}
            watchItem={item}
            onUnwatch={handleUnwatch}
            navigation={navigation}
          />
        ))
      )
    }

    return (
      <View style={styles.screen}>
        <View style={styles.header}>
          <View style={styles.headerTopRow}>
            <View>
              <Text style={styles.greeting}>{getGreeting()}, {fullName || 'there'} 👋</Text>
              <Text style={styles.headerSub}>Manage your work</Text>
            </View>
            <TouchableOpacity
              style={styles.profileBtn}
              onPress={() => navigation.navigate('Profile')}
              accessibilityRole="button"
              accessibilityLabel="Go to profile">
              <Text style={styles.profileBtnText}>👤</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.statsRow}>
            {TABS.map(tab => (
              <TouchableOpacity
                key={tab.key}
                style={[styles.statCard, providerTab === tab.key && styles.statCardAccent]}
                onPress={() => setProviderTab(tab.key)}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel={`${tab.label}, ${tab.count} items`}
                accessibilityState={{ selected: providerTab === tab.key }}>
                <Text style={[styles.statNum, providerTab === tab.key && styles.statNumAccent]}>
                  {tab.count}
                </Text>
                <Text style={[styles.statLabel, providerTab === tab.key && styles.statLabelAccent]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* New booking notification banner */}
        {newBookingBanner && (
          <Animated.View
            style={[styles.notifBanner, { paddingTop: Math.max(insets.top, 14), transform: [{ translateY: bannerAnim }] }]}>
            <TouchableOpacity
              style={styles.notifBannerContent}
              onPress={() => { setProviderTab('bidspending'); dismissBanner() }}
              activeOpacity={0.9}
              accessibilityRole="button"
              accessibilityLabel="View new booking">
              <Text style={styles.notifBannerText} numberOfLines={2}>
                🔔 New booking! {newBookingBanner.requesterName} has booked your {newBookingBanner.serviceTitle} service
              </Text>
              <TouchableOpacity
                style={styles.notifBannerClose}
                onPress={dismissBanner}
                accessibilityRole="button"
                accessibilityLabel="Dismiss notification">
                <Text style={styles.notifBannerCloseText}>✕</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          </Animated.View>
        )}

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
          refreshControl={refreshControl}
          showsVerticalScrollIndicator={false}>

          <SectionHeader title={panelTitle} />
          {panelContent}

          <View style={styles.providerActionRow}>
            <QuickBtn
              emoji="🔍"
              label="Find more jobs"
              flex
              onPress={() => navigation.navigate('JobFeed')}
            />
          </View>

          <View style={styles.dualBtnRow}>
            <QuickBtn
              emoji="🔧"
              label="My services"
              flex
              onPress={() => navigation.navigate('MyServices')}
            />
            <View style={{ width: 12 }} />
            <QuickBtn
              emoji="🛒"
              label="Browse services"
              outline
              flex
              onPress={() => navigation.navigate('ServicesList')}
            />
          </View>

          <QuickBtn
            emoji="➕"
            label="Post a job"
            outline
            onPress={() => navigation.navigate('PostJob')}
          />

        </ScrollView>
      </View>
    )
  }

  // ─────────────────────────────────────────────────────────────────
  //  BOTH MODE
  // ─────────────────────────────────────────────────────────────────
  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <View>
            <Text style={styles.greeting}>{getGreeting()}, {fullName || 'there'} 👋</Text>
            <Text style={styles.headerSub}>Your activity overview</Text>
          </View>
          <TouchableOpacity
            style={styles.profileBtn}
            onPress={() => navigation.navigate('Profile')}
            accessibilityRole="button"
            accessibilityLabel="Go to profile">
            <Text style={styles.profileBtnText}>👤</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.statsRow}>
          <StatCard label="Posted" target={activePosted.length} />
          <StatCard label="New bids" target={newBidsTotal} accent />
          <StatCard label="Doing" target={activeBids.length} />
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
        refreshControl={refreshControl}
        showsVerticalScrollIndicator={false}>

        <View style={styles.dualBtnRow}>
          <QuickBtn emoji="➕" label="Post a job" flex onPress={() => navigation.navigate('PostJob')} />
          <View style={{ width: 12 }} />
          <QuickBtn emoji="🔍" label="Find jobs" outline flex onPress={() => navigation.navigate('JobFeed')} />
        </View>
        <View style={styles.dualBtnRow}>
          <QuickBtn emoji="🔧" label="My services" flex onPress={() => navigation.navigate('MyServices')} />
          <View style={{ width: 12 }} />
          <QuickBtn emoji="🛒" label="Services" outline flex onPress={() => navigation.navigate('ServicesList')} />
        </View>

        <SectionHeader
          title="My posted tasks"
          onViewAll={activePosted.length > 3 ? () => navigation.navigate('MyJobs') : null}
        />

        {activePosted.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyBody}>No active tasks posted yet</Text>
          </View>
        ) : (
          activePosted.slice(0, 3).map(job => (
            <JobCard
              key={job.id}
              job={job}
              bidCount={job.bidCount || 0}
              onPress={() => navigation.navigate('ManageTask', { job, bidCount: job.bidCount || 0 })}
            />
          ))
        )}

        <View style={styles.divider} />

        <SectionHeader
          title="Jobs I'm doing"
          onViewAll={myBids.length > 3 ? () => navigation.navigate('MyJobs') : null}
        />

        {activeBids.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyBody}>No active bids placed yet</Text>
          </View>
        ) : (
          activeBids.slice(0, 3).map(bid => (
            <JobCard
              key={bid.id}
              job={bid.jobs}
              bidCount={0}
              onPress={() => navigation.navigate('JobDetail', { job: bid.jobs })}
            />
          ))
        )}

      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },

  // ─── Header ──────────────────────────────────────────────────────
  header: {
    backgroundColor: colors.primary,
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  greeting: { fontSize: 20, fontWeight: 'bold', color: colors.white },
  headerSub: { fontSize: 13, color: 'rgba(255,255,255,0.75)', marginTop: 2 },
  profileBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileBtnText: { fontSize: 18 },

  // ─── Stats / tabs ─────────────────────────────────────────────────
  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  statCardAccent: { backgroundColor: colors.white },
  statNum: { fontSize: 26, fontWeight: 'bold', color: colors.white },
  statNumAccent: { color: colors.primary },
  statLabel: { fontSize: 11, color: 'rgba(255,255,255,0.8)', marginTop: 2, fontWeight: '600' },
  statLabelAccent: { color: colors.textMuted },

  // ─── Scroll ───────────────────────────────────────────────────────
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 48 },

  // ─── Quick action buttons ─────────────────────────────────────────
  quickBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 16,
    minHeight: 52,
  },
  quickBtnCompact: {
    paddingVertical: 12,
    paddingHorizontal: 8,
    gap: 5,
  },
  quickBtnOutline: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  quickBtnEmoji: { fontSize: 18 },
  quickBtnEmojiCompact: { fontSize: 16 },
  quickBtnText: { fontSize: 15, fontWeight: '700', color: colors.white },
  quickBtnTextCompact: { fontSize: 12, textAlign: 'center', flexShrink: 1 },
  quickBtnTextOutline: { color: colors.primary },
  dualBtnRow: { flexDirection: 'row', marginBottom: 20 },
  requesterActionRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  providerActionRow: { marginTop: 8 },

  // ─── Section header ───────────────────────────────────────────────
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  viewAllText: { fontSize: 13, color: colors.primary, fontWeight: '600' },

  // ─── Empty state ──────────────────────────────────────────────────
  emptyState: { alignItems: 'center', paddingVertical: 32, marginBottom: 8 },
  emptyIcon: { fontSize: 36, marginBottom: 10 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: colors.textSecondary, marginBottom: 4 },
  emptyBody: { fontSize: 13, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },

  // ─── Divider ──────────────────────────────────────────────────────
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 20 },

  // ─── Secondary link ───────────────────────────────────────────────
  secondaryLink: { alignItems: 'center', paddingVertical: 16, marginTop: 4 },
  secondaryLinkText: { fontSize: 14, color: colors.primary, fontWeight: '600' },

  // ─── Requester booking card ───────────────────────────────────────
  bookingCard: {
    backgroundColor: colors.white,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  bookingCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
    gap: 10,
  },
  bookingCardTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  bookingBadge: {
    backgroundColor: colors.primaryLight,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    flexShrink: 0,
  },
  bookingBadgeText: { fontSize: 11, fontWeight: '700', color: colors.primary },
  bookingMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 6 },
  bookingMeta: { fontSize: 12, color: colors.textMuted },
  bookingStatusBox: {
    backgroundColor: colors.warningLight,
    borderRadius: 8,
    padding: 8,
    marginBottom: 12,
    marginTop: 4,
  },
  bookingStatusBoxConfirmed: { backgroundColor: colors.primaryLight },
  bookingStatusBoxInProgress: { backgroundColor: colors.infoLight },
  bookingStatusText: { fontSize: 13, fontWeight: '600', color: colors.warning },
  bookingStatusTextConfirmed: { color: colors.primary },
  bookingStatusTextInProgress: { color: colors.info },

  // ─── Provider cards ───────────────────────────────────────────────
  pCard: {
    backgroundColor: colors.white,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  pCardAccepted:    { borderLeftWidth: 4, borderLeftColor: colors.primary },
  pCardUnavailable: { opacity: 0.6 },
  pCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
    gap: 10,
  },
  pCardTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  pTextMuted: { color: colors.textMuted },
  pMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  pMeta: { fontSize: 12, color: colors.textMuted },

  // Provider badges
  pBadgeBlue:      { backgroundColor: colors.infoLight,   borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, flexShrink: 0 },
  pBadgeBlueText:  { fontSize: 11, fontWeight: '700', color: colors.info },
  pBadgeGreen:     { backgroundColor: colors.primaryLight, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, flexShrink: 0 },
  pBadgeGreenText: { fontSize: 11, fontWeight: '700', color: colors.primary },
  pBadgeGray:      { backgroundColor: '#efefef',           borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, flexShrink: 0 },
  pBadgeGrayText:  { fontSize: 11, fontWeight: '700', color: colors.textMuted },
  pBadgeAmber:     { backgroundColor: colors.warningLight, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, flexShrink: 0 },
  pBadgeAmberText: { fontSize: 11, fontWeight: '700', color: colors.warning },

  // Provider info boxes
  pChatPreview:      { backgroundColor: colors.infoLight,   borderRadius: 8, padding: 10, marginBottom: 12 },
  pChatPreviewText:  { fontSize: 13, color: colors.info,    lineHeight: 18 },
  pInfoBox:          { backgroundColor: colors.primaryLight, borderRadius: 8, padding: 10, marginBottom: 12 },
  pInfoBoxText:      { fontSize: 13, color: colors.primary,  lineHeight: 18 },
  pInfoBoxAmber:     { backgroundColor: colors.warningLight, borderRadius: 8, padding: 10, marginBottom: 12 },
  pInfoBoxAmberText: { fontSize: 13, color: colors.warning,  lineHeight: 18 },

  // Provider action buttons
  pBtnRow: { flexDirection: 'row', gap: 10, marginTop: 2 },
  pBtnPrimary: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  pBtnPrimaryText: { fontSize: 13, fontWeight: '700', color: colors.white },
  pBtnSecondary: {
    flex: 1,
    backgroundColor: colors.infoLight,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  pBtnSecondaryText: { fontSize: 13, fontWeight: '700', color: colors.info },
  pBtnUnwatch: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: '#7c3aed',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  pBtnUnwatchText: { fontSize: 13, fontWeight: '700', color: '#7c3aed' },
  pBtnWithdraw: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: colors.danger,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  pBtnWithdrawText: { fontSize: 13, fontWeight: '700', color: colors.danger },
  pBtnDecline: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: colors.danger,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  pBtnDeclineText: { fontSize: 13, fontWeight: '700', color: colors.danger },

  // ─── Notification banner ──────────────────────────────────────────
  notifBanner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 50,
    backgroundColor: '#1a5e3a',
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  notifBannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  notifBannerText: {
    flex: 1,
    fontSize: 13,
    color: colors.white,
    fontWeight: '600',
    lineHeight: 18,
  },
  notifBannerClose: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  notifBannerCloseText: { fontSize: 14, color: colors.white, fontWeight: '700' },
})
