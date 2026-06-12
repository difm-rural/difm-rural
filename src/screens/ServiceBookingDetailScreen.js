import React, { useEffect, useState } from 'react'
import {
  Alert,
  KeyboardAvoidingView,
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
import { colors } from '../theme/tokens'

function statusLabel(status) {
  switch (status) {
    case 'pending': return 'Waiting for provider'
    case 'quote_sent': return 'Quote sent'
    case 'confirmed': return 'Confirmed'
    case 'in_progress': return 'In progress'
    case 'awaiting_completion': return 'Ready for requester confirmation'
    case 'cancellation_requested': return 'Cancellation requested'
    case 'completed': return 'Completed'
    case 'withdrawn': return 'Withdrawn'
    case 'cancelled': return 'Cancelled'
    default: return status || 'Booking'
  }
}

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

  useEffect(() => {
    fetchBooking()
  }, [initialBooking?.id])

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
            <Text style={styles.backText}>Back</Text>
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
  const isQuoteRequired = service.pricing_type === 'quote_required'

  function openChat() {
    navigation.navigate('Chat', {
      bookingId: booking.id,
      jobTitle: service.title || 'Service booking',
      otherUserId: viewerRole === 'provider' ? booking.requester_id : booking.provider_id,
      otherUserName: otherUser?.full_name || (viewerRole === 'provider' ? 'Requester' : 'Provider'),
    })
  }

  async function updateStatus(nextStatus, allowedStatuses, message) {
    const { error } = await supabase
      .from('bookings')
      .update({ status: nextStatus })
      .eq('id', booking.id)
      .in('status', allowedStatuses)
    if (error) {
      Alert.alert('Could not update booking', error.message)
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
    const patch = {
      status: 'quote_sent',
      quote_amount: amount,
      quote_notes: quoteNotes.trim() || null,
      total_amount: amount,
      quote_sent_at: new Date().toISOString(),
    }
    const { error } = await supabase
      .from('bookings')
      .update(patch)
      .eq('id', booking.id)
      .eq('provider_id', booking.provider_id)
      .in('status', ['pending', 'quote_sent', 'confirmed'])

    setSavingQuote(false)
    if (error) {
      Alert.alert('Could not send quote', error.message)
      return
    }

    setBooking(prev => ({ ...prev, ...patch }))
    Alert.alert('Quote sent', 'The requester can now review and accept this quote.')
  }

  async function acceptQuote() {
    Alert.alert('Accept quote', `Accept this quote for ${formatMoney(booking.quote_amount || booking.total_amount, service)}?`, [
      { text: 'No', style: 'cancel' },
      {
        text: 'Accept',
        onPress: async () => {
          const patch = { status: 'confirmed', quote_accepted_at: new Date().toISOString() }
          const { error } = await supabase
            .from('bookings')
            .update(patch)
            .eq('id', booking.id)
            .eq('requester_id', booking.requester_id)
            .eq('status', 'quote_sent')
          if (error) {
            Alert.alert('Could not accept quote', error.message)
            return
          }
          setBooking(prev => ({ ...prev, ...patch }))
          Alert.alert('Quote accepted', 'The provider can now proceed with the service.')
        },
      },
    ])
  }

  function confirmBooking() {
    updateStatus('confirmed', ['pending'], 'The requester can now see this booking is confirmed.')
  }

  function markReady() {
    updateStatus('awaiting_completion', ['confirmed', 'in_progress'], 'The requester has been asked to confirm completion.')
  }

  function confirmCancellation() {
    Alert.alert('Confirm cancellation', 'Confirm this service booking has been cancelled?', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Confirm',
        style: 'destructive',
        onPress: () => updateStatus('cancelled', ['cancellation_requested'], 'The booking has been cancelled.'),
      },
    ])
  }

  async function dismissProviderBooking() {
    const { error } = await supabase
      .from('bookings')
      .update({ provider_archive_at: new Date().toISOString() })
      .eq('id', booking.id)
      .eq('provider_id', booking.provider_id)
      .in('status', ['withdrawn', 'cancelled'])

    if (error) {
      Alert.alert('Could not dismiss booking', error.message)
      return
    }
    navigation.goBack()
  }

  const canRecoverMissingQuote = booking.status === 'confirmed' && booking.quote_amount == null && !booking.quote_sent_at
  const providerCanQuote = viewerRole === 'provider' && isQuoteRequired && (['pending', 'quote_sent'].includes(booking.status) || canRecoverMissingQuote)
  const requesterCanAcceptQuote = viewerRole === 'requester' && booking.status === 'quote_sent'
  const providerCanConfirm = viewerRole === 'provider' && !isQuoteRequired && booking.status === 'pending'
  const providerCanReady = viewerRole === 'provider' && ['confirmed', 'in_progress'].includes(booking.status)
  const providerCanConfirmCancel = viewerRole === 'provider' && booking.status === 'cancellation_requested'
  const providerCanDismiss = viewerRole === 'provider' && ['withdrawn', 'cancelled'].includes(booking.status)

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.kicker}>Service booking</Text>
        <Text style={styles.title} numberOfLines={2}>{service.title || 'Service booking'}</Text>
        <View style={styles.statusPill}>
          <Text style={styles.statusText}>{statusLabel(booking.status)}</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 180 }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive">
        <View style={styles.card}>
          <Text style={styles.cardLabel}>People</Text>
          <DetailRow label="Requester" value={requester?.full_name || booking.requesterName || 'Requester'} />
          <DetailRow label="Provider" value={provider?.full_name || booking.providerName || 'Provider'} />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>Where</Text>
          <DetailRow label="Address" value={booking.location_name} />
          <DetailRow
            label="Pin"
            value={booking.latitude && booking.longitude
              ? `${Number(booking.latitude).toFixed(5)}, ${Number(booking.longitude).toFixed(5)}`
              : null}
          />
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
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <TouchableOpacity style={styles.secondaryBtn} onPress={openChat}>
          <Text style={styles.secondaryText}>Chat</Text>
        </TouchableOpacity>
        {providerCanConfirm && (
          <TouchableOpacity style={styles.primaryBtn} onPress={confirmBooking}>
            <Text style={styles.primaryText}>Confirm</Text>
          </TouchableOpacity>
        )}
        {providerCanQuote && (
          <TouchableOpacity style={styles.primaryBtn} onPress={sendQuote} disabled={savingQuote}>
            <Text style={styles.primaryText}>{booking.status === 'quote_sent' ? 'Update quote' : 'Send quote'}</Text>
          </TouchableOpacity>
        )}
        {requesterCanAcceptQuote && (
          <TouchableOpacity style={styles.primaryBtn} onPress={acceptQuote}>
            <Text style={styles.primaryText}>Accept quote</Text>
          </TouchableOpacity>
        )}
        {providerCanReady && (
          <TouchableOpacity style={styles.primaryBtn} onPress={markReady}>
            <Text style={styles.primaryText}>Let requester know completed</Text>
          </TouchableOpacity>
        )}
        {providerCanConfirmCancel && (
          <TouchableOpacity style={styles.dangerBtn} onPress={confirmCancellation}>
            <Text style={styles.dangerText}>Confirm cancel</Text>
          </TouchableOpacity>
        )}
        {providerCanDismiss && (
          <TouchableOpacity style={styles.primaryBtn} onPress={dismissProviderBooking}>
            <Text style={styles.primaryText}>Dismiss</Text>
          </TouchableOpacity>
        )}
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { backgroundColor: colors.background, paddingHorizontal: 20, paddingBottom: 14 },
  backBtn: { minHeight: 36, justifyContent: 'center', alignSelf: 'flex-start', marginBottom: 8 },
  backText: { color: colors.primary, fontSize: 15, fontWeight: '700' },
  kicker: { fontSize: 13, fontWeight: '700', color: colors.primary, marginBottom: 8 },
  title: { fontSize: 30, lineHeight: 35, fontWeight: '700', color: colors.textPrimary },
  statusPill: { alignSelf: 'flex-start', backgroundColor: colors.primaryLight, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, marginTop: 10 },
  statusText: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  content: { padding: 16 },
  card: { backgroundColor: colors.white, borderRadius: 14, borderWidth: 1, borderColor: colors.border, paddingTop: 14, marginBottom: 14, overflow: 'hidden' },
  cardLabel: { fontSize: 11, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, paddingHorizontal: 16, marginBottom: 8 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#f2f2f2' },
  detailLabel: { width: 92, fontSize: 13, color: colors.textMuted, fontWeight: '700' },
  detailValue: { flex: 1, fontSize: 14, color: colors.textPrimary, fontWeight: '600', textAlign: 'right', lineHeight: 20 },
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
  noticeCard: { backgroundColor: colors.primaryLight, borderRadius: 14, padding: 16, marginBottom: 14 },
  noticeTitle: { fontSize: 15, fontWeight: '700', color: colors.primary, marginBottom: 6 },
  noticeText: { fontSize: 14, lineHeight: 20, color: colors.textSecondary },
  footer: { flexDirection: 'row', gap: 10, backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.border, paddingHorizontal: 16, paddingTop: 14 },
  primaryBtn: { flex: 1, backgroundColor: colors.primary, borderRadius: 12, minHeight: 52, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: colors.white, fontSize: 15, fontWeight: '700', textAlign: 'center' },
  secondaryBtn: { flex: 1, borderWidth: 1.5, borderColor: colors.primary, borderRadius: 12, minHeight: 52, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: colors.primary, fontSize: 15, fontWeight: '700' },
  dangerBtn: { flex: 1, borderWidth: 1.5, borderColor: colors.danger, borderRadius: 12, minHeight: 52, alignItems: 'center', justifyContent: 'center' },
  dangerText: { color: colors.danger, fontSize: 15, fontWeight: '700' },
})
