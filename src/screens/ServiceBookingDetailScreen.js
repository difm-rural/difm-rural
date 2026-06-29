import React, { useEffect, useState } from 'react'
import {
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../lib/supabase'
import { bookingStatusLabel, BOOKING_STATUS, BOOKING_UNDERWAY_STATUSES, isBookingUnderway, isBookingDismissable } from '../lib/lifecycle'
import { colors } from '../theme/tokens'
import ReviewModal from '../components/ReviewModal'
import ReceivedReview from '../components/ReceivedReview'
import ReputationCard from '../components/ReputationCard'
import Icon from '../components/Icon'
import Button from '../components/Button'
import { loadReview } from '../lib/reviews'
import {
  updateBookingStatus,
  confirmBookingComplete,
  sendBookingQuote,
  acceptBookingQuote,
  dismissProviderBooking as dismissBookingApi,
  saveBookingReview,
} from '../lib/bookingActions'

function formatMoney(amount, service) {
  if (amount != null) return `$${amount} NZD`
  if (service?.pricing_type === 'quote_required') return 'Quote to be confirmed'
  if (amount == null) return 'Not set'
  return `$${amount} NZD`
}

function DetailRow({ label, value }) {
  if (value == null || value === '') return null
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  )
}

export default function ServiceBookingDetailScreen({ route, navigation }) {
  const insets = useSafeAreaInsets()
  const initialBooking = route.params?.booking || null
  const viewerRole = route.params?.viewerRole || 'provider'
  const [booking, setBooking] = useState(initialBooking)
  const [quoteAmount, setQuoteAmount] = useState('')
  const [quoteNotes, setQuoteNotes] = useState('')
  const [savingQuote, setSavingQuote] = useState(false)
  const [otherStats, setOtherStats] = useState(null)
  const [otherReviews, setOtherReviews] = useState([])
  const [reviewVisible, setReviewVisible] = useState(false)
  const [myReview, setMyReview] = useState(null)
  const [receivedReview, setReceivedReview] = useState(null)
  const [savingReview, setSavingReview] = useState(false)

  useEffect(() => {
    fetchBooking()
  }, [initialBooking?.id])

  // Load the viewer's own review once the booking is completed.
  useEffect(() => {
    if (booking?.status !== 'completed' || !booking?.id) return
    loadMyReview()
  }, [booking?.status, booking?.id])

  async function loadMyReview() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const review = await loadReview({ bookingId: booking.id, reviewerId: user.id, reviewerRole: viewerRole })
      setMyReview(review)
      // The review the other party left about you (for this booking).
      const fromRole = viewerRole === 'provider' ? 'requester' : 'provider'
      const { data } = await supabase
        .from('reviews')
        .select('rating, comment')
        .eq('booking_id', booking.id)
        .eq('reviewee_id', user.id)
        .eq('reviewer_role', fromRole)
        .maybeSingle()
      setReceivedReview(data || null)
    } catch { /* reviews table not provisioned yet */ }
  }

  // Reputation of the other party — the requester's rating/reviews for a
  // provider viewer, and vice versa. Reviews are publicly readable.
  useEffect(() => {
    const otherId = viewerRole === 'provider' ? booking?.requester_id : booking?.provider_id
    if (otherId) fetchOtherReputation(otherId)
  }, [booking?.requester_id, booking?.provider_id, viewerRole])

  async function fetchOtherReputation(otherId) {
    const role = viewerRole === 'provider' ? 'requester' : 'provider'
    try {
      const { data } = await supabase
        .from('reviews')
        .select('rating, comment, created_at')
        .eq('reviewee_id', otherId)
        .eq('reviewee_role', role)
        .order('created_at', { ascending: false })
      const rows = data || []
      const count = rows.length
      const avg = count > 0 ? rows.reduce((sum, r) => sum + (r.rating || 0), 0) / count : 0
      setOtherStats({ ratingAvg: avg, ratingCount: count })
      setOtherReviews(rows.filter(r => r.comment).slice(0, 3))
    } catch {
      setOtherStats(null)
      setOtherReviews([])
    }
  }

  async function fetchBooking() {
    if (!initialBooking?.id) return
    const { data } = await supabase
      .from('bookings')
      .select('*, service:service_id(*), requester:requester_id(id, full_name, avatar_url), provider:provider_id(id, full_name, avatar_url)')
      .eq('id', initialBooking.id)
      .single()
    if (data) setBooking(data)
    if (data?.quote_amount != null) setQuoteAmount(String(data.quote_amount))
    if (data?.quote_notes) setQuoteNotes(data.quote_notes)
  }

  if (!booking) {
    return (
      <View style={styles.screen}>
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Icon name="chevron-back" size={18} color={colors.primary} /><Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Booking unavailable</Text>
        </View>
      </View>
    )
  }

  const service = booking.service || booking.services || {}
  const requester = booking.requester || { full_name: booking.requesterName }
  const provider = booking.provider || { full_name: booking.providerName }
  const otherUser = viewerRole === 'provider' ? requester : provider
  const otherRoleLabel = viewerRole === 'provider' ? 'Requester' : 'Provider'
  const isQuoteRequired = service.pricing_type === 'quote_required'

  function openMap() {
    if (!booking.latitude || !booking.longitude) return
    const lat = Number(booking.latitude)
    const lng = Number(booking.longitude)
    const routeNames = navigation.getState()?.routeNames || []
    if (routeNames.includes('JobMap')) {
      navigation.navigate('JobMap', {
        job: {
          title: service.title || 'Booking location',
          latitude: booking.latitude,
          longitude: booking.longitude,
          location_name: booking.location_name,
          location_note: booking.location_note,
        },
        requesterName: otherUser?.full_name || otherRoleLabel,
        viewOnly: true,
      })
      return
    }
    // Fallback (e.g. Account stack, where JobMap isn't registered): open maps app.
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`)
  }

  function openChat() {
    navigation.navigate('Chat', {
      bookingId: booking.id,
      jobTitle: service.title || 'Service booking',
      otherUserId: viewerRole === 'provider' ? booking.requester_id : booking.provider_id,
      otherUserName: otherUser?.full_name || (viewerRole === 'provider' ? 'Requester' : 'Provider'),
    })
  }

  async function updateStatus(nextStatus, allowedStatuses, message) {
    const { error } = await updateBookingStatus(booking.id, nextStatus, allowedStatuses)
    if (error) {
      Alert.alert('Could not update booking', error.message)
      if (error.code === 'stale') fetchBooking()   // re-sync so the UI reflects reality
      return
    }
    setBooking(prev => ({ ...prev, status: nextStatus }))
    if (message) Alert.alert('Updated', message)
  }

  async function sendQuote() {
    const amount = Number(String(quoteAmount).replace(/[^0-9.]/g, ''))
    if (!Number.isFinite(amount) || amount <= 0) {
      Alert.alert('Add quote amount', 'Enter the amount you want the requester to approve.')
      return
    }

    setSavingQuote(true)
    const notes = quoteNotes.trim() || null
    const { error } = await sendBookingQuote(booking.id, booking.provider_id, { amount, notes })
    setSavingQuote(false)
    if (error) {
      Alert.alert('Could not send quote', error.message)
      if (error.code === 'stale') fetchBooking()
      return
    }

    setBooking(prev => ({ ...prev, status: 'quote_sent', quote_amount: amount, quote_notes: notes, total_amount: amount }))
    Alert.alert('Quote sent', 'The requester can now review and accept this quote.')
  }

  async function acceptQuote() {
    Alert.alert('Accept quote', `Accept this quote for ${formatMoney(booking.quote_amount || booking.total_amount, service)}?`, [
      { text: 'No', style: 'cancel' },
      {
        text: 'Accept',
        onPress: async () => {
          const { error } = await acceptBookingQuote(booking.id, booking.requester_id)
          if (error) {
            Alert.alert('Could not accept quote', error.message)
            if (error.code === 'stale') fetchBooking()
            return
          }
          setBooking(prev => ({ ...prev, status: 'confirmed' }))
          Alert.alert('Quote accepted', 'The provider can now proceed with the service.')
        },
      },
    ])
  }

  function confirmBooking() {
    updateStatus('confirmed', [BOOKING_STATUS.PENDING], 'The requester can now see this booking is confirmed.')
  }

  function markReady() {
    Alert.alert(
      'Mark as complete?',
      'This tells the requester the work is done and asks them to confirm completion.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Mark complete',
          onPress: () => updateStatus('awaiting_completion', BOOKING_UNDERWAY_STATUSES, 'The requester has been asked to confirm completion.'),
        },
      ]
    )
  }

  function confirmComplete() {
    Alert.alert(
      'Mark as complete?',
      'Confirm the work is done. This closes the booking and you can leave a review.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Mark as complete',
          onPress: async () => {
            const { error } = await confirmBookingComplete(booking.id, booking.requester_id)
            if (error) {
              Alert.alert('Could not confirm', error.message)
              if (error.code === 'stale') fetchBooking()
              return
            }
            setBooking(prev => ({ ...prev, status: 'completed' }))
            setReviewVisible(true)
          },
        },
      ]
    )
  }

  async function submitReview({ rating, comment }) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setSavingReview(true)
    try {
      const review = await saveBookingReview({ booking, viewerRole, reviewerId: user.id, rating, comment })
      setMyReview(review)
      setReviewVisible(false)
      Alert.alert('Review saved', 'Thanks for your feedback.')
    } catch (e) {
      Alert.alert('Could not save review', e.message)
    } finally {
      setSavingReview(false)
    }
  }

  function confirmCancellation() {
    Alert.alert('Confirm cancellation', 'Confirm this service booking has been cancelled?', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Confirm',
        style: 'destructive',
        onPress: () => updateStatus('cancelled', [BOOKING_STATUS.CANCELLATION_REQUESTED], 'The booking has been cancelled.'),
      },
    ])
  }

  async function dismissProviderBooking() {
    const { error } = await dismissBookingApi(booking.id, booking.provider_id)

    if (error) {
      Alert.alert('Could not dismiss booking', error.message)
      if (error.code === 'stale') fetchBooking()
      return
    }
    navigation.goBack()
  }

  const canRecoverMissingQuote = booking.status === 'confirmed' && booking.quote_amount == null && !booking.quote_sent_at
  const providerCanQuote = viewerRole === 'provider' && isQuoteRequired && (['pending', 'quote_sent'].includes(booking.status) || canRecoverMissingQuote)
  const requesterCanAcceptQuote = viewerRole === 'requester' && booking.status === 'quote_sent'
  const providerCanConfirm = viewerRole === 'provider' && !isQuoteRequired && booking.status === 'pending'
  const providerCanReady = viewerRole === 'provider' && isBookingUnderway(booking.status)
  const providerCanConfirmCancel = viewerRole === 'provider' && booking.status === 'cancellation_requested'
  const providerCanDismiss = viewerRole === 'provider' && isBookingDismissable(booking.status)
  const requesterCanConfirmComplete = viewerRole === 'requester' && booking.status === 'awaiting_completion'
  const canReview = booking.status === 'completed'

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
      enabled={Platform.OS === 'android'}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Icon name="chevron-back" size={18} color={colors.primary} /><Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.kicker}>Service booking</Text>
        <Text style={styles.title} numberOfLines={2}>{service.title || 'Service booking'}</Text>
        <View style={styles.statusPill}>
          <Text style={styles.statusText}>{bookingStatusLabel(booking.status)}</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 180 }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets={true}>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>People</Text>
          <DetailRow label="Requester" value={requester?.full_name || booking.requesterName || 'Requester'} />
          <DetailRow label="Provider" value={provider?.full_name || booking.providerName || 'Provider'} />
        </View>

        <ReputationCard
          label={`${otherRoleLabel} rating`}
          name={otherUser?.full_name || otherRoleLabel}
          ratingAvg={otherStats?.ratingAvg}
          ratingCount={otherStats?.ratingCount}
          reviews={otherReviews}
        />

        {canReview && (
          <ReceivedReview review={receivedReview} fromLabel={otherRoleLabel.toLowerCase()} />
        )}

        <View style={styles.card}>
          <Text style={styles.cardLabel}>Where</Text>
          <DetailRow label="Address" value={booking.location_name} />
          {booking.latitude && booking.longitude ? (
            <TouchableOpacity
              style={styles.detailRow}
              onPress={openMap}
              accessibilityRole="button"
              accessibilityLabel="View location on map">
              <Text style={styles.detailLabel}>Pin</Text>
              <Text style={[styles.detailValue, styles.linkValue]}>
                {`${Number(booking.latitude).toFixed(5)}, ${Number(booking.longitude).toFixed(5)} `}<Icon name="chevron-forward" size={13} color={colors.primary} />
              </Text>
            </TouchableOpacity>
          ) : null}
          <DetailRow label="Pin note" value={booking.location_note} />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>Job details</Text>
          <DetailRow label="Service" value={service.title} />
          <DetailRow label="Category" value={service.category} />
          <DetailRow label="Timing" value={booking.scheduled_date} />
          <DetailRow label="Amount" value={formatMoney(booking.quote_amount || booking.total_amount, service)} />
          <DetailRow label="Quote note" value={booking.quote_notes} />
          <DetailRow label="Requester note" value={booking.notes} />
        </View>

        {providerCanQuote && (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Quote</Text>
            <View style={styles.inputBlock}>
              <Text style={styles.inputLabel}>Amount NZD</Text>
              <TextInput
                style={styles.input}
                value={quoteAmount}
                onChangeText={setQuoteAmount}
                keyboardType="decimal-pad"
                placeholder="e.g. 250"
                placeholderTextColor={colors.textMuted}
              />
            </View>
            <View style={styles.inputBlock}>
              <Text style={styles.inputLabel}>Message to requester</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={quoteNotes}
                onChangeText={setQuoteNotes}
                multiline
                placeholder="What is included in this quote?"
                placeholderTextColor={colors.textMuted}
              />
            </View>
          </View>
        )}

        {requesterCanAcceptQuote && (
          <View style={styles.noticeCard}>
            <Text style={styles.noticeTitle}>Quote ready</Text>
            <Text style={styles.noticeText}>
              Review the amount and notes. Accepting the quote confirms the booking with the provider.
            </Text>
          </View>
        )}

        {requesterCanConfirmComplete && (
          <View style={styles.noticeCard}>
            <Text style={styles.noticeTitle}>Provider marked this complete</Text>
            <Text style={styles.noticeText}>
              Confirm the work is done to close the booking — you can then leave a review.
            </Text>
          </View>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Button variant="secondary" title="Chat" onPress={openChat} style={styles.footerBtn} />
        {providerCanConfirm && (
          <Button title="Confirm" onPress={confirmBooking} style={styles.footerBtn} />
        )}
        {providerCanQuote && (
          <Button
            title={booking.status === 'quote_sent' ? 'Update quote' : 'Send quote'}
            onPress={sendQuote}
            loading={savingQuote}
            style={styles.footerBtn}
          />
        )}
        {requesterCanAcceptQuote && (
          <Button title="Accept quote" onPress={acceptQuote} style={styles.footerBtn} />
        )}
        {providerCanReady && (
          <Button title="Mark job complete" onPress={markReady} style={styles.footerBtn} />
        )}
        {requesterCanConfirmComplete && (
          <Button title="Confirm complete" onPress={confirmComplete} style={styles.footerBtn} />
        )}
        {canReview && (
          <Button
            title={myReview ? 'Edit review' : `Review ${otherRoleLabel.toLowerCase()}`}
            onPress={() => setReviewVisible(true)}
            style={styles.footerBtn}
          />
        )}
        {providerCanConfirmCancel && (
          <Button variant="destructive" title="Confirm cancel" onPress={confirmCancellation} style={styles.footerBtn} />
        )}
        {providerCanDismiss && (
          <Button title="Dismiss" onPress={dismissProviderBooking} style={styles.footerBtn} />
        )}
      </View>

      <ReviewModal
        visible={reviewVisible}
        title={myReview ? 'Edit review' : `Review ${otherRoleLabel.toLowerCase()}`}
        subtitle={`How was working with ${otherUser?.full_name || otherRoleLabel}?`}
        initialRating={myReview?.rating || 0}
        initialComment={myReview?.comment || ''}
        saving={savingReview}
        onClose={() => setReviewVisible(false)}
        onSubmit={submitReview}
      />
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { backgroundColor: colors.background, paddingHorizontal: 20, paddingBottom: 14 },
  backBtn: { minHeight: 36, justifyContent: 'center', alignSelf: 'flex-start', marginBottom: 8, flexDirection: 'row', alignItems: 'center' },
  backText: { color: colors.primary, fontSize: 15, fontWeight: '700' },
  kicker: { fontSize: 13, fontWeight: '700', color: colors.accent, marginBottom: 8 },
  title: { fontSize: 30, lineHeight: 35, fontWeight: '700', color: colors.textPrimary },
  statusPill: { alignSelf: 'flex-start', backgroundColor: colors.primaryLight, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, marginTop: 10 },
  statusText: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  content: { padding: 16 },
  card: { backgroundColor: colors.white, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingTop: 14, marginBottom: 14, overflow: 'hidden' },
  cardLabel: { fontSize: 11, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, paddingHorizontal: 16, marginBottom: 8 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#f2f2f2' },
  detailLabel: { width: 92, fontSize: 13, color: colors.textMuted, fontWeight: '700' },
  detailValue: { flex: 1, fontSize: 14, color: colors.textPrimary, fontWeight: '600', textAlign: 'right', lineHeight: 20 },
  linkValue: { color: colors.primary, fontWeight: '700' },

  inputBlock: { paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#f2f2f2' },
  inputLabel: { fontSize: 13, color: colors.textMuted, fontWeight: '700', marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    minHeight: 46,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.textPrimary,
    backgroundColor: colors.background,
  },
  textArea: { minHeight: 92, textAlignVertical: 'top' },
  noticeCard: { backgroundColor: colors.primaryLight, borderRadius: 12, padding: 16, marginBottom: 14 },
  noticeTitle: { fontSize: 15, fontWeight: '700', color: colors.primary, marginBottom: 6 },
  noticeText: { fontSize: 14, lineHeight: 20, color: colors.textSecondary },
  footer: { flexDirection: 'row', gap: 10, backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.border, paddingHorizontal: 16, paddingTop: 14 },
  footerBtn: { flex: 1 },
})
