import React, { useEffect, useRef, useState } from 'react'
import { Alert, Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import DateTimePicker from '@react-native-community/datetimepicker'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../lib/supabase'
import { jobStatusLabel } from '../lib/lifecycle'
import { markJobComplete, confirmJobComplete, acceptBid } from '../lib/jobActions'
import { OFFER_PRICING_TYPES, OFFER_MATERIALS_OPTIONS, OFFER_MATERIALS_LABELS, formatOfferAmount, offerStatusLabel } from '../lib/offers'
import ReceivedReview from '../components/ReceivedReview'
import Icon from '../components/Icon'
import EmptyState from '../components/EmptyState'
import Button from '../components/Button'
import { colors } from '../theme/tokens'
import PressableCard from '../components/PressableCard'
import ReviewModal from '../components/ReviewModal'
import { trackEvent } from '../lib/analytics'
import { addToWatchlist, removeFromWatchlist } from '../lib/watchlist'
import { loadReview, saveReview } from '../lib/reviews'
import { fetchProviderStats } from '../lib/providerStats'
import { staticMapUrl, staticMapPolygonUrl } from '../lib/maps'

const MATERIALS_LABELS = {
  none:      'No materials needed',
  requester: 'Requester supplies materials',
  provider:  'Provider to supply materials',
}
const ACCESS_LABELS = {
  park_and_walk:  'Park and walk in',
  '4wd_required': '4WD required',
  dogs_on_property: 'Dogs on property',
  livestock_nearby: 'Livestock nearby',
  electric_fences: 'Electric fences',
  contact_before_arrival: 'Contact before arrival',
}

function jobStaticMapUrl(job) {
  if (job.area_polygon?.length >= 3) {
    return staticMapPolygonUrl(job.area_polygon, { zoom: 13, width: 700, height: 200 })
  }
  return staticMapUrl(parseFloat(job.latitude), parseFloat(job.longitude), { zoom: 13, width: 700, height: 200 })
}

function jobBudget(job) {
  return job.price_type === 'fixed' ? `$${job.price} NZD`
    : job.price_type === 'unpaid' ? 'Free / in-kind'
    : 'Open to offers'
}

function jobLocation(job) {
  return job.location_name || job.location_area || "Location shared once you're accepted"
}

function jobDates(job) {
  if (!job.date_from || !job.date_to) return null
  try {
    const opt = { day: 'numeric', month: 'short', year: 'numeric' }
    return `${new Date(job.date_from).toLocaleDateString('en-NZ', opt)} – ${new Date(job.date_to).toLocaleDateString('en-NZ', opt)}`
  } catch { return null }
}

export default function JobDetailScreen({ route, navigation }) {
  const insets = useSafeAreaInsets()
  const { job: initialJob } = route.params
  // When the owner drilled in here from Manage job (to review offers / Q&A),
  // hide the "Manage job" shortcut so Back returns straight to Manage rather
  // than stacking another management screen.
  const fromManage = route.params?.fromManage === true
  const [job, setJob] = useState(initialJob)
  const [bids, setBids] = useState([])
  const [loading, setLoading] = useState(false)
  const [currentUser, setCurrentUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [alreadyBid, setAlreadyBid] = useState(false)
  const [myBid, setMyBid] = useState(null)
  const [requesterProfile, setRequesterProfile] = useState(null)
  const [myInvite, setMyInvite] = useState(null)
  const [isWatched, setIsWatched] = useState(false)
  const [requesterReview, setRequesterReview] = useState(null)
  const [reviewVisible, setReviewVisible] = useState(false)
  const [savingReview, setSavingReview] = useState(false)
  const [receivedReview, setReceivedReview] = useState(null)

  // Requester-side: confirm completion + review the provider
  const [providerReview, setProviderReview] = useState(null)
  const [providerReviewVisible, setProviderReviewVisible] = useState(false)
  const [savingProviderReview, setSavingProviderReview] = useState(false)

  // Bid form state (Features 3 & 4)
  const [editingBid,        setEditingBid]        = useState(false)
  const [lineItems,         setLineItems]         = useState([{ label: 'Labour', amount: '' }])
  const [bidMessage,        setBidMessage]        = useState('')
  const [availableFrom,     setAvailableFrom]     = useState(null)
  const [showDatePicker,    setShowDatePicker]    = useState(false)
  const [estimatedDuration, setEstimatedDuration] = useState('')
  const [bidPricingType,    setBidPricingType]    = useState('fixed')
  const [bidMaterials,      setBidMaterials]      = useState('included')

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
    fetchReceivedReview()
  }, [job.status, currentUser?.id, myBid?.id])

  useEffect(() => {
    const isOwner = currentUser?.id === job.requester_id
    if (!isOwner || job.status !== 'completed' || !currentUser?.id) return
    fetchProviderReview()
  }, [job.status, currentUser?.id])

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
      const providerIds = [...new Set(bidsData.map(b => b.provider_id))]
      const [{ data: providerProfiles }, stats] = await Promise.all([
        supabase.from('profiles_public').select('id, full_name, avatar_url').in('id', providerIds),
        fetchProviderStats(providerIds),
      ])
      setBids(bidsData.map(bid => ({
        ...bid,
        profiles: providerProfiles?.find(p => p.id === bid.provider_id),
        stats: stats[bid.provider_id] || { ratingAvg: 0, ratingCount: 0, jobsDone: 0 },
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
      setBidPricingType(existingBid.pricing_type || 'fixed')
      setBidMaterials(existingBid.materials || 'included')
      if (existingBid.available_from) setAvailableFrom(new Date(existingBid.available_from))
    } else {
      setAlreadyBid(false)
      setMyBid(null)
    }

    const { data: reqProfile } = await supabase
      .from('profiles_public').select('id, full_name, avatar_url').eq('id', currentJob.requester_id).single()
    setRequesterProfile(reqProfile)

    // Invited-provider context: show the "you were invited" banner, and mark the
    // invite seen so the requester can tell it's been opened.
    if (currentJob.visibility === 'invite_only' && currentJob.requester_id !== user.id) {
      const { data: inv } = await supabase
        .from('job_invites')
        .select('id, status')
        .eq('job_id', currentJob.id)
        .eq('provider_id', user.id)
        .maybeSingle()
      setMyInvite(inv || null)
      if (inv && inv.status === 'pending') {
        supabase.from('job_invites').update({ status: 'seen' }).eq('id', inv.id).then(() => {})
      }
    } else {
      setMyInvite(null)
    }

    const { data: watchData } = await supabase
      .from('watchlist').select('id').eq('user_id', user.id).eq('job_id', currentJob.id).maybeSingle()
    setIsWatched(!!watchData)

    // Q&A fetch (Feature 2)
    try {
      const { data: qs } = await supabase
        .from('job_questions').select('*').eq('job_id', currentJob.id).order('created_at', { ascending: true })
      if (qs?.length > 0) {
        const askerIds = [...new Set(qs.map(q => q.asker_id).filter(Boolean))]
        const { data: askerProfiles } = await supabase.from('profiles_public').select('id, full_name').in('id', askerIds)
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

  // The requester's review of me (the provider), shown on the completed job.
  async function fetchReceivedReview() {
    try {
      const { data } = await supabase
        .from('reviews')
        .select('rating, comment')
        .eq('job_id', job.id)
        .eq('reviewee_id', currentUser.id)
        .eq('reviewer_role', 'requester')
        .maybeSingle()
      setReceivedReview(data || null)
    } catch { }
  }

  async function fetchProviderReview() {
    try {
      const review = await loadReview({ jobId: job.id, reviewerId: currentUser.id, reviewerRole: 'requester' })
      setProviderReview(review)
    } catch { }
  }

  function handleConfirmComplete() {
    Alert.alert('Confirm complete', 'Mark this job as complete? This confirms the work is done.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Confirm',
        onPress: async () => {
          const { error } = await confirmJobComplete(job.id, currentUser.id)
          if (error) {
            Alert.alert('Could not confirm', error.message)
            if (error.code === 'stale') fetchData()
            return
          }
          trackEvent('job_completed', { job_id: job.id })
          setJob(prev => ({ ...prev, status: 'completed' }))
          const accepted = bids.find(b => b.status === 'accepted')
          if (accepted?.provider_id) {
            setProviderReviewVisible(true)
          } else {
            Alert.alert('Job completed', 'This job has been marked complete.')
          }
        },
      },
    ])
  }

  async function handleSubmitProviderReview({ rating, comment }) {
    const accepted = bids.find(b => b.status === 'accepted')
    if (!currentUser?.id || !accepted?.provider_id) return
    setSavingProviderReview(true)
    try {
      const review = await saveReview({
        jobId: job.id, reviewerId: currentUser.id, revieweeId: accepted.provider_id,
        reviewerRole: 'requester', revieweeRole: 'provider', rating, comment,
      })
      setProviderReview(review)
      setProviderReviewVisible(false)
      Alert.alert('Review saved', 'Thanks for your feedback.')
    } catch (error) {
      Alert.alert('Could not save review', error.message)
    } finally {
      setSavingProviderReview(false)
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
    if (!total || total <= 0) { Alert.alert('Missing Amount', 'Please enter an offer amount'); return }
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
      pricing_type:       bidPricingType,
      materials:          job.materials_type === 'provider' ? bidMaterials : null,
    })
    if (error) {
      Alert.alert('Error', error.message)
    } else {
      trackEvent('bid_placed', { job_id: job.id, amount: total })
      Alert.alert('Offer sent!', 'Your offer has been submitted successfully.')
      setAlreadyBid(true)
      setEditingBid(false)
      fetchData()
    }
    setLoading(false)
  }

  async function handleUpdateBid() {
    if (!myBid) return
    const total = getBidTotal()
    if (!total || total <= 0) { Alert.alert('Missing Amount', 'Please enter an offer amount'); return }
    setLoading(true)
    const { error } = await supabase.from('bids').update({
      amount:             total,
      message:            bidMessage,
      line_items:         buildLineItemsPayload(),
      available_from:     availableFrom ? availableFrom.toISOString().split('T')[0] : null,
      estimated_duration: estimatedDuration || null,
      pricing_type:       bidPricingType,
      materials:          job.materials_type === 'provider' ? bidMaterials : null,
    }).eq('id', myBid.id)
    if (error) {
      Alert.alert('Error', error.message)
    } else {
      Alert.alert('Offer updated!', 'Your offer has been updated.')
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
      // The job owner is notified by a database trigger.
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
      const { error } = await supabase.from('job_questions').update({
        answer:      answerText.trim(),
        answered_at: new Date().toISOString(),
      }).eq('id', questionId)
      if (error) { Alert.alert('Error', error.message); return }
      // The asker is notified by a database trigger.
      setAnsweringId(null)
      setAnswerText('')
      fetchData()
    } finally {
      setSubmittingQ(false)
    }
  }

  async function handleAcceptBid(bid) {
    Alert.alert('Accept Offer', `Accept offer of $${bid.amount} NZD from ${bid.profiles?.full_name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Accept',
        onPress: async () => {
          const { error } = await acceptBid(job, bid)
          if (error) {
            Alert.alert('Could not accept offer', error.message)
            if (error.code === 'stale') fetchData()   // re-sync offers + status
            return
          }
          trackEvent('bid_accepted', { job_id: job.id, provider_id: bid.provider_id })
          Alert.alert('Job awarded!', 'You can now chat with the provider.', [
            { text: 'OK', onPress: () => navigation.goBack() },
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

  function handleDeclineInvite() {
    if (!myInvite) return
    Alert.alert(
      'Decline this offer?',
      "It'll be removed from your invites. You can still be invited again later.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Decline',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase
              .from('job_invites').update({ status: 'declined' }).eq('id', myInvite.id)
            if (error) { Alert.alert('Could not decline', error.message); return }
            navigation.goBack()
          },
        },
      ]
    )
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
          <Icon name="chevron-back" size={18} color={colors.primary} /><Text style={styles.backBtnText}>Back</Text>
        </TouchableOpacity>
        {!isAcceptedProvider && currentUser && !isJobOwner && (
          <TouchableOpacity style={[styles.watchBtn, isWatched && styles.watchBtnActive]}
            onPress={handleWatchToggle}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel={isWatched ? 'Remove from watchlist' : 'Add to watchlist'}>
            <Icon name={isWatched ? 'bookmark' : 'bookmark-outline'} size={18} color={isWatched ? colors.primary : colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>
      <Text style={styles.kicker}>Job details</Text>
      <Text style={styles.headerTitle} accessibilityRole="header">{job.title}</Text>
    </View>
  )

  // ─── Provider accepted view ───────────────────────────────────────────────────
  if (isAcceptedProvider) {
    const requesterFirstName = requesterProfile?.full_name?.split(' ')[0] || 'the requester'
    const otherBidCount = Math.max(0, bids.length - 1)
    const budgetText = jobBudget(job)
    const isCompleted = job.status === 'completed'
    const isCancelled = job.status === 'cancelled'
    const isAwaitingCompletion = job.status === 'awaiting_completion'

    function handleChat() {
      navigation.navigate('Chat', {
        jobId: job.id, jobTitle: job.title,
        otherUserId: job.requester_id,
        otherUserName: requesterProfile?.full_name || 'Requester',
      })
    }

    function handleMarkComplete() {
      Alert.alert(
        'Mark as completed',
        `Let ${requesterFirstName} know the work is done? They'll confirm to finalise the job.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Mark completed',
            onPress: async () => {
              const { error } = await markJobComplete(job.id)
              if (error) {
                Alert.alert('Could not update', error.message)
                if (error.code === 'stale') fetchData()
                return
              }
              trackEvent('job_marked_complete', { job_id: job.id })
              setJob(prev => ({ ...prev, status: 'awaiting_completion' }))
              Alert.alert('Thanks!', `${requesterFirstName} has been asked to confirm the job is complete.`)
            },
          },
        ]
      )
    }

    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {headerJSX}
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} enabled={Platform.OS === 'android'}>
        <ScrollView style={styles.container} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets={true}>

          <View style={styles.acceptedCard}>
            <View style={styles.acceptedCardHeader}>
              <Text style={styles.category}>{job.category}</Text>
              <View style={[styles.acceptedBadge, isCancelled && styles.cancelledBadge]}>
                <Text style={[styles.acceptedBadgeText, isCancelled && styles.cancelledBadgeText]}>
                  {jobStatusLabel(job.status)}
                </Text>
              </View>
            </View>
            <Text style={styles.title}>{job.title}</Text>
            <Text style={styles.location}><Icon name="location-outline" size={13} color={colors.textMuted} /> {jobLocation(job)}</Text>
            {isCancelled ? (
              <View style={styles.cancelBox}>
                <Text style={styles.cancelBoxTitle}>This job was cancelled by the requester</Text>
                {job.cancellation_reason ? (
                  <Text style={styles.cancelBoxText}>Reason: {job.cancellation_reason}</Text>
                ) : null}
                {job.cancellation_note ? (
                  <Text style={styles.cancelBoxNote}>“{job.cancellation_note}”</Text>
                ) : null}
              </View>
            ) : (
              <View style={styles.infoBoxGreen}>
                <Text style={styles.infoBoxGreenText}>
                  {isCompleted
                    ? `This job is complete. You can now review ${requesterFirstName}.`
                    : isAwaitingCompletion
                      ? `You've marked this job done. Waiting for ${requesterFirstName} to confirm.`
                      : `This job has been awarded to you for $${myBid.amount} NZD. Use chat to confirm timing and details with ${requesterFirstName}.`}
                </Text>
              </View>
            )}
          </View>

          {(!isCompleted && !isCancelled) ? (
            <TouchableOpacity style={styles.chatBanner} onPress={handleChat} activeOpacity={0.85}
              accessibilityRole="button" accessibilityLabel={`Chat with ${requesterFirstName}`}>
              <Icon name="chatbubble-ellipses-outline" size={26} color={colors.white} style={styles.chatBannerIcon} />
              <View style={styles.chatBannerContent}>
                <Text style={styles.chatBannerTitle}>Chat with {requesterFirstName}</Text>
                <Text style={styles.chatBannerSubtitle}>Confirm timing and details</Text>
              </View>
              <Icon name="chevron-forward" size={24} color="rgba(255,255,255,0.7)" />
            </TouchableOpacity>
          ) : null}

          {isCompleted && <ReceivedReview review={receivedReview} fromLabel="requester" />}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Job details</Text>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Category</Text>
              <Text style={styles.detailValue}>{job.category}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Location</Text>
              <Text style={styles.detailValue}>{jobLocation(job)}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Budget</Text>
              <Text style={styles.detailValue}>{budgetText}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Your offer</Text>
              <Text style={[styles.detailValue, { color: colors.primary, fontWeight: '700' }]}>{formatOfferAmount(myBid.amount, myBid.pricing_type)}</Text>
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
              <Button
                icon="navigate-outline"
                title="Navigate to job"
                onPress={() => navigation.navigate('JobMap', { job, requesterName: requesterProfile?.full_name || 'Requester' })}
                style={{ marginBottom: 10 }}
              />
            )}
            {(!isCompleted && !isCancelled) ? (
              isAwaitingCompletion ? (
                <View style={styles.awaitingBox}>
                  <Text style={styles.awaitingBoxText}>
                    <Icon name="hourglass-outline" size={14} color="#92400e" /> Waiting for {requesterFirstName} to confirm completion.
                  </Text>
                </View>
              ) : (
                <Button
                  icon="checkmark"
                  title="Mark as completed"
                  onPress={handleMarkComplete}
                  style={{ marginBottom: 10 }}
                  accessibilityLabel="Mark job as completed"
                />
              )
            ) : null}
            {isCompleted ? (
              <Button
                title={requesterReview ? `Edit review (${requesterReview.rating}/5)` : 'Review requester'}
                onPress={() => setReviewVisible(true)}
                style={{ marginBottom: 10 }}
                accessibilityLabel={requesterReview ? 'Edit requester review' : 'Review requester'}
              />
            ) : null}
            <Button
              variant="secondary"
              title="View requester profile"
              onPress={() => navigation.navigate('RequesterProfile', { requesterId: job.requester_id })}
            />
          </View>

          {!isCancelled && (
            <View style={styles.infoBoxBlue}>
              <Text style={styles.infoBoxBlueText}>
                {otherBidCount > 0
                  ? `${otherBidCount} other offer${otherBidCount !== 1 ? 's were' : ' was'} not accepted. Your offer of $${myBid.amount} NZD was the winning offer.`
                  : `Your offer of $${myBid.amount} NZD was the only offer — you got it!`}
              </Text>
            </View>
          )}
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
  const acceptedBid = bids.find(b => b.status === 'accepted')
  const acceptedProviderName = acceptedBid?.profiles?.full_name || 'the provider'

  const bidFormJSX = (
    <>
      <View style={styles.privacyNote}>
        <Icon name="lock-closed-outline" size={14} color={colors.primary} />
        <Text style={styles.privacyNoteText}>
          Your offer is private — only you and the requester see it. Other offers stay private too, so send your best availability and approach.
        </Text>
      </View>

      <Text style={styles.offerLabel}>How is your price based?</Text>
      <View style={styles.offerSegRow}>
        {OFFER_PRICING_TYPES.map(o => (
          <TouchableOpacity
            key={o.id}
            style={[styles.offerSeg, bidPricingType === o.id && styles.offerSegActive]}
            onPress={() => setBidPricingType(o.id)}
            accessibilityRole="button"
            accessibilityState={{ selected: bidPricingType === o.id }}>
            <Text style={[styles.offerSegText, bidPricingType === o.id && styles.offerSegTextActive]}>{o.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

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
              <Icon name="close" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      ))}
      <TouchableOpacity onPress={addLineItem} style={styles.addLineItemBtn}>
        <Text style={styles.addLineItemText}>+ Add line item</Text>
      </TouchableOpacity>
      {lineItems.length > 1 && (
        <View style={styles.bidTotalRow}>
          <Text style={styles.bidTotalLabel}>Offer total</Text>
          <Text style={styles.bidTotalAmount}>${bidTotal.toFixed(2)} NZD</Text>
        </View>
      )}

      {job.materials_type === 'provider' && (
        <>
          <Text style={styles.offerLabel}>This job needs you to supply materials — how are they priced?</Text>
          <View style={styles.offerSegRow}>
            {OFFER_MATERIALS_OPTIONS.map(o => (
              <TouchableOpacity
                key={o.id}
                style={[styles.offerSeg, bidMaterials === o.id && styles.offerSegActive]}
                onPress={() => setBidMaterials(o.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: bidMaterials === o.id }}>
                <Text style={[styles.offerSegText, bidMaterials === o.id && styles.offerSegTextActive]}>{o.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
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
          <Icon name="calendar-outline" size={14} color={colors.textSecondary} /> {availableFrom
            ? `Available from ${availableFrom.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })}`
            : 'Set availability date (optional)'}
        </Text>
        {availableFrom && (
          <TouchableOpacity onPress={() => setAvailableFrom(null)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Icon name="close" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </TouchableOpacity>
      {showDatePicker && (
        <DateTimePicker
          value={availableFrom || new Date()}
          mode="date"
          display="default"
          minimumDate={new Date()}
          onChange={(event, selected) => {
            if (Platform.OS === 'android') setShowDatePicker(false)
            if (event?.type !== 'dismissed' && selected) setAvailableFrom(selected)
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

      <Button
        title={editingBid ? 'Update Offer' : 'Submit Offer'}
        onPress={editingBid ? handleUpdateBid : handlePlaceBid}
        loading={loading}
        accessibilityLabel={editingBid ? 'Update offer' : 'Submit offer'}
      />
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
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} enabled={Platform.OS === 'android'}>
      <ScrollView style={styles.container} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets={true}>

        {myInvite && (
          <View style={styles.invitedBanner}>
            <Icon name="mail-open-outline" size={20} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.invitedBannerTitle}>You were invited to this job</Text>
              <Text style={styles.invitedBannerSub}>
                {(requesterProfile?.full_name?.split(' ')[0] || 'The requester')} offered this to you directly. Make an offer below, or decline.
              </Text>
            </View>
            <TouchableOpacity
              onPress={handleDeclineInvite}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Decline this offer">
              <Text style={styles.declineLink}>Decline</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Job card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.category}>{job.category}</Text>
            <Text style={styles.price}>
              {jobBudget(job)}
            </Text>
          </View>
          <Text style={styles.title} accessibilityRole="header">{job.title}</Text>
          <Text style={styles.description}>{job.description}</Text>

          {/* Feature 1: materials/access */}
          {job.materials_type && (
            <View style={styles.accessRow}>
              <Icon name="construct-outline" size={14} color={colors.textSecondary} />
              <Text style={styles.accessText}>{MATERIALS_LABELS[job.materials_type] || job.materials_type}</Text>
            </View>
          )}
          {job.access_conditions?.length > 0 && (
            <View style={styles.accessRow}>
              <Icon name="car-outline" size={14} color={colors.textSecondary} />
              <Text style={styles.accessText}>{job.access_conditions.map(c => ACCESS_LABELS[c] || c).join(', ')}</Text>
            </View>
          )}
          {job.location_note ? (
            <View style={styles.accessRow}>
              <Icon name="document-text-outline" size={14} color={colors.textSecondary} />
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
                <Text style={styles.mapTapHintText}>Tap to navigate <Icon name="arrow-forward" size={12} color={colors.white} /></Text>
              </View>
            </TouchableOpacity>
          )}

          <Text style={styles.location}><Icon name="location-outline" size={13} color={colors.textMuted} /> {jobLocation(job)}</Text>
          {job.hide_exact_location && !job.location_name ? (
            <Text style={styles.locationNote}><Icon name="lock-closed-outline" size={12} color={colors.textMuted} /> Exact address is shared once your offer is accepted.</Text>
          ) : null}
          {job.location_note ? <Text style={styles.locationNote}><Icon name="document-text-outline" size={12} color={colors.textMuted} /> {job.location_note}</Text> : null}
          {jobDates(job) ? <Text style={styles.locationNote}><Icon name="calendar-outline" size={12} color={colors.textMuted} /> {jobDates(job)}</Text> : null}
          <Text style={styles.status}>Status: {job.status.toUpperCase()}</Text>
        </View>

        {/* Owner shortcut to the management screen (edit / share / cancel / delete).
            Hidden when we arrived from Manage, so Back just returns there. */}
        {isJobOwner && !fromManage && (
          <Button
            icon="settings-outline"
            title="Manage job"
            onPress={() => navigation.navigate('ManageTask', { job, bidCount: bids.length })}
            style={{ marginBottom: 16 }}
            accessibilityLabel="Manage this job"
          />
        )}

        {/* Requester: provider has marked the job done — confirm + review */}
        {isJobOwner && job.status === 'awaiting_completion' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Confirm completion</Text>
            <View style={styles.infoBoxGreen}>
              <Text style={styles.infoBoxGreenText}>
                {acceptedProviderName} has marked this job as done. Confirm to finalise and leave a review.
              </Text>
            </View>
            <Button
              icon="checkmark"
              title="Confirm job complete"
              onPress={handleConfirmComplete}
              style={{ marginTop: 12 }}
              accessibilityLabel="Confirm job complete"
            />
          </View>
        )}

        {/* Requester: completed — leave / edit the provider review */}
        {isJobOwner && job.status === 'completed' && acceptedBid && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Review provider</Text>
            <Button
              title={providerReview ? `Edit review (${providerReview.rating}/5)` : `Review ${acceptedProviderName}`}
              onPress={() => setProviderReviewVisible(true)}
              accessibilityLabel={providerReview ? 'Edit provider review' : 'Review provider'}
            />
          </View>
        )}

        {/* Feature 2: Q&A section */}
        {job.status === 'open' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Questions & Answers</Text>
            {questions.length === 0 && (
              <EmptyState
                compact
                icon="chatbubbles-outline"
                title="No questions yet"
                body="Questions about this job will show up here."
              />
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
                        <Button
                          size="sm"
                          title="Post answer"
                          onPress={() => handleAnswerQuestion(q.id)}
                          loading={submittingQ}
                        />
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
                    <Button
                      size="sm"
                      title="Post question"
                      onPress={handleAskQuestion}
                      loading={submittingQ}
                      disabled={!askText.trim()}
                    />
                    <TouchableOpacity onPress={() => { setShowAskInput(false); setAskText('') }}>
                      <Text style={styles.cancelEditBtnText}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <Button
                  variant="secondary"
                  icon="help-circle-outline"
                  title="Ask a question"
                  onPress={() => setShowAskInput(true)}
                  style={{ marginTop: 8 }}
                />
              )
            )}
          </View>
        )}

        {/* Features 3 & 4: Bid section for providers */}
        {canBid && (
          <View style={styles.section}>
            {alreadyBid && !editingBid ? (
              <>
                <Text style={styles.sectionTitle}>Your offer</Text>
                <View style={styles.myBidSummary}>
                  <Text style={styles.myBidAmount}>{formatOfferAmount(Number(myBid?.amount || 0).toFixed(2), myBid?.pricing_type)}</Text>
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
                    <Text style={styles.myBidMeta}><Icon name="calendar-outline" size={12} color={colors.textMuted} /> Available from: {new Date(myBid.available_from).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
                  )}
                  {myBid?.estimated_duration && (
                    <Text style={styles.myBidMeta}><Icon name="time-outline" size={12} color={colors.textMuted} /> Est. duration: {myBid.estimated_duration}</Text>
                  )}
                  {myBid?.materials && (
                    <Text style={styles.myBidMeta}><Icon name="construct-outline" size={12} color={colors.textMuted} /> {OFFER_MATERIALS_LABELS[myBid.materials] || myBid.materials}</Text>
                  )}
                  <Text style={styles.myBidStatus}>{offerStatusLabel(myBid?.status)}</Text>
                </View>
                {myBid?.status === 'pending' && (
                  <Button
                    variant="secondary"
                    size="sm"
                    title="Edit offer"
                    onPress={() => setEditingBid(true)}
                    style={{ marginTop: 4 }}
                    accessibilityLabel="Edit your offer"
                  />
                )}
              </>
            ) : (
              <>
                <Text style={styles.sectionTitle}>{editingBid ? 'Edit your offer' : 'Make an Offer'}</Text>
                {bidFormJSX}
              </>
            )}
          </View>
        )}

        {/* Bids list for job owner */}
        {isJobOwner && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {bids.length === 0 ? 'Offers' : `${bids.length} Offer${bids.length > 1 ? 's' : ''} Received`}
            </Text>
            {bids.length > 0 && (
              <Text style={styles.offersHint}>Private to you. Choose the right fit — reputation, location, availability and price.</Text>
            )}
            {bids.length === 0 && (
              <EmptyState
                compact
                icon="pricetag-outline"
                title="No offers yet"
                body="When providers make an offer on your job, it'll appear here."
              />
            )}
            {bids.map(bid => (
              <PressableCard key={bid.id} style={styles.bidCard}>
                <View style={styles.bidHeader}>
                  <TouchableOpacity
                    style={styles.bidProvider}
                    onPress={() => navigation.navigate('ProviderProfile', { providerId: bid.provider_id })}
                    accessibilityRole="button"
                    accessibilityLabel={`View ${bid.profiles?.full_name || 'provider'}'s profile`}>
                    {bid.profiles?.avatar_url ? (
                      <Image source={{ uri: bid.profiles.avatar_url }} style={styles.bidAvatar} />
                    ) : (
                      <View style={styles.bidAvatarFallback}>
                        <Text style={styles.bidAvatarInitials}>
                          {(bid.profiles?.full_name || '?').trim().charAt(0).toUpperCase()}
                        </Text>
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.bidName} numberOfLines={1}>{bid.profiles?.full_name || 'Provider'}</Text>
                      <Text style={styles.bidProviderMeta} numberOfLines={1}>
                        {bid.stats?.ratingCount > 0
                          ? `★ ${bid.stats.ratingAvg.toFixed(1)} (${bid.stats.ratingCount})`
                          : 'New provider'}
                        {bid.stats?.jobsDone > 0 ? ` · ${bid.stats.jobsDone} done` : ''}
                      </Text>
                    </View>
                  </TouchableOpacity>
                  <Text style={styles.bidAmount}>{formatOfferAmount(bid.amount, bid.pricing_type)}</Text>
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
                  <Text style={styles.bidMeta}><Icon name="calendar-outline" size={12} color={colors.textMuted} /> Available: {new Date(bid.available_from).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
                )}
                {bid.estimated_duration && (
                  <Text style={styles.bidMeta}><Icon name="time-outline" size={12} color={colors.textMuted} /> Est. duration: {bid.estimated_duration}</Text>
                )}
                {bid.materials && (
                  <Text style={styles.bidMeta}><Icon name="construct-outline" size={12} color={colors.textMuted} /> {OFFER_MATERIALS_LABELS[bid.materials] || bid.materials}</Text>
                )}
                <Text style={styles.bidStatus}>Status: {bid.status.toUpperCase()}</Text>
                {bid.status === 'pending' && job.status === 'open' && (
                  <Button
                    icon="checkmark"
                    title="Accept This Offer"
                    onPress={() => handleAcceptBid(bid)}
                    style={{ marginTop: 4 }}
                    accessibilityLabel={`Accept offer from ${bid.profiles?.full_name}`}
                  />
                )}
                {bid.status === 'accepted' && (
                  <>
                    <Button
                      variant="secondary"
                      icon="chatbubble-ellipses-outline"
                      title="Chat with Provider"
                      onPress={() => navigation.navigate('Chat', {
                        jobId: job.id, jobTitle: job.title,
                        otherUserId: bid.provider_id,
                        otherUserName: bid.profiles?.full_name || 'Provider',
                      })}
                      style={{ marginTop: 6 }}
                      accessibilityLabel={`Chat with ${bid.profiles?.full_name}`}
                    />
                    <Button
                      variant="secondary"
                      title="View provider profile"
                      onPress={() => navigation.navigate('ProviderProfile', { providerId: bid.provider_id })}
                      style={{ marginTop: 6 }}
                      accessibilityLabel={`View ${bid.profiles?.full_name}'s profile`}
                    />
                  </>
                )}
              </PressableCard>
            ))}
          </View>
        )}
        <View style={{ height: insets.bottom + 24 }} />
      </ScrollView>
      </KeyboardAvoidingView>
      <ReviewModal
        visible={providerReviewVisible}
        title={providerReview ? 'Edit provider review' : 'Review provider'}
        subtitle={`How was working with ${acceptedProviderName}?`}
        initialRating={providerReview?.rating || 0}
        initialComment={providerReview?.comment || ''}
        saving={savingProviderReview}
        onClose={() => setProviderReviewVisible(false)}
        onSubmit={handleSubmitProviderReview}
      />
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
  backBtn:     { minHeight: 36, justifyContent: 'center', flexDirection: 'row', alignItems: 'center' },
  backBtnText: { color: colors.primary, fontSize: 15, fontWeight: '600' },
  kicker:      { fontSize: 13, fontWeight: '700', color: colors.accent, marginBottom: 8 },
  headerTitle: { fontSize: 34, lineHeight: 38, fontWeight: '700', color: colors.textPrimary },

  watchBtn:       { width: 40, height: 40, borderRadius: 20, backgroundColor: '#f0f0f0', alignItems: 'center', justifyContent: 'center', opacity: 0.55 },
  watchBtnActive: { backgroundColor: '#ede7f6', opacity: 1 },
  watchBtnText:   { fontSize: 18 },

  invitedBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: colors.primaryLight, borderRadius: 12, padding: 14, marginBottom: 16 },
  invitedBannerTitle: { fontSize: 14, fontWeight: '700', color: colors.primary },
  invitedBannerSub:   { fontSize: 12.5, color: colors.textSecondary, marginTop: 3, lineHeight: 18 },
  declineLink:        { fontSize: 13, fontWeight: '700', color: colors.danger },

  card: { backgroundColor: colors.white, borderRadius: 12, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: colors.border },
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

  section:      { backgroundColor: colors.white, borderRadius: 12, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: colors.border },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: colors.textPrimary, marginBottom: 14 },

  input:     { backgroundColor: colors.background, borderRadius: 8, padding: 14, fontSize: 16, borderWidth: 1, borderColor: colors.border, marginBottom: 10 },
  multiline: { height: 90, textAlignVertical: 'top' },

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

  // Offer pricing/materials segmented controls
  offerLabel:        { fontSize: 13, fontWeight: '700', color: colors.textSecondary, marginBottom: 8, marginTop: 4 },
  offerSegRow:       { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  offerSeg:          { borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.white },
  offerSegActive:    { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  offerSegText:      { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  offerSegTextActive:{ color: colors.primary },
  privacyNote:       { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: colors.primaryLight, borderRadius: 8, padding: 10, marginBottom: 14 },
  privacyNoteText:   { flex: 1, fontSize: 12, color: colors.primary, lineHeight: 17 },
  offersHint:        { fontSize: 12, color: colors.textMuted, marginTop: -8, marginBottom: 12, lineHeight: 17 },

  availabilityBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.background, borderRadius: 8, padding: 14, borderWidth: 1, borderColor: colors.border, marginBottom: 10 },
  availabilityBtnText: { color: colors.textSecondary, fontSize: 14, flex: 1 },
  clearDateBtn:        { color: colors.textMuted, fontSize: 16 },

  // Feature 3: editable bids
  myBidSummary: { backgroundColor: '#f9f9f9', borderRadius: 10, padding: 12, marginBottom: 10 },
  myBidAmount:  { fontSize: 18, fontWeight: '700', color: colors.primary, marginBottom: 4 },
  myBidMessage: { fontSize: 14, color: colors.textSecondary, marginBottom: 4 },
  myBidMeta:    { fontSize: 13, color: colors.textMuted, marginBottom: 2 },
  myBidStatus:  { fontSize: 12, color: colors.textMuted, marginTop: 4 },
  cancelEditBtn:   { paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  cancelEditBtnText: { color: colors.textMuted, fontSize: 14 },

  // Line items breakdown (bid display)
  lineItemsBreakdown: { marginVertical: 6, paddingVertical: 6, borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#e8e8e8' },
  breakdownRow:       { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  breakdownLabel:     { fontSize: 13, color: colors.textSecondary },
  breakdownAmount:    { fontSize: 13, color: colors.textPrimary, fontWeight: '600' },

  // Bids list
  bidCard:    { backgroundColor: '#f9f9f9', borderRadius: 10, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.border },
  bidHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  bidProvider: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 },
  bidAvatar:   { width: 38, height: 38, borderRadius: 19, marginRight: 10, backgroundColor: '#eee' },
  bidAvatarFallback: { width: 38, height: 38, borderRadius: 19, marginRight: 10, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  bidAvatarInitials: { color: colors.primary, fontWeight: '700', fontSize: 15 },
  bidProviderMeta:   { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  bidName:    { fontWeight: 'bold', fontSize: 16, color: colors.textPrimary },
  bidAmount:  { fontWeight: 'bold', fontSize: 16, color: colors.primary },
  bidMessage: { color: colors.textSecondary, fontSize: 14, marginBottom: 6 },
  bidMeta:    { fontSize: 13, color: colors.textMuted, marginBottom: 2 },
  bidStatus:  { color: colors.textMuted, fontSize: 13, marginBottom: 8, marginTop: 4 },

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

  // Provider accepted view
  acceptedCard:       { backgroundColor: colors.white, borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1.5, borderColor: colors.primary },
  acceptedCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 8 },
  acceptedBadge:      { backgroundColor: colors.primaryLight, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, flexShrink: 0 },
  acceptedBadgeText:  { fontSize: 12, fontWeight: '700', color: colors.primary },
  infoBoxGreen:       { backgroundColor: colors.primaryLight, borderRadius: 8, padding: 12, marginTop: 10 },
  infoBoxGreenText:   { fontSize: 14, color: colors.primary, lineHeight: 20 },

  cancelledBadge:     { backgroundColor: '#fee2e2' },
  cancelledBadgeText: { color: '#991b1b' },
  cancelBox:          { backgroundColor: '#fef2f2', borderRadius: 8, padding: 12, marginTop: 10, borderWidth: 1, borderColor: '#fecaca' },
  cancelBoxTitle:     { fontSize: 14, fontWeight: '700', color: '#991b1b', marginBottom: 4 },
  cancelBoxText:      { fontSize: 14, color: '#7f1d1d', lineHeight: 20, marginTop: 2 },
  cancelBoxNote:      { fontSize: 14, color: '#7f1d1d', lineHeight: 20, marginTop: 4, fontStyle: 'italic' },

  chatBanner:         { backgroundColor: colors.primary, borderRadius: 12, marginBottom: 16, flexDirection: 'row', alignItems: 'center', paddingVertical: 18, paddingHorizontal: 18, minHeight: 72 },
  chatBannerIcon:     { fontSize: 26, marginRight: 14 },
  chatBannerContent:  { flex: 1 },
  chatBannerTitle:    { fontSize: 16, fontWeight: '700', color: colors.white, marginBottom: 2 },
  chatBannerSubtitle: { fontSize: 13, color: 'rgba(255,255,255,0.8)' },
  chatBannerArrow:    { fontSize: 30, color: 'rgba(255,255,255,0.7)', fontWeight: '300', marginLeft: 8 },

  detailRow:   { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#f2f2f2' },
  detailLabel: { fontSize: 13, color: colors.textMuted, fontWeight: '600', flex: 0, marginRight: 12 },
  detailValue: { fontSize: 13, color: colors.textPrimary, fontWeight: '500', textAlign: 'right', flex: 1 },


  awaitingBox:     { backgroundColor: '#fef3c7', borderRadius: 10, padding: 14, marginBottom: 10 },
  awaitingBoxText: { fontSize: 14, color: '#92400e', lineHeight: 20, textAlign: 'center', fontWeight: '600' },

  infoBoxBlue:     { backgroundColor: colors.infoLight, borderRadius: 10, padding: 14, marginBottom: 16 },
  infoBoxBlueText: { fontSize: 14, color: colors.info, lineHeight: 20 },
})
