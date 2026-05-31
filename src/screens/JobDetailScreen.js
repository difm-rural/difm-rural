import React, { useEffect, useRef, useState } from 'react'
import { Alert, Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import DateTimePicker from '@react-native-community/datetimepicker'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../lib/supabase'
import { colors } from '../theme/tokens'
import PressableCard from '../components/PressableCard'
import ReviewModal from '../components/ReviewModal'
import { trackEvent } from '../lib/analytics'
import { addToWatchlist, removeFromWatchlist } from '../lib/watchlist'
import { loadReview, saveReview } from '../lib/reviews'
import { GOOGLE_MAPS_API_KEY } from '../lib/constants'

const MATERIALS_LABELS = {
  none:      'No materials needed',
  requester: 'Requester supplies materials',
  provider:  'Provider to supply materials',
}
const ACCESS_LABELS = {
  park_and_walk:  'Park and walk in',
  '4wd_required': '4WD required',
}

function jobStaticMapUrl(job) {
  const lat = parseFloat(job.latitude)
  const lng = parseFloat(job.longitude)
  if (job.area_polygon?.length >= 3) {
    const path = [...job.area_polygon, job.area_polygon[0]].map(p => `${p.latitude},${p.longitude}`).join('|')
    const center = job.area_polygon.reduce(
      (a, p) => ({ lat: a.lat + p.latitude / job.area_polygon.length, lng: a.lng + p.longitude / job.area_polygon.length }),
      { lat: 0, lng: 0 }
    )
    return `https://maps.googleapis.com/maps/api/staticmap?center=${center.lat},${center.lng}&zoom=13&size=700x200&scale=2&path=color:0x2d6a4fff|weight:2|fillcolor:0x2d6a4f50|${path}&key=${GOOGLE_MAPS_API_KEY}`
  }
  return `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=13&size=700x200&scale=2&markers=color:red|${lat},${lng}&key=${GOOGLE_MAPS_API_KEY}`
}

export default function JobDetailScreen({ route, navigation }) {
  const insets = useSafeAreaInsets()
  const { job: initialJob } = route.params
  const [job, setJob] = useState(initialJob)
  const [bids, setBids] = useState([])
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

  // Bid form state (Features 3 & 4)
  const [editingBid,        setEditingBid]        = useState(false)
  const [lineItems,         setLineItems]         = useState([{ label: 'Labour', amount: '' }])
  const [bidMessage,        setBidMessage]        = useState('')
  const [availableFrom,     setAvailableFrom]     = useState(null)
  const [showDatePicker,    setShowDatePicker]    = useState(false)
  const [estimatedDuration, setEstimatedDuration] = useState('')

  // Q&A state (Feature 2)
  const [questions,    setQuestions]    = useState([])
  const [askText,      setAskText]      = useState('')
  const [showAskInput, setShowAskInput] = useState(false)
  const [answeringId,  setAnsweringId]  = useState(null)
  const [answerText,   setAnswerText]   = useState('')
  const [submittingQ,  setSubmittingQ]  = useState(false)

  const bidMessageRef = useRef(null)

  useEffect(() => { fetchData() }, [initialJob.id])

  useEffect(() => {
    if (job.status !== 'completed' || !currentUser?.id || !myBid) return
    fetchRequesterReview()
  }, [job.status, currentUser?.id, myBid?.id])

  async function fetchData() {
    const { data: { user } } = await supabase.auth.getUser()
    setCurrentUser(user)

    const { data: latestJob } = await supabase.from('jobs').select('*').eq('id', initialJob.id).single()
    const currentJob = latestJob || initialJob
    setJob(currentJob)

    trackEvent('job_viewed', { job_id: currentJob.id, category: currentJob.category })

    const { data: profileData } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    setProfile(profileData)

    const { data: bidsData } = await supabase
      .from('bids')
      .select('*, line_items, available_from, estimated_duration')
      .eq('job_id', currentJob.id)
      .order('created_at', { ascending: false })

    if (bidsData && bidsData.length > 0) {
      const providerIds = bidsData.map(b => b.provider_id)
      const { data: providerProfiles } = await supabase
        .from('profiles').select('id, full_name').in('id', providerIds)
      setBids(bidsData.map(bid => ({
        ...bid,
        profiles: providerProfiles?.find(p => p.id === bid.provider_id),
      })))
    } else {
      setBids([])
    }

    const existingBid = bidsData?.find(b => b.provider_id === user.id)
    if (existingBid) {
      setAlreadyBid(true)
      setMyBid(existingBid)
      if (existingBid.line_items?.length > 0) {
        setLineItems(existingBid.line_items.map(li => ({ label: li.label || '', amount: String(li.amount || '') })))
      } else if (existingBid.amount) {
        setLineItems([{ label: 'Labour', amount: String(existingBid.amount) }])
      }
      setBidMessage(existingBid.message || '')
      setEstimatedDuration(existingBid.estimated_duration || '')
      if (existingBid.available_from) setAvailableFrom(new Date(existingBid.available_from))
    } else {
      setAlreadyBid(false)
      setMyBid(null)
    }

    const { data: reqProfile } = await supabase
      .from('profiles').select('id, full_name, avatar_url').eq('id', currentJob.requester_id).single()
    setRequesterProfile(reqProfile)

    const { data: watchData } = await supabase
      .from('watchlist').select('id').eq('user_id', user.id).eq('job_id', currentJob.id).maybeSingle()
    setIsWatched(!!watchData)

    // Q&A fetch (Feature 2)
    try {
      const { data: qs } = await supabase
        .from('job_questions').select('*').eq('job_id', currentJob.id).order('created_at', { ascending: true })
      if (qs?.length > 0) {
        const askerIds = [...new Set(qs.map(q => q.asker_id).filter(Boolean))]
        const { data: askerProfiles } = await supabase.from('profiles').select('id, full_name').in('id', askerIds)
        setQuestions(qs.map(q => ({
          ...q,
          askerName: askerProfiles?.find(p => p.id === q.asker_id)?.full_name || 'Provider',
        })))
      } else {
        setQuestions(qs || [])
      }
    } catch { /* table may not exist yet */ }
  }

  async function fetchRequesterReview() {
    try {
      const review = await loadReview({ jobId: job.id, reviewerId: currentUser.id, reviewerRole: 'provider' })
      setRequesterReview(review)
    } catch { }
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

  function getBidTotal() {
    return lineItems.reduce((sum, li) => sum + (parseFloat(li.amount) || 0), 0)
  }

  function updateLineItem(index, field, value) {
    setLineItems(prev => prev.map((li, i) => i === index ? { ...li, [field]: value } : li))
  }

  function removeLineItem(index) {
    setLineItems(prev => prev.filter((_, i) => i !== index))
  }

  function addLineItem() {
    setLineItems(prev => [...prev, { label: '', amount: '' }])
  }

  function buildLineItemsPayload() {
    return lineItems
      .filter(li => li.label || li.amount)
      .map(li => ({ label: li.label, amount: parseFloat(li.amount) || 0 }))
  }

  async function handlePlaceBid() {
    const total = getBidTotal()
    if (!total || total <= 0) { Alert.alert('Missing Amount', 'Please enter a bid amount'); return }
    setLoading(true)
    const { error } = await supabase.from('bids').insert({
      job_id:             job.id,
      provider_id:        currentUser.id,
      amount:             total,
      message:            bidMessage,
      status:             'pending',
      line_items:         buildLineItemsPayload(),
      available_from:     availableFrom ? availableFrom.toISOString().split('T')[0] : null,
      estimated_duration: estimatedDuration || null,
    })
    if (error) {
      Alert.alert('Error', error.message)
    } else {
      trackEvent('bid_placed', { job_id: job.id, amount: total })
      Alert.alert('Bid Placed!', 'Your bid has been submitted successfully.')
      setAlreadyBid(true)
      setEditingBid(false)
      fetchData()
    }
    setLoading(false)
  }

  async function handleUpdateBid() {
    if (!myBid) return
    const total = getBidTotal()
    if (!total || total <= 0) { Alert.alert('Missing Amount', 'Please enter a bid amount'); return }
    setLoading(true)
    const { error } = await supabase.from('bids').update({
      amount:             total,
      message:            bidMessage,
      line_items:         buildLineItemsPayload(),
      available_from:     availableFrom ? availableFrom.toISOString().split('T')[0] : null,
      estimated_duration: estimatedDuration || null,
    }).eq('id', myBid.id)
    if (error) {
      Alert.alert('Error', error.message)
    } else {
      Alert.alert('Bid updated!', 'Your bid has been updated.')
      setEditingBid(false)
      fetchData()
    }
    setLoading(false)
  }

  async function handleAskQuestion() {
    if (!askText.trim()) return
    setSubmittingQ(true)
    try {
      const { error } = await supabase.from('job_questions').insert({
        job_id:   job.id,
        asker_id: currentUser.id,
        question: askText.trim(),
      })
      if (error) { Alert.alert('Error', error.message); return }
      supabase.from('notifications').insert({
        user_id:  job.requester_id,
        type:     'new_question',
        body:     `New question on your job "${job.title}"`,
        metadata: { job_id: job.id },
      }).then(() => {})
      setAskText('')
      setShowAskInput(false)
      fetchData()
    } finally {
      setSubmittingQ(false)
    }
  }

  async function handleAnswerQuestion(questionId) {
    if (!answerText.trim()) return
    setSubmittingQ(true)
    try {
      const question = questions.find(q => q.id === questionId)
      const { error } = await supabase.from('job_questions').update({
        answer:      answerText.trim(),
        answered_at: new Date().toISOString(),
      }).eq('id', questionId)
      if (error) { Alert.alert('Error', error.message); return }
      if (question?.asker_id) {
        supabase.from('notifications').insert({
          user_id:  question.asker_id,
          type:     'question_answered',
          body:     `Your question on "${job.title}" has been answered`,
          metadata: { job_id: job.id },
        }).then(() => {})
      }
      setAnsweringId(null)
      setAnswerText('')
      fetchData()
    } finally {
      setSubmittingQ(false)
    }
  }

  async function handleAcceptBid(bid) {
    Alert.alert('Accept Bid', `Accept bid of $${bid.amount} NZD from ${bid.profiles?.full_name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Accept',
        onPress: async () => {
          const { error: e1 } = await supabase.from('bids').update({ status: 'accepted' }).eq('id', bid.id)
          if (e1) { Alert.alert('Error', e1.message); return }
          await supabase.from('bids').update({ status: 'rejected' }).eq('job_id', job.id).neq('id', bid.id)
          const { error: e3 } = await supabase.from('jobs').update({ status: 'accepted' }).eq('id', job.id)
          if (e3) { Alert.alert('Error', e3.message); return }
          trackEvent('bid_accepted', { job_id: job.id, provider_id: bid.provider_id })
          Alert.alert('Job awarded!', 'You can now chat with the provider.', [
            { text: 'OK', onPress: () => navigation.navigate('Dashboard') },
          ])
        },
      },
    ])
  }

  async function handleSubmitRequesterReview({ rating, comment }) {
    if (!currentUser?.id || !job.requester_id) return
    setSavingReview(true)
    try {
      const review = await saveReview({
        jobId: job.id, reviewerId: currentUser.id, revieweeId: job.requester_id,
        reviewerRole: 'provider', revieweeRole: 'requester', rating, comment,
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

  const isJobOwner        = currentUser?.id === job.requester_id
  const canBid            = !isJobOwner && job.status === 'open'
  const isAcceptedProvider = !isJobOwner && myBid?.status === 'accepted'

  const headerJSX = (
    <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
      <View style={styles.headerTopRow}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button" accessibilityLabel="Go back">
          <Text style={styles.backBtnText}>← Back</Text>
        </TouchableOpacity>
        {!isAcceptedProvider && currentUser && !isJobOwner && (
          <TouchableOpacity style={[styles.watchBtn, isWatched && styles.watchBtnActive]}
            onPress={handleWatchToggle}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel={isWatched ? 'Remove from watchlist' : 'Add to watchlist'}>
            <Text style={styles.watchBtnText}>🔖</Text>
          </TouchableOpacity>
        )}
      </View>
      <Text style={styles.kicker}>{job.category}</Text>
      <Text style={styles.headerTitle} accessibilityRole="header">{job.title}</Text>
    </View>
  )

  // ─── Provider accepted view ───────────────────────────────────────────────────
  if (isAcceptedProvider) {
    const requesterFirstName = requesterProfile?.full_name?.split(' ')[0] || 'the requester'
    const otherBidCount = Math.max(0, bids.length - 1)
    const budgetText = job.price_type === 'fixed' ? `$${job.price} NZD` : 'Open to bids'
    const isCompleted = job.status === 'completed'

    function handleChat() {
      navigation.navigate('Chat', {
        jobId: job.id, jobTitle: job.title,
        otherUserId: job.requester_id,
        otherUserName: requesterProfile?.full_name || 'Requester',
      })
    }

    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {headerJSX}
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">

          <View style={styles.acceptedCard}>
            <View style={styles.acceptedCardHeader}>
              <Text style={styles.category}>{job.category}</Text>
              <View style={styles.acceptedBadge}>
                <Text style={styles.acceptedBadgeText}>{isCompleted ? 'Completed' : 'Awarded'}</Text>
              </View>
            </View>
            <Text style={styles.title}>{job.title}</Text>
            <Text style={styles.location}>📍 {job.location_name}</Text>
            <View style={styles.infoBoxGreen}>
              <Text style={styles.infoBoxGreenText}>
                {isCompleted
                  ? `This job is complete. You can now review ${requesterFirstName}.`
                  : `This job has been awarded to you for $${myBid.amount} NZD. Use chat to confirm timing and details with ${requesterFirstName}.`}
              </Text>
            </View>
          </View>

          {!isCompleted ? (
            <TouchableOpacity style={styles.chatBanner} onPress={handleChat} activeOpacity={0.85}
              accessibilityRole="button" accessibilityLabel={`Chat with ${requesterFirstName}`}>
              <Text style={styles.chatBannerIcon}>💬</Text>
              <View style={styles.chatBannerContent}>
                <Text style={styles.chatBannerTitle}>Chat with {requesterFirstName}</Text>
                <Text style={styles.chatBannerSubtitle}>Confirm timing and details</Text>
              </View>
              <Text style={styles.chatBannerArrow}>›</Text>
            </TouchableOpacity>
          ) : null}

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

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Actions</Text>
            {job.latitude && job.longitude && (
              <TouchableOpacity style={[styles.bigBtnGreen, { marginBottom: 10 }]}
                onPress={() => navigation.navigate('JobMap', { job, requesterName: requesterProfile?.full_name || 'Requester' })}
                accessibilityRole="button" accessibilityLabel="Navigate to job">
                <Text style={styles.bigBtnGreenText}>🗺 Navigate to job</Text>
              </TouchableOpacity>
            )}
            {isCompleted ? (
              <TouchableOpacity style={[styles.bigBtnGreen, { marginBottom: 10 }]}
                onPress={() => setReviewVisible(true)}
                accessibilityRole="button"
                accessibilityLabel={requesterReview ? 'Edit requester review' : 'Review requester'}>
                <Text style={styles.bigBtnGreenText}>
                  {requesterReview ? `Edit review (${requesterReview.rating}/5)` : 'Review requester'}
                </Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={styles.bigBtnOutline}
              onPress={() => navigation.navigate('RequesterProfile', { requesterId: job.requester_id })}
              accessibilityRole="button" accessibilityLabel="View requester profile">
              <Text style={styles.bigBtnOutlineText}>View requester profile</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.infoBoxBlue}>
            <Text style={styles.infoBoxBlueText}>
              {otherBidCount > 0
                ? `${otherBidCount} other bid${otherBidCount !== 1 ? 's were' : ' was'} not accepted. Your bid of $${myBid.amount} NZD was the winning bid.`
                : `Your bid of $${myBid.amount} NZD was the only bid — you got it!`}
            </Text>
          </View>
          <View style={{ height: insets.bottom + 24 }} />
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
      </View>
    )
  }

  // ─── Normal view (requester + open provider) ──────────────────────────────────
  const bidTotal = getBidTotal()

  const bidFormJSX = (
    <>
      {lineItems.map((li, idx) => (
        <View key={idx} style={styles.lineItemRow}>
          <TextInput
            style={[styles.input, styles.lineItemLabel]}
            placeholder="Description"
            value={li.label}
            onChangeText={v => updateLineItem(idx, 'label', v)}
            accessibilityLabel={`Line item ${idx + 1} description`}
          />
          <TextInput
            style={[styles.input, styles.lineItemAmount]}
            placeholder="$0"
            value={li.amount}
            onChangeText={v => updateLineItem(idx, 'amount', v)}
            keyboardType="numeric"
            accessibilityLabel={`Line item ${idx + 1} amount`}
          />
          {lineItems.length > 1 && (
            <TouchableOpacity onPress={() => removeLineItem(idx)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel="Remove line item">
              <Text style={styles.removeItemBtn}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      ))}
      <TouchableOpacity onPress={addLineItem} style={styles.addLineItemBtn}>
        <Text style={styles.addLineItemText}>+ Add line item</Text>
      </TouchableOpacity>
      {lineItems.length > 1 && (
        <View style={styles.bidTotalRow}>
          <Text style={styles.bidTotalLabel}>Bid total</Text>
          <Text style={styles.bidTotalAmount}>${bidTotal.toFixed(2)} NZD</Text>
        </View>
      )}

      <TextInput
        ref={bidMessageRef}
        style={[styles.input, styles.multiline]}
        placeholder="Add a message (optional)"
        value={bidMessage}
        onChangeText={setBidMessage}
        multiline numberOfLines={3}
        textAlignVertical="top"
        autoCapitalize="sentences"
        returnKeyType="done"
        accessibilityLabel="Message to requester, optional"
      />

      <TouchableOpacity style={styles.availabilityBtn} onPress={() => setShowDatePicker(true)}
        accessibilityRole="button" accessibilityLabel="Set availability date">
        <Text style={styles.availabilityBtnText}>
          📅 {availableFrom
            ? `Available from ${availableFrom.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })}`
            : 'Set availability date (optional)'}
        </Text>
        {availableFrom && (
          <TouchableOpacity onPress={() => setAvailableFrom(null)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.clearDateBtn}>✕</Text>
          </TouchableOpacity>
        )}
      </TouchableOpacity>
      {showDatePicker && (
        <DateTimePicker
          value={availableFrom || new Date()}
          mode="date"
          display="default"
          minimumDate={new Date()}
          onChange={(event, date) => {
            setShowDatePicker(Platform.OS === 'ios')
            if (date) setAvailableFrom(date)
          }}
        />
      )}

      <TextInput
        style={styles.input}
        placeholder="Estimated duration (e.g. 1 day, 3 hours) — optional"
        value={estimatedDuration}
        onChangeText={setEstimatedDuration}
        accessibilityLabel="Estimated duration"
      />

      <TouchableOpacity style={styles.button}
        onPress={editingBid ? handleUpdateBid : handlePlaceBid}
        disabled={loading}
        accessibilityRole="button"
        accessibilityLabel={editingBid ? 'Update bid' : 'Submit bid'}>
        <Text style={styles.buttonText}>{loading ? 'Submitting...' : editingBid ? 'Update Bid' : 'Submit Bid'}</Text>
      </TouchableOpacity>
      {editingBid && (
        <TouchableOpacity style={styles.cancelEditBtn} onPress={() => setEditingBid(false)}>
          <Text style={styles.cancelEditBtnText}>Cancel</Text>
        </TouchableOpacity>
      )}
    </>
  )

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {headerJSX}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">

        {/* Job card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.category}>{job.category}</Text>
            <Text style={styles.price}>
              {job.price_type === 'fixed' ? `$${job.price} NZD` : 'Open to Bids'}
            </Text>
          </View>
          <Text style={styles.title} accessibilityRole="header">{job.title}</Text>
          <Text style={styles.description}>{job.description}</Text>

          {/* Feature 1: materials/access */}
          {job.materials_type && (
            <View style={styles.accessRow}>
              <Text style={styles.accessIcon}>🔧</Text>
              <Text style={styles.accessText}>{MATERIALS_LABELS[job.materials_type] || job.materials_type}</Text>
            </View>
          )}
          {job.access_conditions?.length > 0 && (
            <View style={styles.accessRow}>
              <Text style={styles.accessIcon}>🚗</Text>
              <Text style={styles.accessText}>{job.access_conditions.map(c => ACCESS_LABELS[c] || c).join(', ')}</Text>
            </View>
          )}
          {job.location_note ? (
            <View style={styles.accessRow}>
              <Text style={styles.accessIcon}>📝</Text>
              <Text style={styles.accessText}>{job.location_note}</Text>
            </View>
          ) : null}

          {job.photos?.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.photoStrip} style={styles.photoStripWrap}>
              {job.photos.map((url, i) => (
                <Image key={i} source={{ uri: url }} style={styles.photoStripImg} />
              ))}
            </ScrollView>
          )}

          {!!(job.latitude && job.longitude) && (
            <TouchableOpacity style={styles.mapThumbWrap}
              onPress={() => navigation.navigate('JobMap', { job, requesterName: requesterProfile?.full_name || 'Requester' })}
              activeOpacity={0.9} accessibilityRole="button" accessibilityLabel="View job on map">
              <Image source={{ uri: jobStaticMapUrl(job) }} style={styles.mapThumbImg} resizeMode="cover" />
              {job.area_hectares ? (
                <View style={styles.mapAreaBadge}>
                  <Text style={styles.mapAreaBadgeText}>{job.area_hectares} ha</Text>
                </View>
              ) : null}
              <View style={styles.mapTapHint}>
                <Text style={styles.mapTapHintText}>Tap to navigate →</Text>
              </View>
            </TouchableOpacity>
          )}

          <Text style={styles.location}>📍 {job.location_name}</Text>
          {job.location_note ? <Text style={styles.locationNote}>📝 {job.location_note}</Text> : null}
          <Text style={styles.status}>Status: {job.status.toUpperCase()}</Text>
        </View>

        {/* Feature 2: Q&A section */}
        {job.status === 'open' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Questions & Answers</Text>
            {questions.length === 0 && (
              <Text style={styles.noQuestionsText}>No questions yet.</Text>
            )}
            {questions.map(q => (
              <View key={q.id} style={styles.questionCard}>
                <View style={styles.questionRow}>
                  <Text style={styles.questionAsker}>{q.askerName}</Text>
                  <Text style={styles.questionDate}>
                    {new Date(q.created_at).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' })}
                  </Text>
                </View>
                <Text style={styles.questionText}>{q.question}</Text>
                {q.answer ? (
                  <View style={styles.answerBlock}>
                    <Text style={styles.answerLabel}>Answer:</Text>
                    <Text style={styles.answerText}>{q.answer}</Text>
                  </View>
                ) : isJobOwner ? (
                  answeringId === q.id ? (
                    <View style={styles.answerInputBlock}>
                      <TextInput
                        style={[styles.input, styles.multiline]}
                        placeholder="Type your answer..."
                        value={answerText}
                        onChangeText={setAnswerText}
                        multiline numberOfLines={3}
                        textAlignVertical="top"
                        autoFocus
                        accessibilityLabel="Answer"
                      />
                      <View style={styles.qaActionRow}>
                        <TouchableOpacity style={styles.answerSubmitBtn}
                          onPress={() => handleAnswerQuestion(q.id)} disabled={submittingQ}>
                          <Text style={styles.answerSubmitBtnText}>{submittingQ ? 'Saving...' : 'Post answer'}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => { setAnsweringId(null); setAnswerText('') }}>
                          <Text style={styles.cancelEditBtnText}>Cancel</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <TouchableOpacity onPress={() => { setAnsweringId(q.id); setAnswerText('') }}
                      style={styles.answerBtn}>
                      <Text style={styles.answerBtnText}>Answer this question</Text>
                    </TouchableOpacity>
                  )
                ) : (
                  <Text style={styles.pendingAnswerText}>Awaiting answer from requester</Text>
                )}
              </View>
            ))}
            {!isJobOwner && currentUser && (
              showAskInput ? (
                <View>
                  <TextInput
                    style={[styles.input, styles.multiline]}
                    placeholder="Ask the requester a question about this job..."
                    value={askText}
                    onChangeText={setAskText}
                    multiline numberOfLines={3}
                    textAlignVertical="top"
                    autoFocus
                    accessibilityLabel="Your question"
                  />
                  <View style={styles.qaActionRow}>
                    <TouchableOpacity style={styles.answerSubmitBtn}
                      onPress={handleAskQuestion} disabled={submittingQ || !askText.trim()}>
                      <Text style={styles.answerSubmitBtnText}>{submittingQ ? 'Posting...' : 'Post question'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => { setShowAskInput(false); setAskText('') }}>
                      <Text style={styles.cancelEditBtnText}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <TouchableOpacity style={styles.askBtn} onPress={() => setShowAskInput(true)}
                  accessibilityRole="button" accessibilityLabel="Ask a question">
                  <Text style={styles.askBtnText}>Ask a question</Text>
                </TouchableOpacity>
              )
            )}
          </View>
        )}

        {/* Features 3 & 4: Bid section for providers */}
        {canBid && (
          <View style={styles.section}>
            {alreadyBid && !editingBid ? (
              <>
                <Text style={styles.sectionTitle}>Your bid</Text>
                <View style={styles.myBidSummary}>
                  <Text style={styles.myBidAmount}>${Number(myBid?.amount || 0).toFixed(2)} NZD</Text>
                  {myBid?.line_items?.length > 1 && (
                    <View style={styles.lineItemsBreakdown}>
                      {myBid.line_items.map((li, i) => (
                        <View key={i} style={styles.breakdownRow}>
                          <Text style={styles.breakdownLabel}>{li.label}</Text>
                          <Text style={styles.breakdownAmount}>${(li.amount || 0).toFixed(2)}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                  {myBid?.message ? <Text style={styles.myBidMessage}>{myBid.message}</Text> : null}
                  {myBid?.available_from && (
                    <Text style={styles.myBidMeta}>📅 Available from: {new Date(myBid.available_from).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
                  )}
                  {myBid?.estimated_duration && (
                    <Text style={styles.myBidMeta}>⏱ Est. duration: {myBid.estimated_duration}</Text>
                  )}
                  <Text style={styles.myBidStatus}>Status: {myBid?.status?.toUpperCase()}</Text>
                </View>
                {myBid?.status === 'pending' && (
                  <TouchableOpacity style={styles.editBidBtn} onPress={() => setEditingBid(true)}
                    accessibilityRole="button" accessibilityLabel="Edit your bid">
                    <Text style={styles.editBidBtnText}>Edit bid</Text>
                  </TouchableOpacity>
                )}
              </>
            ) : (
              <>
                <Text style={styles.sectionTitle}>{editingBid ? 'Edit your bid' : 'Place a Bid'}</Text>
                {bidFormJSX}
              </>
            )}
          </View>
        )}

        {/* Bids list for job owner */}
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
                {bid.message ? <Text style={styles.bidMessage}>{bid.message}</Text> : null}
                {bid.available_from && (
                  <Text style={styles.bidMeta}>📅 Available: {new Date(bid.available_from).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
                )}
                {bid.estimated_duration && (
                  <Text style={styles.bidMeta}>⏱ Est. duration: {bid.estimated_duration}</Text>
                )}
                <Text style={styles.bidStatus}>Status: {bid.status.toUpperCase()}</Text>
                {bid.status === 'pending' && job.status === 'open' && (
                  <TouchableOpacity style={styles.acceptButton} onPress={() => handleAcceptBid(bid)}
                    accessibilityRole="button" accessibilityLabel={`Accept bid from ${bid.profiles?.full_name}`}>
                    <Text style={styles.acceptButtonText}>✓ Accept This Bid</Text>
                  </TouchableOpacity>
                )}
                {bid.status === 'accepted' && (
                  <>
                    <TouchableOpacity style={styles.chatButton}
                      onPress={() => navigation.navigate('Chat', {
                        jobId: job.id, jobTitle: job.title,
                        otherUserId: bid.provider_id,
                        otherUserName: bid.profiles?.full_name || 'Provider',
                      })}
                      accessibilityRole="button" accessibilityLabel={`Chat with ${bid.profiles?.full_name}`}>
                      <Text style={styles.chatButtonText}>💬 Chat with Provider</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.viewProviderBtn}
                      onPress={() => navigation.navigate('ProviderProfile', { providerId: bid.provider_id })}
                      accessibilityRole="button" accessibilityLabel={`View ${bid.profiles?.full_name}'s profile`}>
                      <Text style={styles.viewProviderBtnText}>View provider profile</Text>
                    </TouchableOpacity>
                  </>
                )}
              </PressableCard>
            ))}
          </View>
        )}
        <View style={{ height: insets.bottom + 24 }} />
      </ScrollView>
      </KeyboardAvoidingView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 16 },

  header: {
    backgroundColor: colors.background,
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  headerTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  backBtn:     { minHeight: 36, justifyContent: 'center' },
  backBtnText: { color: colors.primary, fontSize: 15, fontWeight: '600' },
  kicker:      { fontSize: 13, fontWeight: '700', color: colors.primary, marginBottom: 8 },
  headerTitle: { fontSize: 34, lineHeight: 38, fontWeight: '700', color: colors.textPrimary },

  watchBtn:       { width: 40, height: 40, borderRadius: 20, backgroundColor: '#f0f0f0', alignItems: 'center', justifyContent: 'center', opacity: 0.55 },
  watchBtnActive: { backgroundColor: '#ede7f6', opacity: 1 },
  watchBtnText:   { fontSize: 18 },

  card: { backgroundColor: colors.white, borderRadius: 12, padding: 16, marginBottom: 16, elevation: 2, borderWidth: 1, borderColor: colors.border },
  cardHeader:  { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  category:    { backgroundColor: colors.primaryLight, color: colors.primary, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, fontSize: 13, fontWeight: '600' },
  price:       { fontWeight: 'bold', color: colors.primary, fontSize: 15 },
  title:       { fontSize: 20, fontWeight: 'bold', color: colors.textPrimary, marginBottom: 8 },
  description: { color: colors.textSecondary, fontSize: 15, marginBottom: 10, lineHeight: 24 },
  location:    { color: colors.textMuted, fontSize: 14, marginBottom: 6 },
  status:      { color: colors.textMuted, fontSize: 13 },

  // Feature 1: materials/access
  accessRow:  { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: 5 },
  accessIcon: { fontSize: 14 },
  accessText: { fontSize: 13, color: colors.textSecondary, flex: 1, lineHeight: 18 },

  section:      { backgroundColor: colors.white, borderRadius: 12, padding: 16, marginBottom: 16, elevation: 2, borderWidth: 1, borderColor: colors.border },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: colors.textPrimary, marginBottom: 14 },

  input:     { backgroundColor: colors.background, borderRadius: 8, padding: 14, fontSize: 16, borderWidth: 1, borderColor: colors.border, marginBottom: 10 },
  multiline: { height: 90, textAlignVertical: 'top' },
  button:    { backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 16, alignItems: 'center', minHeight: 52, justifyContent: 'center' },
  buttonText:{ color: colors.white, fontSize: 16, fontWeight: 'bold' },

  // Feature 4: line items
  lineItemRow:     { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  lineItemLabel:   { flex: 1, marginBottom: 0 },
  lineItemAmount:  { width: 90, marginBottom: 0 },
  removeItemBtn:   { color: colors.textMuted, fontSize: 18, paddingHorizontal: 4 },
  addLineItemBtn:  { paddingVertical: 6, marginBottom: 4 },
  addLineItemText: { color: colors.primary, fontSize: 14, fontWeight: '600' },
  bidTotalRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#e8e8e8', marginBottom: 10 },
  bidTotalLabel:   { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  bidTotalAmount:  { fontSize: 16, fontWeight: '700', color: colors.primary },

  availabilityBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.background, borderRadius: 8, padding: 14, borderWidth: 1, borderColor: colors.border, marginBottom: 10 },
  availabilityBtnText: { color: colors.textSecondary, fontSize: 14, flex: 1 },
  clearDateBtn:        { color: colors.textMuted, fontSize: 16 },

  // Feature 3: editable bids
  myBidSummary: { backgroundColor: '#f9f9f9', borderRadius: 10, padding: 12, marginBottom: 10 },
  myBidAmount:  { fontSize: 18, fontWeight: '700', color: colors.primary, marginBottom: 4 },
  myBidMessage: { fontSize: 14, color: colors.textSecondary, marginBottom: 4 },
  myBidMeta:    { fontSize: 13, color: colors.textMuted, marginBottom: 2 },
  myBidStatus:  { fontSize: 12, color: colors.textMuted, marginTop: 4 },
  editBidBtn:      { borderWidth: 1.5, borderColor: colors.primary, borderRadius: 8, paddingVertical: 12, alignItems: 'center', marginTop: 4, minHeight: 44 },
  editBidBtnText:  { color: colors.primary, fontWeight: '700', fontSize: 14 },
  cancelEditBtn:   { paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  cancelEditBtnText: { color: colors.textMuted, fontSize: 14 },

  // Line items breakdown (bid display)
  lineItemsBreakdown: { marginVertical: 6, paddingVertical: 6, borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#e8e8e8' },
  breakdownRow:       { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  breakdownLabel:     { fontSize: 13, color: colors.textSecondary },
  breakdownAmount:    { fontSize: 13, color: colors.textPrimary, fontWeight: '600' },

  // Bids list
  bidCard:    { backgroundColor: '#f9f9f9', borderRadius: 10, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.border },
  bidHeader:  { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  bidName:    { fontWeight: 'bold', fontSize: 16, color: colors.textPrimary },
  bidAmount:  { fontWeight: 'bold', fontSize: 16, color: colors.primary },
  bidMessage: { color: colors.textSecondary, fontSize: 14, marginBottom: 6 },
  bidMeta:    { fontSize: 13, color: colors.textMuted, marginBottom: 2 },
  bidStatus:  { color: colors.textMuted, fontSize: 13, marginBottom: 8, marginTop: 4 },
  acceptButton:     { backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 14, alignItems: 'center', minHeight: 52, justifyContent: 'center' },
  acceptButtonText: { color: colors.white, fontWeight: 'bold', fontSize: 15 },
  chatButton:       { backgroundColor: colors.info, borderRadius: 8, paddingVertical: 14, alignItems: 'center', marginTop: 6, minHeight: 52, justifyContent: 'center' },
  chatButtonText:   { color: colors.white, fontWeight: 'bold', fontSize: 15 },
  viewProviderBtn:     { borderWidth: 1.5, borderColor: colors.primary, borderRadius: 8, paddingVertical: 14, alignItems: 'center', marginTop: 6, minHeight: 52, justifyContent: 'center' },
  viewProviderBtnText: { color: colors.primary, fontWeight: '700', fontSize: 15 },

  // Photos
  photoStripWrap: { marginBottom: 10, marginHorizontal: -4 },
  photoStrip:     { gap: 8, paddingHorizontal: 4, paddingVertical: 2 },
  photoStripImg:  { width: 100, height: 100, borderRadius: 8, backgroundColor: '#f0f0f0' },

  // Map thumbnail
  mapThumbWrap:      { borderRadius: 10, overflow: 'hidden', marginBottom: 10, position: 'relative', height: 130 },
  mapThumbImg:       { width: '100%', height: 130, backgroundColor: '#e0e0e0' },
  mapAreaBadge:      { position: 'absolute', top: 8, left: 8, backgroundColor: colors.primary, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  mapAreaBadgeText:  { fontSize: 11, fontWeight: '700', color: colors.white },
  mapTapHint:        { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.45)', paddingVertical: 6, alignItems: 'center' },
  mapTapHintText:    { fontSize: 12, fontWeight: '600', color: colors.white },
  locationNote:      { color: colors.textMuted, fontSize: 13, marginBottom: 6, lineHeight: 18 },

  // Feature 2: Q&A
  noQuestionsText: { color: colors.textMuted, fontSize: 14, marginBottom: 12 },
  questionCard:    { backgroundColor: '#f9f9f9', borderRadius: 10, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: '#e8e8e8' },
  questionRow:     { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  questionAsker:   { fontSize: 13, fontWeight: '700', color: colors.textPrimary },
  questionDate:    { fontSize: 12, color: colors.textMuted },
  questionText:    { fontSize: 14, color: '#333', lineHeight: 20, marginBottom: 8 },
  answerBlock:     { backgroundColor: '#f0faf5', borderRadius: 8, padding: 10, borderLeftWidth: 3, borderLeftColor: colors.primary },
  answerLabel:     { fontSize: 12, fontWeight: '700', color: colors.primary, marginBottom: 4 },
  answerText:      { fontSize: 14, color: '#333', lineHeight: 20 },
  pendingAnswerText: { fontSize: 13, color: colors.textMuted, fontStyle: 'italic' },
  answerBtn:         { paddingVertical: 6 },
  answerBtnText:     { fontSize: 13, color: colors.primary, fontWeight: '600' },
  answerInputBlock:  { marginTop: 8 },
  qaActionRow:       { flexDirection: 'row', gap: 12, alignItems: 'center', marginTop: 8 },
  answerSubmitBtn:   { backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 16 },
  answerSubmitBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  askBtn:            { borderWidth: 1.5, borderColor: colors.primary, borderRadius: 8, paddingVertical: 12, alignItems: 'center', marginTop: 8 },
  askBtnText:        { color: colors.primary, fontWeight: '600', fontSize: 14 },

  // Provider accepted view
  acceptedCard:       { backgroundColor: colors.white, borderRadius: 12, padding: 16, marginBottom: 12, elevation: 2, borderWidth: 1.5, borderColor: colors.primary },
  acceptedCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 8 },
  acceptedBadge:      { backgroundColor: colors.primaryLight, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, flexShrink: 0 },
  acceptedBadgeText:  { fontSize: 12, fontWeight: '700', color: colors.primary },
  infoBoxGreen:       { backgroundColor: colors.primaryLight, borderRadius: 8, padding: 12, marginTop: 10 },
  infoBoxGreenText:   { fontSize: 14, color: colors.primary, lineHeight: 20 },

  chatBanner:         { backgroundColor: colors.primary, borderRadius: 14, marginBottom: 16, flexDirection: 'row', alignItems: 'center', paddingVertical: 18, paddingHorizontal: 18, minHeight: 72 },
  chatBannerIcon:     { fontSize: 26, marginRight: 14 },
  chatBannerContent:  { flex: 1 },
  chatBannerTitle:    { fontSize: 16, fontWeight: '700', color: colors.white, marginBottom: 2 },
  chatBannerSubtitle: { fontSize: 13, color: 'rgba(255,255,255,0.8)' },
  chatBannerArrow:    { fontSize: 30, color: 'rgba(255,255,255,0.7)', fontWeight: '300', marginLeft: 8 },

  detailRow:   { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#f2f2f2' },
  detailLabel: { fontSize: 13, color: colors.textMuted, fontWeight: '600', flex: 0, marginRight: 12 },
  detailValue: { fontSize: 13, color: colors.textPrimary, fontWeight: '500', textAlign: 'right', flex: 1 },

  bigBtnGreen:     { backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 16, alignItems: 'center', minHeight: 52, justifyContent: 'center', marginBottom: 10 },
  bigBtnGreenText: { color: colors.white, fontSize: 16, fontWeight: '700' },
  bigBtnOutline:     { borderWidth: 1.5, borderColor: colors.primary, borderRadius: 10, paddingVertical: 16, alignItems: 'center', minHeight: 52, justifyContent: 'center' },
  bigBtnOutlineText: { color: colors.primary, fontSize: 16, fontWeight: '700' },

  infoBoxBlue:     { backgroundColor: colors.infoLight, borderRadius: 10, padding: 14, marginBottom: 16 },
  infoBoxBlueText: { fontSize: 14, color: colors.info, lineHeight: 20 },
})
