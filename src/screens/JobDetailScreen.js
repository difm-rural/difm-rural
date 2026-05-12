import React, { useEffect, useRef, useState } from 'react'
import { Alert, Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { supabase } from '../lib/supabase'
import { colors } from '../theme/tokens'
import PressableCard from '../components/PressableCard'
import ReviewModal from '../components/ReviewModal'
import { trackEvent } from '../lib/analytics'
import { addToWatchlist, removeFromWatchlist } from '../lib/watchlist'
import { loadReview, saveReview } from '../lib/reviews'

export default function JobDetailScreen({ route, navigation }) {
  const { job } = route.params
  const [bids, setBids] = useState([])
  const [bidAmount, setBidAmount] = useState('')
  const [bidMessage, setBidMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [currentUser, setCurrentUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [alreadyBid, setAlreadyBid] = useState(false)
  const [myBid, setMyBid] = useState(null)
  const [requesterProfile, setRequesterProfile] = useState(null)
  const [isWatched, setIsWatched] = useState(false)
  const [requesterReview, setRequesterReview] = useState(null)
  const [reviewVisible, setReviewVisible] = useState(false)
  const [savingReview, setSavingReview] = useState(false)

  const bidMessageRef = useRef(null)

  useEffect(() => { fetchData() }, [])

  useEffect(() => {
    if (job.status !== 'completed' || !currentUser?.id || !myBid) return
    fetchRequesterReview()
  }, [job.status, currentUser?.id, myBid?.id])

  async function fetchData() {
    const { data: { user } } = await supabase.auth.getUser()
    setCurrentUser(user)
    trackEvent('job_viewed', { job_id: job.id, category: job.category })

    const { data: profileData } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()
    setProfile(profileData)

    const { data: bidsData } = await supabase
      .from('bids')
      .select('*')
      .eq('job_id', job.id)
      .order('created_at', { ascending: false })

    if (bidsData && bidsData.length > 0) {
      const providerIds = bidsData.map(b => b.provider_id)
      const { data: providerProfiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', providerIds)

      const bidsWithProfiles = bidsData.map(bid => ({
        ...bid,
        profiles: providerProfiles?.find(p => p.id === bid.provider_id)
      }))
      setBids(bidsWithProfiles)
    } else {
      setBids([])
    }

    const existingBid = bidsData?.find(b => b.provider_id === user.id)
    if (existingBid) {
      setAlreadyBid(true)
      setMyBid(existingBid)
    }

    const { data: reqProfile } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url')
      .eq('id', job.requester_id)
      .single()
    setRequesterProfile(reqProfile)

    const { data: watchData } = await supabase
      .from('watchlist')
      .select('id')
      .eq('user_id', user.id)
      .eq('job_id', job.id)
      .maybeSingle()
    setIsWatched(!!watchData)
  }

  async function fetchRequesterReview() {
    try {
      const review = await loadReview({
        jobId: job.id,
        reviewerId: currentUser.id,
        reviewerRole: 'provider',
      })
      setRequesterReview(review)
    } catch {
      // Submit will surface any missing table or policy issue to the user.
    }
  }

  async function handleWatchToggle() {
    if (!currentUser) return
    if (isWatched) {
      setIsWatched(false)
      await removeFromWatchlist(currentUser.id, job.id)
      Alert.alert('Removed from watchlist')
    } else {
      setIsWatched(true)
      await addToWatchlist(currentUser.id, job.id)
      Alert.alert('Added to watchlist')
    }
  }

  async function handlePlaceBid() {
    if (!bidAmount) {
      Alert.alert('Missing Amount', 'Please enter a bid amount')
      return
    }
    setLoading(true)
    const { error } = await supabase.from('bids').insert({
      job_id: job.id,
      provider_id: currentUser.id,
      amount: parseFloat(bidAmount),
      message: bidMessage,
      status: 'pending',
    })
    if (error) {
      Alert.alert('Error', error.message)
    } else {
      trackEvent('bid_placed', { job_id: job.id, amount: parseFloat(bidAmount) })
      Alert.alert('Bid Placed!', 'Your bid has been submitted successfully.')
      setAlreadyBid(true)
      fetchData()
    }
    setLoading(false)
  }

  async function handleAcceptBid(bid) {
    Alert.alert(
      'Accept Bid',
      `Accept bid of $${bid.amount} NZD from ${bid.profiles?.full_name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Accept',
          onPress: async () => {
            const { error: e1 } = await supabase
              .from('bids')
              .update({ status: 'accepted' })
              .eq('id', bid.id)

            if (e1) { Alert.alert('Error', e1.message); return }

            const { error: e2 } = await supabase
              .from('bids')
              .update({ status: 'rejected' })
              .eq('job_id', job.id)
              .neq('id', bid.id)

            if (e2) { Alert.alert('Error', e2.message); return }

            const { error: e3 } = await supabase
              .from('jobs')
              .update({ status: 'accepted' })
              .eq('id', job.id)

            if (e3) { Alert.alert('Error', e3.message); return }

            trackEvent('bid_accepted', { job_id: job.id, provider_id: bid.provider_id })
            Alert.alert('Bid Accepted!', 'You can now chat with the provider.', [
              { text: 'OK', onPress: () => navigation.navigate('Dashboard') },
            ])
          },
        },
      ]
    )
  }

  async function handleMarkAsStarted() {
    Alert.alert(
      'Mark as started',
      'Confirm you have started work on this job?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            const { error } = await supabase
              .from('jobs')
              .update({ status: 'in_progress' })
              .eq('id', job.id)
            if (!error) {
              job.status = 'in_progress'
              Alert.alert('Job started', 'The requester has been notified.')
              fetchData()
            }
          },
        },
      ]
    )
  }

  async function handleSubmitRequesterReview({ rating, comment }) {
    if (!currentUser?.id || !job.requester_id) return
    setSavingReview(true)
    try {
      const review = await saveReview({
        jobId: job.id,
        reviewerId: currentUser.id,
        revieweeId: job.requester_id,
        reviewerRole: 'provider',
        revieweeRole: 'requester',
        rating,
        comment,
      })
      setRequesterReview(review)
      setReviewVisible(false)
      Alert.alert('Review saved', 'Thanks for leaving feedback.')
    } catch (error) {
      Alert.alert('Could not save review', error.message)
    } finally {
      setSavingReview(false)
    }
  }

  const isJobOwner = currentUser?.id === job.requester_id
  const canBid = !isJobOwner && job.status === 'open'

  // ─── Provider accepted view ───────────────────────────────────────
  const isAcceptedProvider = !isJobOwner && myBid?.status === 'accepted'

  if (isAcceptedProvider) {
    const requesterFirstName = requesterProfile?.full_name?.split(' ')[0] || 'the requester'
    const otherBidCount = Math.max(0, bids.length - 1)
    const budgetText = job.price_type === 'fixed' ? `$${job.price} NZD` : 'Open to bids'
    const isCompleted = job.status === 'completed'

    function handleChat() {
      navigation.navigate('Chat', {
        jobId: job.id,
        jobTitle: job.title,
        otherUserId: job.requester_id,
        otherUserName: requesterProfile?.full_name || 'Requester',
      })
    }

    return (
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">

          <View style={styles.topNav}>
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={styles.backButton}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Go back">
              <Text style={styles.backText}>← Back</Text>
            </TouchableOpacity>
          </View>

          {/* Accepted job card */}
          <View style={styles.acceptedCard}>
            <View style={styles.acceptedCardHeader}>
              <Text style={styles.category}>{job.category}</Text>
              <View style={styles.acceptedBadge}>
                <Text style={styles.acceptedBadgeText}>
                  {isCompleted ? 'Completed' : 'Your bid accepted!'}
                </Text>
              </View>
            </View>
            <Text style={styles.title}>{job.title}</Text>
            <Text style={styles.location}>📍 {job.location_name}</Text>
            <View style={styles.infoBoxGreen}>
              <Text style={styles.infoBoxGreenText}>
                {isCompleted
                  ? `This job is complete. You can now review ${requesterFirstName}.`
                  : `Your bid of $${myBid.amount} NZD was accepted by ${requesterFirstName}. Contact them to confirm your start time.`}
              </Text>
            </View>
          </View>

          {/* Chat banner */}
          <TouchableOpacity
            style={styles.chatBanner}
            onPress={handleChat}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={`Chat with ${requesterFirstName}`}>
            <Text style={styles.chatBannerIcon}>💬</Text>
            <View style={styles.chatBannerContent}>
              <Text style={styles.chatBannerTitle}>Chat with {requesterFirstName}</Text>
              <Text style={styles.chatBannerSubtitle}>Confirm start time and details</Text>
            </View>
            <Text style={styles.chatBannerArrow}>›</Text>
          </TouchableOpacity>

          {/* Job details card */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Job details</Text>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Category</Text>
              <Text style={styles.detailValue}>{job.category}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Location</Text>
              <Text style={styles.detailValue}>{job.location_name}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Budget</Text>
              <Text style={styles.detailValue}>{budgetText}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Your bid</Text>
              <Text style={[styles.detailValue, { color: colors.primary, fontWeight: '700' }]}>${myBid.amount} NZD</Text>
            </View>
            {job.scheduled_date ? (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Schedule</Text>
                <Text style={styles.detailValue}>{new Date(job.scheduled_date).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
              </View>
            ) : null}
            {job.description ? (
              <View style={[styles.detailRow, { borderBottomWidth: 0 }]}>
                <Text style={styles.detailLabel}>Details</Text>
                <Text style={[styles.detailValue, { flex: 1 }]} numberOfLines={4}>{job.description}</Text>
              </View>
            ) : null}
          </View>

          {/* Actions card */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Actions</Text>
            {isCompleted ? (
              <TouchableOpacity
                style={styles.bigBtnGreen}
                onPress={() => setReviewVisible(true)}
                accessibilityRole="button"
                accessibilityLabel={requesterReview ? 'Edit requester review' : 'Review requester'}>
                <Text style={styles.bigBtnGreenText}>
                  {requesterReview ? `Edit review (${requesterReview.rating}/5)` : 'Review requester'}
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.bigBtnGreen}
                onPress={handleMarkAsStarted}
                accessibilityRole="button"
                accessibilityLabel="Mark job as started">
                <Text style={styles.bigBtnGreenText}>Mark as started</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.bigBtnOutline}
              onPress={() => Alert.alert('Coming soon', 'Requester profile view is coming soon.')}
              accessibilityRole="button"
              accessibilityLabel="View requester profile">
              <Text style={styles.bigBtnOutlineText}>View requester profile</Text>
            </TouchableOpacity>
          </View>

          {/* Other bids info */}
          <View style={styles.infoBoxBlue}>
            <Text style={styles.infoBoxBlueText}>
              {otherBidCount > 0
                ? `${otherBidCount} other bid${otherBidCount !== 1 ? 's were' : ' was'} not accepted. Your bid of $${myBid.amount} NZD was the winning bid.`
                : `Your bid of $${myBid.amount} NZD was the only bid — you got it!`}
            </Text>
          </View>
          <View style={{ height: 40 }} />
        </ScrollView>
        <ReviewModal
          visible={reviewVisible}
          title={requesterReview ? 'Edit requester review' : 'Review requester'}
          subtitle={`How was working with ${requesterProfile?.full_name || requesterFirstName}?`}
          initialRating={requesterReview?.rating || 0}
          initialComment={requesterReview?.comment || ''}
          saving={savingReview}
          onClose={() => setReviewVisible(false)}
          onSubmit={handleSubmitRequesterReview}
        />
      </KeyboardAvoidingView>
    )
  }

  // ─── Normal view (requester + open provider) ──────────────────────
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">

        <View style={styles.topNav}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Go back">
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          {currentUser && !isJobOwner && (
            <TouchableOpacity
              style={[styles.watchBtn, isWatched && styles.watchBtnActive]}
              onPress={handleWatchToggle}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel={isWatched ? 'Remove from watchlist' : 'Add to watchlist'}>
              <Text style={styles.watchBtnText}>🔖</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.category}>{job.category}</Text>
            <Text style={styles.price}>
              {job.price_type === 'fixed' ? `$${job.price} NZD` : 'Open to Bids'}
            </Text>
          </View>
          <Text style={styles.title} accessibilityRole="header">{job.title}</Text>
          <Text style={styles.description}>{job.description}</Text>

          {job.photos?.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.photoStrip}
              style={styles.photoStripWrap}>
              {job.photos.map((url, i) => (
                <Image key={i} source={{ uri: url }} style={styles.photoStripImg} />
              ))}
            </ScrollView>
          )}

          <Text style={styles.location}>📍 {job.location_name}</Text>
          <Text style={styles.status}>Status: {job.status.toUpperCase()}</Text>
        </View>

        {canBid && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {alreadyBid ? 'You have already placed a bid' : 'Place a Bid'}
            </Text>
            {!alreadyBid && (
              <>
                <TextInput
                  style={styles.input}
                  placeholder="Your bid amount (NZD)"
                  value={bidAmount}
                  onChangeText={setBidAmount}
                  keyboardType="numeric"
                  returnKeyType="next"
                  blurOnSubmit={false}
                  onSubmitEditing={() => bidMessageRef.current?.focus()}
                  accessibilityLabel="Bid amount in NZD"
                />
                <TextInput
                  ref={bidMessageRef}
                  style={[styles.input, styles.multiline]}
                  placeholder="Add a message (optional)"
                  value={bidMessage}
                  onChangeText={setBidMessage}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                  autoCapitalize="sentences"
                  autoCorrect
                  returnKeyType="done"
                  accessibilityLabel="Message to requester, optional"
                />
                <TouchableOpacity
                  style={styles.button}
                  onPress={handlePlaceBid}
                  disabled={loading}
                  accessibilityRole="button"
                  accessibilityLabel="Submit bid"
                  accessibilityHint="Double tap to submit your bid on this job">
                  <Text style={styles.buttonText}>{loading ? 'Submitting...' : 'Submit Bid'}</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        {isJobOwner && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {bids.length === 0 ? 'No bids yet' : `${bids.length} Bid${bids.length > 1 ? 's' : ''} Received`}
            </Text>
            {bids.map(bid => (
              <PressableCard key={bid.id} style={styles.bidCard}>
                <View style={styles.bidHeader}>
                  <Text style={styles.bidName}>{bid.profiles?.full_name}</Text>
                  <Text style={styles.bidAmount}>${bid.amount} NZD</Text>
                </View>
                {bid.message ? <Text style={styles.bidMessage}>{bid.message}</Text> : null}
                <Text style={styles.bidStatus}>Status: {bid.status.toUpperCase()}</Text>
                {bid.status === 'pending' && job.status === 'open' && (
                  <TouchableOpacity
                    style={styles.acceptButton}
                    onPress={() => handleAcceptBid(bid)}
                    accessibilityRole="button"
                    accessibilityLabel={`Accept bid from ${bid.profiles?.full_name}`}
                    accessibilityHint="Double tap to accept this bid">
                    <Text style={styles.acceptButtonText}>✓ Accept This Bid</Text>
                  </TouchableOpacity>
                )}
                {bid.status === 'accepted' && (
                  <TouchableOpacity
                    style={styles.chatButton}
                    onPress={() => navigation.navigate('Chat', {
                      jobId: job.id,
                      jobTitle: job.title,
                      otherUserId: bid.provider_id,
                      otherUserName: bid.profiles?.full_name || 'Provider',
                    })}
                    accessibilityRole="button"
                    accessibilityLabel={`Chat with ${bid.profiles?.full_name}`}>
                    <Text style={styles.chatButtonText}>💬 Chat with Provider</Text>
                  </TouchableOpacity>
                )}
              </PressableCard>
            ))}
          </View>
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 16, paddingTop: 60 },
  topNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  backButton: { minHeight: 44, justifyContent: 'center' },
  backText: { color: colors.primary, fontSize: 16, fontWeight: '600' },
  watchBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.55,
  },
  watchBtnActive: { backgroundColor: '#ede7f6', opacity: 1 },
  watchBtnText: { fontSize: 18 },

  // ─── Standard job card ────────────────────────────────────────────
  card: { backgroundColor: colors.white, borderRadius: 12, padding: 16, marginBottom: 16, elevation: 2, borderWidth: 1, borderColor: colors.border },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  category: { backgroundColor: colors.primaryLight, color: colors.primary, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, fontSize: 13, fontWeight: '600' },
  price: { fontWeight: 'bold', color: colors.primary, fontSize: 15 },
  title: { fontSize: 20, fontWeight: 'bold', color: colors.textPrimary, marginBottom: 8 },
  description: { color: colors.textSecondary, fontSize: 15, marginBottom: 10, lineHeight: 24 },
  location: { color: colors.textMuted, fontSize: 14, marginBottom: 6 },
  status: { color: colors.textMuted, fontSize: 13 },

  // ─── Sections ─────────────────────────────────────────────────────
  section: { backgroundColor: colors.white, borderRadius: 12, padding: 16, marginBottom: 16, elevation: 2, borderWidth: 1, borderColor: colors.border },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: colors.textPrimary, marginBottom: 14 },

  // ─── Bid form ─────────────────────────────────────────────────────
  input: { backgroundColor: colors.background, borderRadius: 8, padding: 14, fontSize: 16, borderWidth: 1, borderColor: colors.border, marginBottom: 10 },
  multiline: { height: 90, textAlignVertical: 'top' },
  button: { backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 16, alignItems: 'center', minHeight: 52, justifyContent: 'center' },
  buttonText: { color: colors.white, fontSize: 16, fontWeight: 'bold' },

  // ─── Bids list ────────────────────────────────────────────────────
  bidCard: { backgroundColor: '#f9f9f9', borderRadius: 10, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.border },
  bidHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  bidName: { fontWeight: 'bold', fontSize: 16, color: colors.textPrimary },
  bidAmount: { fontWeight: 'bold', fontSize: 16, color: colors.primary },
  bidMessage: { color: colors.textSecondary, fontSize: 14, marginBottom: 6 },
  bidStatus: { color: colors.textMuted, fontSize: 13, marginBottom: 8 },
  acceptButton: { backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 14, alignItems: 'center', minHeight: 52, justifyContent: 'center' },
  acceptButtonText: { color: colors.white, fontWeight: 'bold', fontSize: 15 },
  chatButton: { backgroundColor: colors.info, borderRadius: 8, paddingVertical: 14, alignItems: 'center', marginTop: 6, minHeight: 52, justifyContent: 'center' },
  chatButtonText: { color: colors.white, fontWeight: 'bold', fontSize: 15 },

  // ─── Photos ───────────────────────────────────────────────────────
  photoStripWrap: { marginBottom: 10, marginHorizontal: -4 },
  photoStrip: { gap: 8, paddingHorizontal: 4, paddingVertical: 2 },
  photoStripImg: { width: 100, height: 100, borderRadius: 8, backgroundColor: '#f0f0f0' },

  // ─── Provider accepted view ───────────────────────────────────────
  acceptedCard: {
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    elevation: 2,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  acceptedCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 8 },
  acceptedBadge: { backgroundColor: colors.primaryLight, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, flexShrink: 0 },
  acceptedBadgeText: { fontSize: 12, fontWeight: '700', color: colors.primary },
  infoBoxGreen: { backgroundColor: colors.primaryLight, borderRadius: 8, padding: 12, marginTop: 10 },
  infoBoxGreenText: { fontSize: 14, color: colors.primary, lineHeight: 20 },

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

  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#f2f2f2',
  },
  detailLabel: { fontSize: 13, color: colors.textMuted, fontWeight: '600', flex: 0, marginRight: 12 },
  detailValue: { fontSize: 13, color: colors.textPrimary, fontWeight: '500', textAlign: 'right', flex: 1 },

  bigBtnGreen: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    minHeight: 52,
    justifyContent: 'center',
    marginBottom: 10,
  },
  bigBtnGreenText: { color: colors.white, fontSize: 16, fontWeight: '700' },
  bigBtnOutline: {
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    minHeight: 52,
    justifyContent: 'center',
  },
  bigBtnOutlineText: { color: colors.primary, fontSize: 16, fontWeight: '700' },

  infoBoxBlue: { backgroundColor: colors.infoLight, borderRadius: 10, padding: 14, marginBottom: 16 },
  infoBoxBlueText: { fontSize: 14, color: colors.info, lineHeight: 20 },
})
